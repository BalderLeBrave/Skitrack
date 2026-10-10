/**
 * Relevé HomeToGo : la page du lieu, puis la recherche JSON autorisée,
 * page par page, puis le détail des offres que la liste laisse creuses.
 *
 * Le GET ne part pas par le `fetch` de Node : la page HTML reçoit un défi
 * Cloudflare (HTTP 403, « Just a moment »). `urllib` lit la recherche JSON
 * que robots.txt autorise (`/search/{id}?fsid=…&_format=json`) : elle répond,
 * l'interstitiel non. Une requête à la fois, une seconde entre deux pendant
 * la recherche. Le détail qui n'a pas tenu dans le délai part ensuite, un lot
 * toutes les deux secondes, huit minutes au plus. Un vrai 403, un 429 ou un
 * 503 arrête, sans second essai. L'écran Prix ne lance pas cette suite.
 * L'échéance rend ce qui est déjà lu.
 */

import type { Listing } from "@/lib/listings";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { attachAccess } from "../access.ts";
import { stationById } from "../stations.ts";
import { qualifierLogement } from "../stay/logement.ts";
import { estMessageRefus, poserRefus, respecterCadence } from "./gardeHote.ts";
import { allowsPath } from "./robots.ts";
import { sansDoublons, stationsDuReleve } from "./domaine.ts";
import { envWorker, trouverPython } from "./python.server.ts";
import type { LiveSearchInput } from "./types";
import {
  AMORCE_HOMETOGO,
  LOT_DETAILS,
  ORIGINE_HOMETOGO,
  PAGES_MAX,
  avecDetailOuNon,
  carteNavigation,
  compteurPublie,
  estInterstitielCloudflare,
  fondreOffre,
  idsSansDetail,
  lieuDepuisHtml,
  lireDetailsEnRetard,
  lotsDe,
  noeudNomme,
  noeudsDuNom,
  nuits,
  offreEnListing,
  offresDe,
  pageSuivante,
  plierLieu,
  retenirLieu,
  slugsLieu,
  continuerDomaine,
  type CandidatLieu,
  type LieuHomeToGo,
  type NoeudLieu,
} from "./hometogo.ts";

export type ReleveHomeToGo = {
  listings: Listing[];
  /** Le plus grand compteur publié sur les recherches qui ont abouti. */
  annoncees: number | null;
  raison: string | null;
};

type Arret = { motif: "refus" | "defi"; detail: string };

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const PAUSE_MS = 1_000;
const DELAI_MS = 15_000;
/** La suite de détails, après la réponse : plus lente que la recherche. */
const PAUSE_SUITE_MS = 2_000;
const SUITE_MAX_MS = 8 * 60 * 1000;
const MEMOIRE_MS = 60 * 60 * 1000;
const ICI = dirname(fileURLToPath(import.meta.url));

function scriptLire(): string | null {
  const candidats = [join(process.cwd(), "scrape/hometogo/lire.py"), join(ICI, "../../../scrape/hometogo/lire.py")];
  return candidats.find((p) => existsSync(p)) ?? null;
}

type CorpsLu = { status: number; texte: string; cfMitigated: string | null; retryAfter: string | null };

function acceptDe(url: string): string {
  return url.includes("_format=json") || url.includes("/searchdetails/")
    ? "application/json, text/plain;q=0.9"
    : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
}

