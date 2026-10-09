/**
 * Relevé HomeToGo : la page du lieu, puis la recherche JSON autorisée,
 * page par page, puis le détail des offres que la liste laisse creuses.
 *
 * Une requête à la fois, une seconde entre deux. Un 403, un 429 ou un 503
 * arrête le domaine, sans second essai. L'échéance rend ce qui est déjà lu.
 */

import type { Listing } from "@/lib/listings";
import { UA_NAVIGATEUR } from "./navigateur.ts";
import { allowsPath } from "./robots.ts";
import { sansDoublons, stationsDuReleve } from "./domaine.ts";
import type { LiveSearchInput } from "./types";
import {
  LOT_DETAILS,
  ORIGINE_HOMETOGO,
  PAGES_MAX,
  compteurPublie,
  fondreOffre,
  lieuDepuisHtml,
  nuits,
  offreEnListing,
  offresDe,
  pageSuivante,
  slugsLieu,
  type LieuHomeToGo,
} from "./hometogo.ts";

const PAUSE_MS = 1_000;
const DELAI_MS = 15_000;

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

async function lire(url: string, echeance: number): Promise<{ status: number; texte: string } | Arret> {
  const reste = echeance - Date.now();
  if (reste < 1_000) return { motif: "defi", detail: "échéance" };
  const u = new URL(url);
  await allowsPath(u.origin, `${u.pathname}${u.search}`);
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json,text/html;q=0.9",
        "accept-language": "fr-FR,fr;q=0.9",
        "user-agent": UA_NAVIGATEUR,
        cookie: "c=EUR; meas=metric",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(Math.max(1_000, Math.min(DELAI_MS, reste))),
    });
    const texte = await res.text();
    if (res.status === 403 || res.status === 429 || res.status === 503) return { motif: "refus", detail: `HTTP ${res.status}` };
    if (res.status !== 200) return { motif: "defi", detail: `HTTP ${res.status}` };
    return { status: res.status, texte };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { motif: "defi", detail: /abort|timeout/i.test(msg) ? "échéance" : msg };
  }
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

async function resoudreLieu(
  input: LiveSearchInput,
  echeance: number,
  pause: { fait: boolean },
): Promise<LieuHomeToGo | null | Arret> {
  const hit = lieux.get(input.stationId);
  if (hit && Date.now() - hit.at < LIEU_MS) return hit.lieu;
  let trouve: LieuHomeToGo | null = null;
  let arret: Arret | null = null;
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
      continue;
    }
    const lieu = lieuDepuisHtml(lu.texte, input.stationName);
    if (lieu) {
      trouve = lieu;
      break;
    }
  }
  if (!arret) lieux.set(input.stationId, { at: Date.now(), lieu: trouve });
  return arret ?? trouve;
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
): Promise<{ listings: Listing[]; annoncees: number | null; raison: string | null }> {
  const parId = new Map<string, Record<string, unknown>>();
  let annoncees: number | null = null;
  let page = 1;
  let raison: string | null = null;
  for (let n = 0; n < PAGES_MAX; n += 1) {
    if (Date.now() >= echeance) {
      raison = "échéance";
      break;
    }
    if (pause.fait) await dormir(PAUSE_MS);
    pause.fait = true;
    const tour = await lirePage(urlRecherche(lieu, input, nuitsSejour, page), echeance);
    if ("motif" in tour) {
      raison = tour.detail === "échéance" ? "échéance" : tour.motif === "refus" ? tour.detail : tour.detail;
      if (tour.motif === "refus") raison = tour.detail;
      break;
    }
    if (tour.compteur != null) annoncees = tour.compteur;
    for (const o of tour.offres) {
      const id = typeof o.id === "string" ? o.id : null;
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
  const ids = ordre.map((o) => (typeof o.id === "string" ? o.id : "")).filter(Boolean);
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
      raison = tour.detail === "échéance" ? "échéance" : tour.detail;
      break;
    }
    const json = jsonDe(tour.texte);
    if (json && typeof json === "object" && "motif" in json) {
      raison = (json as Arret).detail;
      break;
    }
    for (const d of offresDe(json)) {
      const id = typeof d.id === "string" ? d.id : null;
      if (!id) continue;
      parId.set(id, fondreOffre(parId.get(id) ?? { id }, d));
    }
  }
  const listings = [...parId.values()]
    .map((o) => offreEnListing(o, input, lieu.locationId, nuitsSejour))
    .filter((l): l is Listing => l != null);
  return { listings, annoncees, raison };
}

export async function releverHomeToGo(input: LiveSearchInput, opts: { echeance: number }): Promise<ReleveHomeToGo> {
  const nuitsSejour = nuits(input.checkIn, input.checkOut);
  if (nuitsSejour == null) return { listings: [], annoncees: null, raison: "dates illisibles" };
  const pause = { fait: false };
  const listings: Listing[] = [];
  let annoncees: number | null = null;
  let raison: string | null = null;
  const manques: string[] = [];
  const stations = stationsDuReleve(input);
  for (const st of stations) {
    if (Date.now() >= opts.echeance) {
      raison = "échéance";
      break;
    }
    const lieu = await resoudreLieu(st, opts.echeance, pause);
    if (lieu && typeof lieu === "object" && "motif" in lieu) {
      raison = lieu.detail === "échéance" ? "échéance" : lieu.detail;
      break;
    }
    if (!lieu) {
      manques.push(st.stationName);
      continue;
    }
    const tour = await releverStation(st, lieu, nuitsSejour, opts.echeance, pause);
    listings.push(...tour.listings);
    if (stations.length === 1) annoncees = tour.annoncees;
    if (tour.raison) {
      raison = tour.raison;
      break;
    }
  }
  const noteLieu = manques.length ? `${manques.join(", ")} : lieu non publié par HomeToGo` : null;
  return {
    listings: sansDoublons(listings),
    annoncees,
    raison: [raison && raison !== "échéance" ? `arrêté en route — ${raison}` : raison, noteLieu].filter(Boolean).join(" · ") || null,
  };
}
