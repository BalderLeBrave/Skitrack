import type { Listing } from "@/lib/listings";
import { RELEVE_2A } from "@/lib/listings";
import { attachAccess } from "@/lib/access";
import { stationById } from "@/lib/stations";
import { qualifierLogement } from "@/lib/stay/logement";
import { enrichirListing } from "@/lib/stay/enrichir";
import type { Page } from "playwright";
import { withBrowser } from "./browser.server";
import { scrapeGites } from "./gites.server";
import { communeGites } from "./gitesCommunes";
import { scrapeAirbnbDetailed, scrapeAirbnbSuite, type SuiteReste } from "./airbnb.server";
import { lireFichesLentes } from "./airbnbSuite.server";
import { scrapeBookingPlaywright, scrapeBookingPythonDetaille } from "./booking.server";
import { fillBookingGps } from "./bookingGps.server";
import { fillGitesGps } from "./gitesGps.server";
import { collecterCozy, cozyListings, type CollecteCozy } from "./cozy.server";
import { fusionner } from "./fusion";
import { allowsPath } from "./robots";
import { chercherCentrale } from "./centrales/chercher.server";
import { ficheCentrale } from "./centrales/registre";
import { releverGreenGo } from "./greengo.server";
import { collecteurDe } from "./agences/index.server";
import { agencesDuReleve, parPaquets, sansDoublons, stationsDuReleve } from "./domaine";
import type { LiveSearchInput, LiveSearchResult, SourceReport } from "./types";
import {
  airbnbListePrioritaire,
  generationReleveAirbnb,
  marquerRefusFichesAirbnb,
  tenirPagesAirbnb,
  tenirPdpAirbnb,
} from "@/lib/stay/completerFiche.server";

export type SearchPart = "airbnb" | "gites" | "cozy" | "centrales" | "greengo" | "agences" | "browser" | "all";

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
const GREENGO_SOURCES = ["GreenGo"] as const;

/**
 * Le temps qu'une part se donne pour relever, sous les 52 s de `SEARCH_PART_MS`
 * (src/lib/searchStay.ts) : le reste sert à dater, compléter et rendre. Une
 * part coupée par ce délai-là perdait tout, y compris ce qui était déjà lu.
 */
const ECHEANCE_PART_MS = 40_000;