/** Un GET. Node est un défi Cloudflare ; Python `urllib` lit la page. */
async function lireHttp(url: string, timeoutMs: number): Promise<CorpsLu | Arret> {
  const script = scriptLire();
  if (!script) return { motif: "defi", detail: "lecteur HomeToGo introuvable" };
  const python = await trouverPython(dirname(script), []);
  if (!python) return { motif: "defi", detail: "aucun Python 3 trouvé" };
  const raw = await new Promise<{ out: string; err: string }>((resolve) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let fini = false;
    const rendre = (extra = "") => {
      if (fini) return;
      fini = true;
      clearTimeout(timer);
      resolve({
        out: Buffer.concat(chunks).toString("utf8").trim(),
        err: `${Buffer.concat(errChunks).toString("utf8").trim()}${extra}`,
      });
    };
    const child = spawn(python.cmd, [...python.args, script], {
      env: envWorker({}),
      cwd: dirname(script),
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rendre("\néchéance");
    }, timeoutMs + 2_000);
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => errChunks.push(c));
    child.on("error", (err) => rendre(`\n${err.message}`));
    child.on("close", () => rendre());
    child.stdin.on("error", () => undefined);
    child.stdin.end(JSON.stringify({ url, timeout: Math.max(1, timeoutMs / 1000), accept: acceptDe(url) }));
  });
  if (!raw.out) {
    const fin = raw.err.trim().split(/\r?\n/).pop() ?? "";
    return { motif: "defi", detail: /échéance/.test(fin) ? "échéance" : fin.slice(0, 160) || "lecteur HomeToGo muet" };
  }
  let parsed: { ok?: boolean; error?: string; status?: unknown; texte?: unknown; cfMitigated?: unknown; retryAfter?: unknown };
  try {
    parsed = JSON.parse(raw.out) as typeof parsed;
  } catch {
    return { motif: "defi", detail: "réponse illisible" };
  }
  if (!parsed.ok || typeof parsed.status !== "number" || typeof parsed.texte !== "string") {
    return { motif: "defi", detail: typeof parsed.error === "string" ? parsed.error.slice(0, 160) : "réponse illisible" };
  }
  return {
    status: parsed.status,
    texte: parsed.texte,
    cfMitigated: typeof parsed.cfMitigated === "string" ? parsed.cfMitigated : null,
    retryAfter: typeof parsed.retryAfter === "string" ? parsed.retryAfter : null,
  };
}

async function lire(url: string, echeance: number): Promise<{ status: number; texte: string } | Arret> {
  const reste = echeance - Date.now();
  if (reste < 1_000) return { motif: "defi", detail: "échéance" };
  const u = new URL(url);
  await allowsPath(u.origin, `${u.pathname}${u.search}`);
  const garde = await respecterCadence(url, Math.min(5_000, Math.max(0, reste - 1_000)));
  if (garde) return { motif: estMessageRefus(garde) ? "refus" : "defi", detail: garde };
  const lu = await lireHttp(url, Math.max(1_000, Math.min(DELAI_MS, reste)));
  if ("motif" in lu) return lu;
  if (estInterstitielCloudflare(lu.status, lu.cfMitigated, lu.texte)) {
    return { motif: "defi", detail: "interstitiel Cloudflare" };
  }
  if (lu.status === 403 || lu.status === 429 || lu.status === 503) {
    poserRefus(url, lu.status, lu.retryAfter ? { "retry-after": lu.retryAfter } : null);
    return { motif: "refus", detail: `HTTP ${lu.status}` };
  }
  if (lu.status !== 200) return { motif: "defi", detail: `HTTP ${lu.status}` };
  return { status: lu.status, texte: lu.texte };
}

function estArret(v: { status: number; texte: string } | Arret): v is Arret {
  return "motif" in v;
}

function jsonDe(texte: string): unknown | Arret {
  try {
    return JSON.parse(texte) as unknown;
  } catch {
    return { motif: "defi", detail: "réponse illisible" };
  }
}

const lieux = new Map<string, { at: number; lieu: LieuHomeToGo | null }>();
const LIEU_MS = 60 * 60_000;
/** La page HTML est un interstitiel : on ne la redemande pas tout de suite. */
const HTML_DEFI_MS = 30 * 60_000;
let htmlDefiJusqua = 0;
/** Nœuds de navigation, par identifiant de lieu. Ils bougent peu. */
const NAV_MS = 6 * 60 * 60_000;
type PageNav = {
  noeuds: NoeudLieu[];
  racine: string | null;
  trail: string | null;
  locationCount: number | null;
};
const pagesNav = new Map<string, { at: number } & PageNav>();

