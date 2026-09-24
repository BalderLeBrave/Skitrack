import type { Listing } from "@/lib/listings";
import { RELEVE_2A } from "@/lib/listings";
import { attachAccess } from "@/lib/access";
import { stationById } from "@/lib/stations";
import { occupancyOfListing } from "@/lib/stay/occupancy";
import { enrichirListing } from "@/lib/stay/enrichir";
import { withBrowser } from "./browser.server";
import { scrapeGites } from "./gites.server";
import { scrapeAirbnbDetailed } from "./airbnb.server";
import { scrapeBookingPlaywright, scrapeBookingPythonDetaille } from "./booking.server";
import { fillBookingGps } from "./bookingGps.server";
import { fillGitesGps } from "./gitesGps.server";
import { collecterCozy, cozyListings, type CollecteCozy } from "./cozy.server";
import { fusionner } from "./fusion";
import { allowsPath } from "./robots";
import { chercherCentrale } from "./centrales/chercher.server";
import type { LiveSearchInput, LiveSearchResult, SourceReport } from "./types";

export type SearchPart = "airbnb" | "gites" | "cozy" | "centrales" | "browser" | "all";

function dumpFallback(input: LiveSearchInput, allow: Set<string>): Listing[] {
  if (
    input.stationId !== "les-2-alpes" ||
    input.checkIn !== "2027-02-06" ||
    input.checkOut !== "2027-02-13"
  ) {
    return [];
  }
  // Aucun tri sur la capacité ici : le repli rend ce que le relevé porte, et
  // c'est le filtre de l'écran qui décide — lui sait distinguer « trop petit »
  // de « non annoncé », et compter ce qu'il masque. Écarter au collecteur
  // faisait disparaître des annonces sans que rien ne le dise.
  return RELEVE_2A.filter((l) => allow.has(l.source)).map(enrichirListing);
}

const AIRBNB_SOURCES = ["Airbnb"] as const;
const GITES_SOURCES = ["Gîtes de France"] as const;
/**
 * La part « cozy » rapporte Abritel et Booking, et elle seule. Elle rapportait
 * aussi Airbnb, comme la part « airbnb » que l'écran lance en même temps : la
 * dernière arrivée remplaçait l'autre dans `mergeLive`, même vide.
 */
const COZY_SOURCES = ["Abritel", "Booking"] as const;
const BROWSER_SOURCES = ["Airbnb", "Gîtes de France", "Abritel", "Booking"] as const;
const CENTRALE_SOURCES = ["Centrale"] as const;

/**
 * Le temps qu'une part se donne pour relever, sous les 52 s de `SEARCH_PART_MS`
 * (src/lib/searchStay.ts) : le reste sert à dater, compléter et rendre. Une
 * part coupée par ce délai-là perdait tout, y compris ce qui était déjà lu.
 */
const ECHEANCE_PART_MS = 40_000;

function locate(input: LiveSearchInput, listings: Listing[]): Listing[] {
  const withOcc = listings.map((l) => {
    const occ = occupancyOfListing(l);
    return occ.guests === l.guests && occ.bedrooms === l.bedrooms && occ.rooms === (l.rooms ?? null)
      ? l
      : { ...l, ...occ };
  });
  const station = stationById(input.stationId);
  const located = station ? withOcc.map((l) => attachAccess(l, station)) : withOcc;
  // `total: 0` veut dire « prix non publié », pas « gratuit » : un tri croissant
  // brut rangeait ces annonces en tête, devant les moins chères réellement
  // relevées. Ce qui n'est pas publié passe après ce qui l'est.
  located.sort((a, b) => {
    const pa = a.total > 0 ? a.total : null;
    const pb = b.total > 0 ? b.total : null;
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb;
  });
  return located;
}