function locate(input: LiveSearchInput, listings: Listing[]): Listing[] {
  // Capacité, chambres, pièces, cabine et type, chacun avec son origine :
  // ce que le collecteur a posé, puis ce que le texte dit (`logement.ts`).
  // Une annonce lue pour une station reliée (`domaine.ts`) appartient au
  // relevé de la station cherchée ; son rattachement dit où elle est.
  const withOcc = sansDoublons(listings).map((l) =>
    qualifierLogement(l.stationId === input.stationId ? l : { ...l, stationId: input.stationId }),
  );
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

/** Les recherches Cozy d'un grand domaine qui partent en même temps, au plus. */
const COZY_SIMULTANEES = 3;

/**
 * La recherche Cozy de la station, et celle de chaque station reliée
 * (`domaine.ts`) : Cozy cherche par le nom, et « La Plagne » ne rend pas
 * Champagny. Les pages se mettent bout à bout, `cozyListings` écarte les
 * doublons. Le compteur publié ne se rapporte plus : celui de chaque recherche
 * compte aussi ce que la voisine a déjà rendu.
 */
async function collecteCozyDomaine(input: LiveSearchInput, echeance: number): Promise<CollecteCozy> {
  const stations = stationsDuReleve(input);
  if (stations.length === 1) return collecteCozy(input, echeance);
  const lus = await parPaquets(stations, COZY_SIMULTANEES, (st) => collecteCozy(st, echeance));
  const faites = lus.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  lus.forEach((r, i) => {
    if (r.status === "rejected") console.warn(`[scrape] Cozy ${stations[i].stationName} échec: ${raisonDe(r)}`);
  });
  if (faites.length === 0) throw (lus[0] as PromiseRejectedResult).reason;
  const arrets: CollecteCozy["arrets"] = {};
  for (const p of ["airbnb", "abritel", "booking"] as const) {
    // Un fournisseur n'est complet que s'il l'est partout ; une recherche en
    // échec compte comme non interrogée.
    const motifs = lus.map((r) => (r.status === "fulfilled" ? r.value.arrets[p] : undefined));
    if (motifs.some((m) => m == null)) continue;
    arrets[p] = motifs.includes("échéance") ? "échéance" : motifs[0];
  }
  return { payloads: faites.flatMap((c) => c.payloads), annonces: {}, arrets };
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
async function releverAirbnb(input: LiveSearchInput, reports: SourceReport[], listings: Listing[]): Promise<SuiteReste | null> {
  const t0 = Date.now();
  const echeance = t0 + ECHEANCE_PART_MS;
  const [cozy, direct] = await Promise.allSettled([
    avant(collecteCozyDomaine(input, echeance), echeance + MARGE_COZY_MS, "CozyCozy"),
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
    return null;
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
  return direct.status === "fulfilled" ? (direct.value.reste ?? null) : null;
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
    collecteCozyDomaine(input, echeance),
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

async function runAirbnb(input: LiveSearchInput): Promise<LiveSearchResult & { reste?: SuiteReste | null }> {
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];
  let reste: SuiteReste | null = null;
  try {
    reste = await releverAirbnb(input, reports, listings);
  } catch (err) {
    failAll(reports, AIRBNB_SOURCES, err);
  }
  applyDump(input, reports, listings, new Set(AIRBNB_SOURCES));
  return { listings: locate(input, listings), sources: reports, ...(reste ? { reste } : {}) };
}

/** Les recherches Gîtes de France d'un grand domaine qui partent en même temps, au plus. */
const GITES_SIMULTANEES = 3;

/**
 * Gîtes de France cherche par commune : la station, puis chaque station
 * reliée qui a la sienne (`domaine.ts`), une fois par commune. La station
 * cherchée part toujours, même sans commune : son échec dit pourquoi.
 */
async function releverGites(open: () => Promise<Page>, input: LiveSearchInput): Promise<Listing[]> {
  const communes = new Set<string>();
  const stations = stationsDuReleve(input).filter((st) => {
    const towns = communeGites(st.stationId)?.towns;
    if (!towns) return st === input;
    if (communes.has(towns)) return false;
    communes.add(towns);
    return true;
  });
  if (stations.length === 1) return scrapeGites(await open(), stations[0]);
  const lus = await parPaquets(stations, GITES_SIMULTANEES, async (st) => scrapeGites(await open(), st));
  lus.forEach((r, i) => {
    if (r.status === "rejected") console.warn(`[scrape] Gîtes de France ${stations[i].stationName} échec: ${raisonDe(r)}`);
  });
  if (lus.every((r) => r.status === "rejected")) throw (lus[0] as PromiseRejectedResult).reason;
  return sansDoublons(lus.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
}

async function runGites(input: LiveSearchInput): Promise<LiveSearchResult> {
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];
  try {
    await withBrowser(async (open) => {
      await recordInto(reports, listings, "Gîtes de France", () => releverGites(open, input));
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
  // Sur un grand domaine, la centrale de chaque station reliée aussi
  // (`domaine.ts`), une fois par centrale : celle de La Plagne sert aussi
  // Montchavin et Champagny. La station cherchée part toujours, même sans
  // centrale : sa raison dit pourquoi.
  const hotes = new Set<string>();
  const stations = stationsDuReleve(input).filter((st) => {
    const host = ficheCentrale(st.stationId)?.host;
    if (!host) return st === input;
    if (hotes.has(host)) return false;
    hotes.add(host);
    return true;
  });
  const lus = await Promise.allSettled(stations.map((st) => chercherCentrale(st)));
  const faites = lus.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  for (const r of faites) console.info(`[centrale] ${r.nom ?? "aucune"} ${r.listings.length} en ${Date.now() - t0}ms`);
  const echecs = lus.flatMap((r) => {
    const raison = raisonDe(r);
    if (raison) console.warn(`[centrale] échec: ${raison}`);
    return raison ? [raison] : [];
  });
  if (faites.length === 0) {
    reports.push({ source: "Centrale", ok: false, count: 0, ms: Date.now() - t0, error: echecs.join(" · ") });
  } else {
    const interrogees = faites.filter((r) => r.interrogee);
    // Une station sans centrale ne parle pas pour une voisine qui en a une.
    const raisons = [...(interrogees.length ? interrogees : faites).map((r) => r.raison), ...echecs].filter(
      (r): r is string => Boolean(r),
    );
    const rows = sansDoublons(faites.flatMap((r) => r.listings));
    reports.push({
      source: "Centrale",
      ok: interrogees.length > 0,
      count: rows.length,
      ms: Date.now() - t0,
      ...(raisons.length ? { error: raisons.join(" · ") } : {}),
    });
    listings.push(...rows);
  }
  applyDump(input, reports, listings, new Set(CENTRALE_SOURCES));
  return { listings: locate(input, listings), sources: reports };
}

/**
 * GreenGo : ses propres hébergements, écoresponsables, publiés sur
 * greengo.voyage (voir `greengo.ts`). Une part à elle : aucune autre source ne
 * les rapporte, et `mergeLive` remplace les annonces d'une source par celles
 * de la part qui la rapporte.
 */
async function runGreenGo(input: LiveSearchInput): Promise<LiveSearchResult> {
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];
  const t0 = Date.now();
  try {
    const r = await releverGreenGo(input, { echeance: t0 + ECHEANCE_PART_MS });
    pushReport(reports, listings, "GreenGo", r.listings, Date.now() - t0, {
      note: notes(
        r.hotes != null
          ? `${r.hotes} hôtes réservables à 6 km${stationsDuReleve(input).length > 1 ? " des stations du domaine" : ""}, ${r.ecartes} écartés (camping, hôtel, chambres d'hôtes), ${r.detailles} lus en détail`
          : null,
        r.raison && `arrêté en route — ${r.raison}`,
      ),
    });
  } catch (err) {
    failAll(reports, GREENGO_SOURCES, err);
  }
  return { listings: locate(input, listings), sources: reports };
}

/**
 * Les agences, loueurs et voyagistes de montagne (`agences/couverture.ts`) :
 * Alpissime, Cimalpes, Madame Vacances, Maeva, Mountain Collection, Ovo
 * Network, Ski-Planet et Travelski. Ils partent ensemble, chacun pour les
 * seules stations qu'il couvre et à son rythme sur son propre site, dans le
 * temps de la part. Une station qu'aucun ne couvre rend une part vide, sans
 * rapport : la source n'existe pas là.
 */
async function runAgences(input: LiveSearchInput): Promise<LiveSearchResult> {
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];
  const echeance = Date.now() + ECHEANCE_PART_MS;
  // Sur un grand domaine, chaque agence relève aussi les stations reliées où
  // elle a des lieux (`domaine.ts`), l'une après l'autre sur son site, la
  // station cherchée d'abord.
  await Promise.all(
    [...agencesDuReleve(input)].map(async ([source, stations]) => {
      const t0 = Date.now();
      const rows: Listing[] = [];
      const dits: (string | undefined)[] = [];
      const echecs: unknown[] = [];
      let annoncees: number | null = 0;
      const nommer = (st: LiveSearchInput, texte: string) => (stations.length > 1 ? `${st.stationName} : ${texte}` : texte);
      for (const st of stations) {
        if (Date.now() >= echeance) {
          dits.push(nommer(st, "non relevée, échéance atteinte"));
          annoncees = null;
          continue;
        }
        try {
          const r = await collecteurDe(source)(st, { echeance });
          rows.push(...r.listings);
          annoncees = annoncees != null && r.annoncees != null ? annoncees + r.annoncees : null;
          const dit = notes(r.note, r.raison && `arrêté en route — ${r.raison}`);
          if (dit) dits.push(nommer(st, dit));
        } catch (err) {
          echecs.push(err);
          annoncees = null;
          dits.push(nommer(st, `échec — ${err instanceof Error ? err.message : String(err)}`));
        }
      }
      if (echecs.length === stations.length) {
        failAll(reports, [source], echecs[0]);
        return;
      }
      pushReport(reports, listings, source, sansDoublons(rows), Date.now() - t0, {
        annoncees,
        note: notes(...dits),
      });
    }),
  );
  return { listings: locate(input, listings), sources: reports };
}

async function runBrowser(input: LiveSearchInput): Promise<LiveSearchResult> {
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];
  try {
    await withBrowser(async (open) => {
      await Promise.all([
        recordInto(reports, listings, "Gîtes de France", () => releverGites(open, input)),
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
  if (part === "greengo") return runGreenGo(input);
  if (part === "agences") return runAgences(input);
  if (part === "browser") return runBrowser(input);
  const parts = await Promise.all([
    borne(runAirbnb(input), AIRBNB_SOURCES),
    borne(runGites(input), GITES_SOURCES),
    borne(runCozy(input), COZY_SOURCES),
    borne(runCentrales(input), CENTRALE_SOURCES),
    borne(runGreenGo(input), GREENGO_SOURCES),
    borne(runAgences(input), [...agencesDuReleve(input).keys()]),
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

/** Pages de suite par appel, après le relevé que l'écran attend. */
const PAGES_PAR_TOUR = 8;
/** Plafond de pages en plus des 12 du relevé interactif. */
const PAGES_SUITE_MAX = 72;
const TOUR_SUITE_MS = 90_000;

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Un refus d'Airbnb dans la note. Le limiteur local n'en est pas un : la suite peut reprendre. */
function arretDur(result: LiveSearchResult): boolean {
  const r = result.sources.find((s) => s.source === "Airbnb");
  const dit = `${r?.error ?? ""} ${r?.note ?? ""}`;
  return /HTTP \d{3}|coupe-circuit/i.test(dit);
}

function ajouterAuCache(key: string, rows: Listing[]): number {
  const hit = cache.get(key);
  if (!hit || rows.length === 0) return 0;
  const connus = new Set(hit.result.listings.map((l) => l.id));
  const neuf = rows.filter((l) => !connus.has(l.id));
  if (neuf.length === 0) return 0;
  const listings = [...hit.result.listings, ...neuf];
  const sources = hit.result.sources.map((s) =>
    s.source === "Airbnb" ? { ...s, count: listings.filter((l) => l.source === "Airbnb").length } : s,
  );
  cache.set(key, { at: Date.now(), ttl: hit.ttl, result: { listings, sources } });
  return neuf.length;
}

function raccourcirCache(key: string): void {
  const hit = cache.get(key);
  if (!hit) return;
  cache.set(key, { ...hit, at: Date.now(), ttl: Math.min(hit.ttl, CACHE_MS) });
}

function listingsDuCache(key: string): Listing[] {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at >= hit.ttl) return [];
  return hit.result.listings;
}

/**
 * Ce que le cache Airbnb tient encore pour cette recherche. L'écran Logements
 * l'ajoute à la liste : les pages lues après la réponse n'attendent pas une
 * nouvelle recherche.
 */
export function lireCacheAirbnb(input: LiveSearchInput): Listing[] {
  const key = cacheKey(input, "airbnb");
  return listingsDuCache(key);
}

async function paginerSuite(
  key: string,
  input: LiveSearchInput,
  reste: SuiteReste,
  gen: number,
): Promise<"ok" | "refus" | "laisse"> {
  let curseur: SuiteReste | null = reste;
  let budget = 0;
  let rythme = 0;
  while (curseur && curseur.file.length > 0 && budget < PAGES_SUITE_MAX) {
    if (generationReleveAirbnb() !== gen) return "laisse";
    while (airbnbListePrioritaire()) {
      await dormir(1_000);
      if (generationReleveAirbnb() !== gen) return "laisse";
    }
    const tour = await scrapeAirbnbSuite(input, curseur, PAGES_PAR_TOUR, Date.now() + TOUR_SUITE_MS);
    budget += PAGES_PAR_TOUR;
    const ajout = ajouterAuCache(key, locate(input, tour.listings));
    if (ajout) console.info(`[airbnb] suite +${ajout} annonce(s)`);
    if (tour.arret === "rythme") {
      rythme += 1;
      if (rythme > 4) return "ok";
      if (tour.reste) curseur = tour.reste;
      await dormir(8_000);
      continue;
    }
    rythme = 0;
    if (tour.rateLimited || tour.arret === "refus" || tour.arret === "coupe-circuit") return "refus";
    if (!tour.reste) return "ok";
    curseur = tour.reste;
  }
  return "ok";
}

/**
 * Après le relevé que l'écran attend : le reste des pages, puis les fiches
 * PDP, une à une. Rien de tout cela pendant un relevé de liste. Un refus
 * arrête les deux et raccourcit le cache.
 */
function poursuivreApresReleve(key: string, input: LiveSearchInput, reste: SuiteReste | null): void {
  const gen = generationReleveAirbnb();
  const lacherPages = tenirPagesAirbnb();
  void (async () => {
    let issue: "ok" | "refus" | "laisse" = "ok";
    let lacherPdp: (() => void) | null = null;
    try {
      if (reste) issue = await paginerSuite(key, input, reste, gen);
      if (
        issue === "ok" &&
        generationReleveAirbnb() === gen &&
        listingsDuCache(key).some((l) => l.source === "Airbnb")
      ) {
        lacherPdp = tenirPdpAirbnb();
      }
    } catch (err) {
      issue = "refus";
      console.warn("[airbnb] suite", err instanceof Error ? err.message : err);
    } finally {
      lacherPages();
    }
    if (issue === "refus") {
      marquerRefusFichesAirbnb();
      raccourcirCache(key);
      return;
    }
    if (!lacherPdp) return;
    try {
      const lu = await lireFichesLentes(listingsDuCache(key), input, () => generationReleveAirbnb() !== gen);
      if (lu === "refus") {
        marquerRefusFichesAirbnb();
        raccourcirCache(key);
      }
    } catch (err) {
      console.warn("[airbnb] fiches", err instanceof Error ? err.message : err);
      marquerRefusFichesAirbnb();
    } finally {
      lacherPdp();
    }
  })();
}

function cacheKey(input: LiveSearchInput, part: SearchPart): string {
  // Le relevé d'un grand domaine n'est pas celui de la station seule.
  const domaine = stationsDuReleve(input).length > 1 ? "domaine" : "";
  return [CACHE_GEN, part, input.stationId, input.checkIn, input.checkOut, input.guests, input.bedrooms, domaine].join("|");
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
      const extra = brut as LiveSearchResult & { reste?: SuiteReste | null };
      const reste = extra.reste ?? null;
      const nu: LiveSearchResult = { listings: extra.listings, sources: extra.sources };
      const at = Date.now();
      const result = daterReleve(nu, at);
      const dur = arretDur(result);
      const suitePages = part === "airbnb" && input.domaine === true && reste != null && !dur;
      const suiteFiches = part === "airbnb" && input.domaine === true && !dur && result.listings.some((l) => l.source === "Airbnb");
      const degrade = dureeCache(part, result) <= CACHE_MS;
      // Une relance tombée pendant une pause (coupe-circuit, limiteur) rend un
      // relevé dégradé : il ne remplace pas un relevé complet encore valable.
      const avant = cache.get(key);
      if (avant && avant.ttl > CACHE_MS && at - avant.at < avant.ttl && degrade) return avant.result;
      const ttl = suitePages ? CACHE_AIRBNB_MS : degrade ? CACHE_MS : CACHE_AIRBNB_MS;
      cache.set(key, { at, ttl, result });
      for (const [k, v] of cache) if (Date.now() - v.at >= v.ttl) cache.delete(k);
      if (suitePages || suiteFiches) poursuivreApresReleve(key, input, suitePages ? reste : null);
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}