async function pageNav(
  lieu: LieuHomeToGo,
  input: LiveSearchInput,
  nuitsSejour: number,
  echeance: number,
  pause: { fait: boolean },
): Promise<PageNav | Arret> {
  const hit = pagesNav.get(lieu.locationId);
  if (hit && Date.now() - hit.at < NAV_MS) return hit;
  if (Date.now() >= echeance) return { motif: "defi", detail: "échéance" };
  if (pause.fait) await dormir(PAUSE_MS);
  pause.fait = true;
  const lu = await lire(urlRecherche(lieu, input, nuitsSejour, 1), echeance);
  if (estArret(lu)) return lu;
  const json = jsonDe(lu.texte);
  if (json && typeof json === "object" && "motif" in json) return json as Arret;
  const carte = carteNavigation(json);
  const page: { at: number } & PageNav = { at: Date.now(), ...carte, noeuds: carte.noeuds };
  pagesNav.set(lieu.locationId, page);
  return page;
}

async function choisirParmi(
  trouvés: readonly NoeudLieu[],
  nom: string,
  input: LiveSearchInput,
  nuitsSejour: number,
  echeance: number,
  pause: { fait: boolean },
): Promise<LieuHomeToGo | null | Arret> {
  if (trouvés.length === 0) return null;
  if (trouvés.length === 1) return { locationId: trouvés[0]!.id, fsid: trouvés[0]!.fsid };
  const candidats: CandidatLieu[] = [];
  for (const n of trouvés.slice(0, 3)) {
    const page = await pageNav({ locationId: n.id, fsid: n.fsid }, input, nuitsSejour, echeance, pause);
    if ("motif" in page) return page;
    candidats.push({
      locationId: n.id,
      fsid: n.fsid,
      trail: page.trail ?? "",
      locationCount: page.locationCount,
    });
  }
  const garde = retenirLieu(candidats, nom);
  return garde ? { locationId: garde.locationId, fsid: garde.fsid } : null;
}

/**
 * Le lieu, lu dans la recherche JSON autorisée.
 * L'amorce est la paire déjà publiée. Le massif puis le département sont
 * ceux de la station, seulement s'ils sont un nœud de cette recherche.
 */
async function resoudreParJson(
  input: LiveSearchInput,
  echeance: number,
  pause: { fait: boolean },
): Promise<LieuHomeToGo | null | Arret> {
  const nuitsSejour = nuits(input.checkIn, input.checkOut);
  if (nuitsSejour == null) return null;
  const amorce = await pageNav(AMORCE_HOMETOGO, input, nuitsSejour, echeance, pause);
  if ("motif" in amorce) return amorce;
  if (!amorce.racine) return null;
  const pays =
    amorce.racine === AMORCE_HOMETOGO.locationId
      ? amorce
      : await pageNav(
          { locationId: amorce.racine, fsid: AMORCE_HOMETOGO.fsid },
          input,
          nuitsSejour,
          echeance,
          pause,
        );
  if ("motif" in pays) return pays;
  const station = stationById(input.stationId);
  let portee = pays.noeuds;
  if (station?.massif) {
    const massif = noeudNomme(pays.noeuds, station.massif);
    if (massif) {
      const page = await pageNav({ locationId: massif.id, fsid: massif.fsid }, input, nuitsSejour, echeance, pause);
      if ("motif" in page) return page;
      portee = page.noeuds;
    }
  }
  let trouvés = noeudsDuNom(portee, input.stationName);
  let pageDept: NoeudLieu[] | null = null;
  if (trouvés.length === 0 && station?.dept) {
    const dept = noeudNomme(portee, station.dept);
    if (dept) {
      const page = await pageNav({ locationId: dept.id, fsid: dept.fsid }, input, nuitsSejour, echeance, pause);
      if ("motif" in page) return page;
      pageDept = page.noeuds;
      trouvés = noeudsDuNom(pageDept, input.stationName);
    }
  }
  // Le nom de la station n'est pas un nœud, la commune l'est (« Alpe d'Huez » → « Huez »).
  // Seulement ce libellé publié, pas le département.
  if (trouvés.length === 0 && station?.commune && plierLieu(station.commune) !== plierLieu(input.stationName)) {
    trouvés = noeudsDuNom(portee, station.commune);
    if (trouvés.length === 0 && pageDept) trouvés = noeudsDuNom(pageDept, station.commune);
  }
  return choisirParmi(trouvés, trouvés.length === 1 ? trouvés[0]!.label : input.stationName, input, nuitsSejour, echeance, pause);
}