function pushReport(
  reports: SourceReport[],
  listings: Listing[],
  source: SourceReport["source"],
  rows: Listing[],
  ms: number,
  extra: Pick<SourceReport, "annoncees" | "note"> = {},
) {
  reports.push({ source, ok: true, count: rows.length, ms, ...extra });
  listings.push(...rows);
  const sur = extra.annoncees != null ? ` (la source en annonce ${extra.annoncees})` : "";
  const note = extra.note ? ` — ${extra.note}` : "";
  console.info(`[scrape] ${source} ${rows.length} en ${ms}ms${sur}${note}`);
}

async function recordInto(
  reports: SourceReport[],
  listings: Listing[],
  source: SourceReport["source"],
  run: () => Promise<Listing[]>,
) {
  const t0 = Date.now();
  try {
    const rows = await run();
    pushReport(reports, listings, source, rows, Date.now() - t0);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    reports.push({ source, ok: false, count: 0, ms: Date.now() - t0, error });
    console.warn(`[scrape] ${source} échec: ${error}`);
  }
}

function failAll(reports: SourceReport[], sources: readonly SourceReport["source"][], err: unknown) {
  const error = err instanceof Error ? err.message : String(err);
  for (const source of sources) {
    if (!reports.some((r) => r.source === source)) {
      reports.push({ source, ok: false, count: 0, ms: 0, error });
      console.warn(`[scrape] ${source} échec: ${error}`);
    }
  }
}

function applyDump(input: LiveSearchInput, reports: SourceReport[], listings: Listing[], allow: Set<string>) {
  const liveSources = new Set(reports.filter((r) => r.ok && r.count > 0).map((r) => r.source));
  for (const row of dumpFallback(input, allow)) {
    if (liveSources.has(row.source)) continue;
    listings.push({
      ...row,
      proven: `${row.proven} — repli relevé 3 sept. (live vide ou non branché)`,
    });
    liveSources.add(row.source);
  }
}

async function fillGitesIfNeeded(listings: Listing[]) {
  if (!listings.some((l) => l.source === "Gîtes de France" && (l.lat == null || l.lon == null))) return;
  try {
    await fillGitesGps(listings);
  } catch (err) {
    console.warn("[gites-gps]", err instanceof Error ? err.message : err);
  }
}

/**
 * Une recherche CozyCozy par demande, partagée entre les parts.
 *
 * L'écran lance ses parts en même temps, et « airbnb » comme « cozy » ouvraient
 * chacune leur propre recherche Cozy — deux recherches simultanées vers une
 * API que son robots.txt réserve, pour les mêmes résultats. Elles attendent
 * désormais le même aller, qui relève les trois fournisseurs.
 */
const COZY_PARTAGE_MS = 90_000;
const cozyPartage = new Map<string, { at: number; collecte: Promise<CollecteCozy> }>();

function collecteCozy(input: LiveSearchInput, echeance: number): Promise<CollecteCozy> {
  const key = [input.stationId, input.checkIn, input.checkOut, input.guests, input.bedrooms].join("|");
  const hit = cozyPartage.get(key);
  if (hit && Date.now() - hit.at < COZY_PARTAGE_MS) return hit.collecte;
  const collecte = withBrowser(async (open) => collecterCozy(await open(), input, undefined, echeance));
  cozyPartage.set(key, { at: Date.now(), collecte });
  collecte.catch(() => {
    if (cozyPartage.get(key)?.collecte === collecte) cozyPartage.delete(key);
  });
  for (const [k, v] of cozyPartage) if (Date.now() - v.at >= COZY_PARTAGE_MS) cozyPartage.delete(k);
  return collecte;
}

/**
 * Une promesse bornée par un instant : au-delà, elle échoue avec `quoi`.
 *
 * L'aller Cozy partagé borne déjà chacune de ses requêtes ; cette borne-ci
 * protège l'appelant d'un aller lancé par une autre part, avec une autre
 * échéance, ou d'un navigateur qui ne répond plus. Le relevé direct d'Airbnb,
 * lu en même temps, ne doit jamais attendre Cozy au-delà de sa propre part.
 */