async function resoudreLieu(
  input: LiveSearchInput,
  echeance: number,
  pause: { fait: boolean },
): Promise<LieuHomeToGo | null | Arret> {
  const hit = lieux.get(input.stationId);
  if (hit && Date.now() - hit.at < LIEU_MS) return hit.lieu;
  let trouve: LieuHomeToGo | null = null;
  let arret: Arret | null = null;
  // Un interstitiel sur la page HTML ne se rejoue pas à chaque station.
  if (Date.now() >= htmlDefiJusqua) {
    for (const slug of slugsLieu(input.stationName)) {
      if (Date.now() >= echeance) {
        arret = { motif: "defi", detail: "échéance" };
        break;
      }
      if (pause.fait) await dormir(PAUSE_MS);
      pause.fait = true;
      const lu = await lire(`${ORIGINE_HOMETOGO}/${slug}/`, echeance);
      if (estArret(lu)) {
        if (lu.motif === "refus" || lu.detail === "échéance") {
          arret = lu;
          break;
        }
        if (lu.detail === "interstitiel Cloudflare") {
          htmlDefiJusqua = Date.now() + HTML_DEFI_MS;
          break;
        }
        continue;
      }
      const lieu = lieuDepuisHtml(lu.texte, input.stationName);
      if (lieu) {
        trouve = lieu;
        break;
      }
    }
  }
  if (trouve) {
    lieux.set(input.stationId, { at: Date.now(), lieu: trouve });
    return trouve;
  }
  if (arret) return arret;
  const parJson = await resoudreParJson(input, echeance, pause);
  if (parJson && typeof parJson === "object" && "motif" in parJson) return parJson;
  lieux.set(input.stationId, { at: Date.now(), lieu: parJson });
  return parJson;
}

function urlRecherche(lieu: LieuHomeToGo, input: LiveSearchInput, nuitsSejour: number, page: number): string {
  const u = new URL(`/search/${lieu.locationId}`, ORIGINE_HOMETOGO);
  u.searchParams.set("fsid", lieu.fsid);
  u.searchParams.set("pricetype", "totalPrice");
  u.searchParams.set("arrival", input.checkIn);
  u.searchParams.set("duration", String(nuitsSejour));
  u.searchParams.set("persons", String(input.guests));
  if (input.bedrooms > 0) u.searchParams.set("bedrooms", String(input.bedrooms));
  if (page > 1) u.searchParams.set("page", String(page));
  u.searchParams.set("_format", "json");
  return u.toString();
}

function urlDetails(lieu: LieuHomeToGo, input: LiveSearchInput, nuitsSejour: number, ids: readonly string[]): string {
  const u = new URL(`/searchdetails/${lieu.locationId}`, ORIGINE_HOMETOGO);
  u.searchParams.set("fsid", lieu.fsid);
  u.searchParams.set("pricetype", "totalPrice");
  u.searchParams.set("arrival", input.checkIn);
  u.searchParams.set("duration", String(nuitsSejour));
  u.searchParams.set("persons", String(input.guests));
  if (input.bedrooms > 0) u.searchParams.set("bedrooms", String(input.bedrooms));
  u.searchParams.set("offers", ids.join(","));
  return u.toString();
}

type PageLue = { offres: Record<string, unknown>[]; compteur: number | null; suivante: number | null };

type ResteDetail = { ids: string[]; offres: Record<string, unknown>[] };

function idOffre(o: Record<string, unknown>): string | null {
  return typeof o.id === "string" && o.id ? o.id : null;
}

async function lirePage(
  url: string,
  echeance: number,
): Promise<PageLue | Arret> {
  const lu = await lire(url, echeance);
  if (estArret(lu)) return lu;
  const json = jsonDe(lu.texte);
  if (json && typeof json === "object" && "motif" in json) return json as Arret;
  if (!json || typeof json !== "object") return { motif: "defi", detail: "réponse illisible" };
  const corps = json as { searchSummary?: unknown; filters?: unknown };
  return {
    offres: offresDe(json),
    compteur: compteurPublie(corps.searchSummary),
    suivante: pageSuivante(corps.filters),
  };
}

/**
 * Les pages d'une station, puis le détail. Les squelettes (sans titre) passent
 * avant les fiches déjà lisibles : sans détail, ils ne sont pas des annonces.
 */
async function releverStation(
  input: LiveSearchInput,
  lieu: LieuHomeToGo,
  nuitsSejour: number,
  echeance: number,
  pause: { fait: boolean },
): Promise<{ listings: Listing[]; annoncees: number | null; raison: string | null; refus: boolean; reste: ResteDetail }> {
  const parId = new Map<string, Record<string, unknown>>();
  let annoncees: number | null = null;
  let page = 1;
  let raison: string | null = null;
  let refus = false;
  for (let n = 0; n < PAGES_MAX; n += 1) {
    if (Date.now() >= echeance) {
      raison = "échéance";
      break;
    }
    if (pause.fait) await dormir(PAUSE_MS);
    pause.fait = true;
    const tour = await lirePage(urlRecherche(lieu, input, nuitsSejour, page), echeance);
    if ("motif" in tour) {
      refus = tour.motif === "refus";
      raison = tour.detail === "échéance" ? "échéance" : tour.detail;
      break;
    }
    if (tour.compteur != null) annoncees = tour.compteur;
    for (const o of tour.offres) {
      const id = idOffre(o);
      if (id && !parId.has(id)) parId.set(id, o);
    }
    if (tour.offres.length === 0 || tour.suivante == null) break;
    if (annoncees != null && parId.size >= annoncees) break;
    page = tour.suivante;
  }
  const ordre = [...parId.values()].sort((a, b) => {
    const ta = typeof a.title === "string" || typeof a.name === "string" ? 1 : 0;
    const tb = typeof b.title === "string" || typeof b.name === "string" ? 1 : 0;
    return ta - tb;
  });
  const ids = ordre.map((o) => idOffre(o)).filter((id): id is string => id != null);
  const detailles = new Set<string>();
  for (let i = 0; i < ids.length && raison == null; i += LOT_DETAILS) {
    if (Date.now() >= echeance) {
      raison = "échéance";
      break;
    }
    // Une fiche de liste a déjà un titre et un prix affiché. On détaille
    // d'abord les squelettes ; le reste seulement s'il reste du temps pour
    // un lot entier.
    const lot = ids.slice(i, i + LOT_DETAILS);
    const premier = parId.get(lot[0] ?? "");
    const dejaLisible = premier != null && (typeof premier.title === "string" || typeof premier.name === "string");
    if (dejaLisible && echeance - Date.now() < PAUSE_MS + 4_000) {
      raison = "échéance";
      break;
    }
    if (pause.fait) await dormir(PAUSE_MS);
    pause.fait = true;
    const tour = await lire(urlDetails(lieu, input, nuitsSejour, lot), echeance);
    if (estArret(tour)) {
      refus = tour.motif === "refus";
      raison = tour.detail === "échéance" ? "échéance" : tour.detail;
      break;
    }
    const json = jsonDe(tour.texte);
    if (json && typeof json === "object" && "motif" in json) {
      const arret = json as Arret;
      refus = arret.motif === "refus";
      raison = arret.detail;
      break;
    }
    for (const d of offresDe(json)) {
      const id = idOffre(d);
      if (!id) continue;
      detailles.add(id);
      parId.set(id, fondreOffre(parId.get(id) ?? { id }, d));
    }
  }
  const listings = ids
    .map((id) => {
      const o = parId.get(id);
      if (!o) return null;
      const row = offreEnListing(o, input, lieu.locationId, nuitsSejour);
      return row ? avecDetailOuNon(row, detailles.has(id)) : null;
    })
    .filter((l): l is Listing => l != null);
  const manquants = idsSansDetail(ids, detailles);
  return {
    listings,
    annoncees,
    raison,
    refus,
    reste: { ids: manquants, offres: manquants.map((id) => parId.get(id) ?? { id }) },
  };
}

type ResteStation = { input: LiveSearchInput; lieu: LieuHomeToGo; offres: Record<string, unknown>[] };