function avant<T>(p: Promise<T>, instant: number, quoi: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${quoi} : délai dépassé`)), Math.max(0, instant - Date.now()));
  });
  return Promise.race([p, delai]).finally(() => clearTimeout(timer));
}

/** Ce qu'une part attend de Cozy au plus : sa propre échéance, et un souffle. */
const MARGE_COZY_MS = 3_000;

function raisonDe(r: PromiseSettledResult<unknown>): string | null {
  if (r.status === "fulfilled") return null;
  return r.reason instanceof Error ? r.reason.message : String(r.reason);
}

function notes(...parts: (string | null | undefined)[]): string | undefined {
  const out = parts.filter((p): p is string => Boolean(p));
  return out.length ? out.join(" · ") : undefined;
}

/**
 * Airbnb : CozyCozy et le relevé direct, en même temps, puis fusionnés.
 *
 * Le direct ne partait que si Cozy ne rendait rien, et Cozy ne connaît qu'une
 * trentaine d'Airbnb par station quand Airbnb en publie plusieurs centaines :
 * l'essentiel n'était jamais demandé. Les deux relevés touchent deux domaines
 * différents, la politesse de chacun est tenue par son collecteur.
 */
async function releverAirbnb(input: LiveSearchInput, reports: SourceReport[], listings: Listing[]) {
  const t0 = Date.now();
  const echeance = t0 + ECHEANCE_PART_MS;
  const [cozy, direct] = await Promise.allSettled([
    avant(collecteCozy(input, echeance), echeance + MARGE_COZY_MS, "CozyCozy"),
    scrapeAirbnbDetailed(input, { echeance }),
  ]);
  const viaCozy = cozy.status === "fulfilled" ? cozyListings(cozy.value.payloads, input, "Airbnb") : [];
  const viaDirect = direct.status === "fulfilled" ? direct.value.listings : [];
  const raisonDirect = direct.status === "fulfilled" ? direct.value.raison : raisonDe(direct);
  // Aucun des deux n'a rien rendu, et au moins un a échoué : c'est un échec,
  // pas un relevé vide.
  if (viaCozy.length === 0 && viaDirect.length === 0 && (cozy.status === "rejected" || raisonDirect)) {
    failAll(
      reports,
      AIRBNB_SOURCES,
      notes(raisonDe(cozy) && `Cozy : ${raisonDe(cozy)}`, raisonDirect && `direct : ${raisonDirect}`),
    );
    return;
  }
  const f = fusionner(viaCozy, viaDirect);
  const publieDirect = direct.status === "fulfilled" ? direct.value.annoncees : null;
  // Cozy tronqué ou muet pour Airbnb (échéance, recherche sans identifiant) :
  // on le dit, et le relevé n'est pas gardé 15 min comme complet (dureeCache).
  const arretCozy = cozy.status === "fulfilled" ? cozy.value.arrets.airbnb : undefined;
  const cozyIncomplet =
    cozy.status !== "fulfilled"
      ? null
      : arretCozy == null
        ? "Airbnb non relevé (échéance ou recherche sans identifiant)"
        : arretCozy === "échéance"
          ? "coupé par l'échéance"
          : null;
  pushReport(reports, listings, "Airbnb", f.listings, Date.now() - t0, {
    // Un compteur ne se rapporte que s'il couvre ce qu'on a compté : celui de
    // Cozy quand Cozy est seul. Celui d'Airbnb ne vaut que pour l'emprise
    // proche, alors que le relevé la déborde : il va dans la note.
    annoncees: viaDirect.length === 0 && cozy.status === "fulfilled" ? (cozy.value.annonces.airbnb ?? null) : null,
    note: notes(
      `Cozy ${viaCozy.length}, direct ${viaDirect.length}, communes ${f.communes}`,
      publieDirect != null ? `Airbnb en publie ${publieDirect} à 6 km de la station` : null,
      raisonDe(cozy) && `Cozy : ${raisonDe(cozy)}`,
      cozyIncomplet && `Cozy : ${cozyIncomplet}`,
      raisonDirect && `direct : ${raisonDirect}`,
    ),
  });
}

/**
 * Abritel et Booking, tels que CozyCozy les rend.
 *
 * Booking reste servi par Cozy, désormais paginé jusqu'à son compteur ; le
 * relevé direct ne part que si Cozy n'en rend aucun, comme avant. Le relever
 * à chaque recherche apporterait des biens que Cozy n'a pas (148 aux 2 Alpes,
 * mesuré le 23 septembre 2026), mais chaque page Booking commence par un défi
 * anti-robot : en faire un passage systématique est une décision du
 * propriétaire, pas une correction.
 */
async function releverCozy(input: LiveSearchInput, reports: SourceReport[], listings: Listing[]) {
  const t0 = Date.now();
  const echeance = t0 + ECHEANCE_PART_MS;
  const { payloads, annonces, arrets } = await avant(
    collecteCozy(input, echeance),
    echeance + MARGE_COZY_MS,
    "CozyCozy",
  );
  const coupe = (p: "abritel" | "booking") =>
    arrets[p] == null ? "Cozy coupé par l'échéance avant ce fournisseur" : arrets[p] === "échéance" ? "Cozy coupé par l'échéance" : undefined;
  pushReport(reports, listings, "Abritel", cozyListings(payloads, input, "Abritel"), Date.now() - t0, {
    annoncees: annonces.abritel ?? null,
    note: coupe("abritel"),
  });
  const viaCozy = cozyListings(payloads, input, "Booking");
  await withBrowser(async (open) => {
    let booking = viaCozy;
    let note = coupe("booking");
    const reste = () => ECHEANCE_PART_MS + t0 - Date.now();
    // Le relevé direct ne remplace Cozy que sur un vrai zéro — Cozy interrogé
    // jusqu'au bout — et s'il reste le temps de le faire : un zéro dû à
    // l'échéance lançait un repli de 12 s après les 40 s de la part.
    if (booking.length === 0 && !note && reste() > 15_000) {
      const py = await scrapeBookingPythonDetaille(input, Math.min(12_000, reste() - 3_000));
      booking = py.listings;
      note = py.raison ? `repli direct : ${py.raison}` : "repli sur le relevé direct (Cozy vide)";
      if (booking.length === 0 && reste() > 30_000) {
        booking = await scrapeBookingPlaywright(await open(), input);
      }
    }
    if (booking.some((l) => l.lat == null || l.lon == null) && Date.now() < echeance) {
      await fillBookingGps(await open(), booking).catch((err: unknown) => {
        console.warn("[booking-gps]", err instanceof Error ? err.message : err);
      });
    }
    pushReport(reports, listings, "Booking", booking, Date.now() - t0, {
      annoncees: booking === viaCozy ? (annonces.booking ?? null) : null,
      note,
    });
  });
}

async function runAirbnb(input: LiveSearchInput): Promise<LiveSearchResult> {
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];
  try {
    await releverAirbnb(input, reports, listings);
  } catch (err) {
    failAll(reports, AIRBNB_SOURCES, err);
  }
  applyDump(input, reports, listings, new Set(AIRBNB_SOURCES));
  return { listings: locate(input, listings), sources: reports };
}

async function runGites(input: LiveSearchInput): Promise<LiveSearchResult> {
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];
  try {
    await withBrowser(async (open) => {
      await recordInto(reports, listings, "Gîtes de France", async () => scrapeGites(await open(), input));
    });
  } catch (err) {
    failAll(reports, GITES_SOURCES, err);
  }
  applyDump(input, reports, listings, new Set(GITES_SOURCES));
  await fillGitesIfNeeded(listings);
  return { listings: locate(input, listings), sources: reports };
}

async function runCozy(input: LiveSearchInput): Promise<LiveSearchResult> {
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];
  try {
    await releverCozy(input, reports, listings);
  } catch (err) {
    failAll(reports, COZY_SOURCES, err);
  }
  applyDump(input, reports, listings, new Set(COZY_SOURCES));
  return { listings: locate(input, listings), sources: reports };
}

/**
 * La centrale officielle de la station.
 *
 * Une station, une centrale, et une seule requête : ce n'est pas une plateforme
 * qu'on interroge partout, c'est l'office de tourisme de l'endroit.
 * `chercherCentrale` dit lui-même s'il a pu appeler, et pourquoi quand il n'a
 * pas pu ; cette raison devient le champ `error` du rapport de source, que
 * l'écran écrit au lieu d'un vide.
 *
 * `ok` sépare les deux zéros : vrai quand la centrale a répondu sans rien avoir
 * de libre, faux quand elle n'a pas été appelée du tout. Le repli sur le relevé
 * figé se déclenche sur le second, ce qui est voulu — une station dont la
 * centrale n'est pas branchée garde ce qu'on avait relevé d'elle à la main.
 */
async function runCentrales(input: LiveSearchInput): Promise<LiveSearchResult> {
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];
  const t0 = Date.now();
  try {
    const res = await chercherCentrale(input);
    reports.push({
      source: "Centrale",
      ok: res.interrogee,
      count: res.listings.length,
      ms: Date.now() - t0,
      ...(res.raison ? { error: res.raison } : {}),
    });
    listings.push(...res.listings);
    console.info(`[centrale] ${res.nom ?? "aucune"} ${res.listings.length} en ${Date.now() - t0}ms`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    reports.push({ source: "Centrale", ok: false, count: 0, ms: Date.now() - t0, error });
    console.warn(`[centrale] échec: ${error}`);
  }
  applyDump(input, reports, listings, new Set(CENTRALE_SOURCES));
  return { listings: locate(input, listings), sources: reports };
}

async function runBrowser(input: LiveSearchInput): Promise<LiveSearchResult> {
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];
  try {
    await withBrowser(async (open) => {
      await Promise.all([
        recordInto(reports, listings, "Gîtes de France", async () => scrapeGites(await open(), input)),
        releverAirbnb(input, reports, listings),
        releverCozy(input, reports, listings),
      ]);
    });
  } catch (err) {
    failAll(reports, BROWSER_SOURCES, err);
  }
  applyDump(input, reports, listings, new Set(BROWSER_SOURCES));
  await fillGitesIfNeeded(listings);
  return { listings: locate(input, listings), sources: reports };
}

/**
 * Une part de « all » qui dépasse son temps rend son rapport d'échec au lieu
 * d'emporter les autres : un seul délai de 52 s couvrait les quatre, et des
 * Gîtes lents (83 s mesurés aux 2 Alpes) jetaient les annonces Cozy valables.
 */
const PART_ALL_MS = 48_000;

function borne(run: Promise<LiveSearchResult>, sources: readonly SourceReport["source"][]): Promise<LiveSearchResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<LiveSearchResult>((resolve) => {
    timer = setTimeout(() => {
      const error = "Délai dépassé — part abandonnée";
      resolve({ listings: [], sources: sources.map((source) => ({ source, ok: false, count: 0, ms: PART_ALL_MS, error })) });
    }, PART_ALL_MS);
  });
  return Promise.race([run, delai]).finally(() => clearTimeout(timer));
}

async function actuallyRun(input: LiveSearchInput, part: SearchPart): Promise<LiveSearchResult> {
  if (part === "airbnb") return runAirbnb(input);
  if (part === "gites") return runGites(input);
  if (part === "cozy") return runCozy(input);
  if (part === "centrales") return runCentrales(input);
  if (part === "browser") return runBrowser(input);
  const parts = await Promise.all([
    borne(runAirbnb(input), AIRBNB_SOURCES),
    borne(runGites(input), GITES_SOURCES),
    borne(runCozy(input), COZY_SOURCES),
    borne(runCentrales(input), CENTRALE_SOURCES),
  ]);
  return {
    listings: locate(input, parts.flatMap((p) => p.listings)),
    sources: parts.flatMap((p) => p.sources),
  };
}

const CACHE_MS = 90_000;
/**
 * Un relevé Airbnb complet se garde 15 min. À 90 s, chaque retour sur une
 * station, chaque nouvelle recherche aux mêmes dates renvoyait jusqu'à 12
 * requêtes à Airbnb, la cause la plus directe des 429. Les prix restent datés
 * (`scannedAt`). Un relevé arrêté en route (refus, coupe-circuit, limiteur
 * local) ou vide garde les 90 s : on le refera, pas pendant la pause.
 */
const CACHE_AIRBNB_MS = 15 * 60_000;
const CACHE_GEN = "c10";
const cache = new Map<string, { at: number; ttl: number; result: LiveSearchResult }>();

/**
 * La durée de conservation d'un résultat de part. Seule la part « airbnb »
 * — celle que l'écran lance — se garde longtemps : « all » et « browser »
 * portent aussi Gîtes, Cozy et la centrale, dont un échec ne doit pas rester
 * 15 min.
 */
export function dureeCache(part: SearchPart, result: LiveSearchResult): number {
  if (part !== "airbnb") return CACHE_MS;
  const r = result.sources.find((s) => s.source === "Airbnb");
  if (!r?.ok || r.count <= 0) return CACHE_MS;
  const dit = `${r.error ?? ""} ${r.note ?? ""}`;
  // « Cozy : … » et « direct : … » ne figurent dans la note que sur un échec
  // ou un arrêt (releverAirbnb) ; un simple compte (« en publie 429 ») ne compte pas.
  return /HTTP \d{3}|coupe-circuit|limiteur|arrêté en route|Cozy :|direct :/i.test(dit) ? CACHE_MS : CACHE_AIRBNB_MS;
}
const inflight = new Map<string, Promise<LiveSearchResult>>();

function cacheKey(input: LiveSearchInput, part: SearchPart): string {
  return [CACHE_GEN, part, input.stationId, input.checkIn, input.checkOut, input.guests, input.bedrooms].join("|");
}

/**
 * Date les prix au moment du relevé, pas de la réponse : `dater`
 * (searchStay.ts) tamponnait `scannedAt` à chaque service, et un relevé servi
 * du cache 14 min plus tard passait pour frais. Un prix de repli (relevé figé)
 * n'est pas daté ici, comme dans `dater`.
 */
function daterReleve(result: LiveSearchResult, at: number): LiveSearchResult {
  return {
    ...result,
    listings: result.listings.map((l) =>
      l.total > 0 && l.scannedAt == null && !/repli/i.test(l.proven) ? { ...l, scannedAt: at } : l,
    ),
  };
}

export type RunOptions = {
  /**
   * Une relance demandée à l'écran (« Relancer le relevé ») : le cache long
   * d'Airbnb n'y répond que pendant les 90 s d'avant, pas 15 min.
   */
  relance?: boolean;
};

export async function runLiveSearch(
  input: LiveSearchInput,
  part: SearchPart = "all",
  opts: RunOptions = {},
): Promise<LiveSearchResult> {
  await allowsPath("https://skitrack.local", "/");
  const key = cacheKey(input, part);
  const hit = cache.get(key);
  const ttl = hit ? (opts.relance ? Math.min(hit.ttl, CACHE_MS) : hit.ttl) : 0;
  if (hit && Date.now() - hit.at < ttl) return hit.result;
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = actuallyRun(input, part)
    .then((brut) => {
      const at = Date.now();
      const result = daterReleve(brut, at);
      const ttl = dureeCache(part, result);
      // Une relance tombée pendant une pause (coupe-circuit, limiteur) rend un
      // relevé dégradé : il ne remplace pas un relevé complet encore valable.
      const avant = cache.get(key);
      if (avant && avant.ttl > CACHE_MS && at - avant.at < avant.ttl && ttl <= CACHE_MS) return avant.result;
      cache.set(key, { at, ttl, result });
      for (const [k, v] of cache) if (Date.now() - v.at >= v.ttl) cache.delete(k);
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}