function publier(
  o: Record<string, unknown>,
  st: LiveSearchInput,
  lieu: LieuHomeToGo,
  recherche: LiveSearchInput,
): Listing | null {
  const nuitsSejour = nuits(recherche.checkIn, recherche.checkOut);
  if (nuitsSejour == null) return null;
  const row = offreEnListing(o, st, lieu.locationId, nuitsSejour);
  if (!row) return null;
  const aligne = row.stationId === recherche.stationId ? row : { ...row, stationId: recherche.stationId };
  const q = qualifierLogement(aligne);
  const station = stationById(recherche.stationId);
  return station ? attachAccess(q, station) : q;
}

type MemoireHomeToGo = { a: number; listings: Listing[]; enCours: boolean; finie: boolean };
const htgGlobal = globalThis as typeof globalThis & {
  __skitrackSuiteHomeToGo__?: Map<string, MemoireHomeToGo>;
  /** La clé de la dernière recherche qui a lancé ou repris sa suite : les autres lui cèdent l'hôte. */
  __skitrackSuiteHomeToGoCourante__?: string;
};

function memoiresHomeToGo(): Map<string, MemoireHomeToGo> {
  return (htgGlobal.__skitrackSuiteHomeToGo__ ??= new Map());
}

export function cleSuiteHomeToGo(
  input: Pick<LiveSearchInput, "stationId" | "checkIn" | "checkOut" | "guests" | "bedrooms">,
): string {
  return `${input.stationId}|${input.checkIn}|${input.checkOut}|${input.guests}|${input.bedrooms}`;
}

/** Les détails déjà lus en tâche de fond. Aucun appel réseau. */
export function lireMemoireHomeToGo(
  input: Pick<LiveSearchInput, "stationId" | "checkIn" | "checkOut" | "guests" | "bedrooms">,
): Listing[] {
  const cle = cleSuiteHomeToGo(input);
  const s = memoiresHomeToGo().get(cle);
  if (!s) return [];
  if (!s.enCours && Date.now() - s.a > MEMOIRE_MS) {
    memoiresHomeToGo().delete(cle);
    return [];
  }
  return s.listings;
}

function lancerSuiteHomeToGo(recherche: LiveSearchInput, restes: readonly ResteStation[]): void {
  const utiles = restes.filter((r) => r.offres.length > 0);
  if (!recherche.domaine || utiles.length === 0) return;
  const map = memoiresHomeToGo();
  const cle = cleSuiteHomeToGo(recherche);
  const etat = map.get(cle);
  // Une seule suite tire à la fois, et c'est celle de la station regardée.
  // Attendre la fin d'une autre (8 min au plus) laissait ici les squelettes
  // sans détail : l'écran cesse de relire au bout de 8 min, et rien ne
  // relançait cette suite. Celle qui cède s'arrête avant son lot suivant,
  // garde ses détails en mémoire et reprend à sa prochaine recherche (arrêt
  // « échéance », `finie` faux) : pas un appel de plus à la minute.
  if (etat?.enCours) {
    htgGlobal.__skitrackSuiteHomeToGoCourante__ = cle;
    return;
  }
  if (etat?.finie && Date.now() - etat.a < MEMOIRE_MS) return;
  const connus = new Set((etat?.listings ?? []).map((l) => l.platformId).filter((id): id is string => !!id));
  const lots: { st: LiveSearchInput; lieu: LieuHomeToGo; ids: string[]; parId: Map<string, Record<string, unknown>> }[] = [];
  for (const r of utiles) {
    const ids = r.offres.map((o) => idOffre(o)).filter((id): id is string => id != null && !connus.has(id));
    if (ids.length === 0) continue;
    lots.push({ st: r.input, lieu: r.lieu, ids, parId: new Map(r.offres.map((o) => [idOffre(o) ?? "", o])) });
  }
  const plat = lots.flatMap((l) => lotsDe(l.ids).map((ids) => ({ ...l, ids })));
  if (plat.length === 0) return;
  const nuitsSejour = nuits(recherche.checkIn, recherche.checkOut);
  if (nuitsSejour == null) return;
  const listings = [...(etat?.listings ?? [])];
  map.set(cle, { a: Date.now(), listings, enCours: true, finie: false });
  htgGlobal.__skitrackSuiteHomeToGoCourante__ = cle;
  const echeance = Date.now() + SUITE_MAX_MS;
  void lireDetailsEnRetard(
    plat.map((p) => p.ids),
    {
      pauseMs: PAUSE_SUITE_MS,
      echeance,
      maintenant: () => Date.now(),
      attendre: dormir,
      tirer: async (ids) => {
        if (htgGlobal.__skitrackSuiteHomeToGoCourante__ !== cle) return "échéance";
        const lot = plat.find((p) => p.ids === ids);
        if (!lot) return "échéance";
        const tour = await lire(urlDetails(lot.lieu, lot.st, nuitsSejour, ids), echeance);
        if (estArret(tour)) return tour.motif === "refus" ? "refus" : "échéance";
        const json = jsonDe(tour.texte);
        if (json && typeof json === "object" && "motif" in json) {
          return (json as Arret).motif === "refus" ? "refus" : "échéance";
        }
        return offresDe(json);
      },
      noter: (ids, offres) => {
        const lot = plat.find((p) => p.ids === ids);
        if (!lot) return;
        const par = new Map(offres.map((o) => [idOffre(o) ?? "", o]));
        for (const id of ids) {
          const base = lot.parId.get(id) ?? { id };
          const fusion = fondreOffre(base, par.get(id) ?? null);
          const row = publier(fusion, lot.st, lot.lieu, recherche);
          if (!row) continue;
          const deja = listings.findIndex((l) => l.id === row.id);
          if (deja >= 0) listings[deja] = row;
          else listings.push(row);
        }
        const s = map.get(cle);
        if (s) s.a = Date.now();
      },
    },
  )
    .then((arret) => {
      map.set(cle, { a: Date.now(), listings, enCours: false, finie: arret !== "échéance" });
      console.info(`[hometogo] suite ${cle} : ${listings.length} détail(s), arrêt « ${arret} »`);
    })
    .catch(() => {
      const s = map.get(cle);
      if (s) s.enCours = false;
    });
}

export async function releverHomeToGo(input: LiveSearchInput, opts: { echeance: number }): Promise<ReleveHomeToGo> {
  const nuitsSejour = nuits(input.checkIn, input.checkOut);
  if (nuitsSejour == null) return { listings: [], annoncees: null, raison: "dates illisibles" };
  const pause = { fait: false };
  const listings: Listing[] = [];
  const restes: ResteStation[] = [];
  let annoncees: number | null = null;
  let raison: string | null = null;
  let refus = false;
  const manques: string[] = [];
  const accrocs: string[] = [];
  const stations = stationsDuReleve(input);
  for (const st of stations) {
    if (Date.now() >= opts.echeance) {
      raison = "échéance";
      break;
    }
    const lieu = await resoudreLieu(st, opts.echeance, pause);
    if (lieu && typeof lieu === "object" && "motif" in lieu) {
      refus = lieu.motif === "refus";
      raison = lieu.detail === "échéance" ? "échéance" : lieu.detail;
      break;
    }
    if (!lieu) {
      manques.push(st.stationName);
      continue;
    }
    const tour = await releverStation(st, lieu, nuitsSejour, opts.echeance, pause);
    listings.push(...tour.listings);
    if (tour.reste.offres.length) restes.push({ input: st, lieu, offres: tour.reste.offres });
    if (stations.length === 1) annoncees = tour.annoncees;
    if (!continuerDomaine(tour.raison, tour.refus)) {
      if (tour.refus) refus = true;
      raison = tour.raison;
      break;
    }
    if (tour.raison) accrocs.push(`${st.stationName} : ${tour.raison}`);
  }
  if (!refus) lancerSuiteHomeToGo(input, restes);
  const nSuite = restes.reduce((s, r) => s + r.offres.length, 0);
  const noteSuite = !refus && input.domaine && nSuite > 0 ? `détail en suite : ${nSuite}` : null;
  const noteLieu = manques.length ? `${manques.join(", ")} : lieu non publié par HomeToGo` : null;
  const noteAccroc = accrocs.length ? accrocs.join(" · ") : null;
  return {
    listings: sansDoublons(listings),
    annoncees,
    raison: [raison && raison !== "échéance" ? `arrêté en route — ${raison}` : raison, noteAccroc, noteSuite, noteLieu].filter(Boolean).join(" · ") || null,
  };
}
