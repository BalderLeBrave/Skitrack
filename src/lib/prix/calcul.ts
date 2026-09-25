/** L'écran « Prix » (maquette v7), la partie qui se calcule.
 *
 *  Période, médiane d'un relevé, annonces qu'il retient, filtres à deux
 *  bornes, tri, libellés des deux onglets et file des relevés : tout ce qui se
 *  vérifie sans interface vit ici, pur, et `calcul.test.ts` en couvre les cas
 *  limites. Le magasin et la boucle de relevé (`releve.ts`) ne font qu'appeler
 *  ces fonctions.
 *
 *  Chargé tel quel par `node --experimental-strip-types` : imports relatifs
 *  avec leur extension, types en `import type`, aucun alias `@/`. */

import type { Listing } from "../listings.ts";
import type { SourceReport } from "../scrape/types.ts";
import type { Station } from "../stations.ts";
import { dm, eur, fmt, nuitsLbl, travLbl } from "../parcours.ts";
import { availabilityLabel, availabilityOf } from "../stay/availability.ts";
import { addDaysIso, formatDayIso } from "../stay/calendar.ts";
import { enrichirListing } from "../stay/enrichir.ts";
import { estFicheGitesIntrouvable } from "../stay/ficheGites.ts";
import { geoReasonFor, gpsPrecis, partyVerdict, RAYON_DEFAUT_KM } from "../stay/lodgingFilter.ts";
import { regrouper } from "../stay/regroupement.ts";
import { estOffreGitesVerifiee } from "../stay/tarif.ts";
import { maxM, villageM } from "../v7.ts";

export const MIN_ANNONCES = 5;
/** `STAY_BOUNDS.nights` de `parcours.ts`, recopié pour garder le module pur. */
export const NUITS_MIN = 1;
export const NUITS_MAX = 21;
export const PAGE = 40;
/** Au-delà, les résultats les plus anciens partent : le stockage du
 *  navigateur n'est pas extensible, et chaque période multiplie les clés. */
export const MAX_RESULTATS = 4000;

const NUITS_DEFAUT = 7;

/* ---------- Période ---------- */

/** `from` en ISO `AAAA-MM-JJ`. */
export type Periode = { from: string; nights: number };
/** `rooms` à 0 : studio accepté. */
export type Groupe = { trav: number; rooms: number };

export function perKey(p: Periode): string {
  return `${p.from}|${p.nights}`;
}

export function memePeriode(a: Periode, b: Periode): boolean {
  return perKey(a) === perKey(b);
}

export function grpKey(g: Groupe): string {
  return `${g.trav}|${g.rooms}`;
}

/** Le groupe entre dans la clé : une médiane pour huit voyageurs ne vaut
 *  rien pour dix, et la maquette l'oubliait. */
export function cleResultat(p: Periode, g: Groupe, stationId: string): string {
  return `${perKey(p)}|${grpKey(g)}|${stationId}`;
}

export function bornerNuits(n: number): number {
  if (!Number.isFinite(n)) return NUITS_DEFAUT;
  return Math.min(NUITS_MAX, Math.max(NUITS_MIN, Math.round(n)));
}

/** Un séjour sans nuits (plage inversée) se lit comme la semaine par défaut. */
export function periodeDuSejour(checkIn: string, nights: number): Periode {
  return { from: checkIn, nights: bornerNuits(nights > 0 ? nights : NUITS_DEFAUT) };
}

export function decaler(p: Periode, jours: number): Periode {
  return { ...p, from: addDaysIso(p.from, jours) };
}

export function avecNuits(p: Periode, nights: number): Periode {
  return { ...p, nights: bornerNuits(nights) };
}

export function departIso(p: Periode): string {
  return addDaysIso(p.from, p.nights);
}

/** « du 6 févr. au 13 févr. » */
export function perLbl(p: Periode): string {
  return `du ${dm(p.from)} au ${dm(departIso(p))}`;
}

/** « 13 févr. 2027 » */
export function departLbl(p: Periode): string {
  return formatDayIso(departIso(p));
}

/** Une arrivée déjà passée ne se réserve plus : aucun relevé n'y a de sens.
 *  `aujourdhui` en ISO `AAAA-MM-JJ`, que l'ordre des chaînes compare. */
export function estPassee(p: Periode, aujourdhui: string): boolean {
  return p.from < aujourdhui;
}

/* ---------- Médiane d'un relevé ---------- */

export type Resultat =
  | {
      etat: "fait";
      n: number;
      muettes: number;
      petits: number;
      med: number | null;
      ts: number;
      partiel: string[];
    }
  | { etat: "echec"; ts: number; raison: string };

/** Sans arrondi : la moyenne des deux du milieu reste telle quelle. */
export function mediane(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type Agregat = { n: number; muettes: number; petits: number; med: number | null };

/** Ce que la médiane lit d'un relevé, en plus de ses annonces. */
export type ContexteReleve = {
  dept: string | null;
  checkIn: string;
  checkOut: string;
  groupe: Groupe;
  now: number;
};

const REPLI = /repli/i;

type Crible = { retenues: Listing[]; muettes: number; petits: number };

/**
 * Une annonce ne compte que si tout le reste est prouvé : offre réelle, pas
 * un repli sur le relevé figé, en euros, à la station, géolocalisée, et
 * tarifée récemment pour exactement ce séjour. Un « à partir de » n'est pas un
 * total de séjour, même non nul. Parmi celles-là seulement, le verdict de
 * groupe tranche : une capacité tue est comptée à part (`muettes`), jamais
 * supposée suffisante, et une trop petite aussi (`petits`).
 *
 * Un logement vendu sur trois plateformes n'est qu'un logement : les retenues
 * se regroupent comme dans Logements, et seule l'offre la moins chère de
 * chacun compte. Sans cela, deux biens suffisaient à atteindre MIN_ANNONCES.
 * Muettes et petites restent des offres : elles ne sont pas proposées.
 */
function cribler(listings: readonly Listing[], ctx: ContexteReleve): Crible {
  const stay = { checkIn: ctx.checkIn, checkOut: ctx.checkOut };
  const criteres = { travelers: ctx.groupe.trav, rooms: ctx.groupe.rooms };
  const vus = new Set<string>();
  const retenues: Listing[] = [];
  let muettes = 0;
  let petits = 0;

  for (const brute of listings) {
    const l = enrichirListing(brute);
    if (estFicheGitesIntrouvable(l) || !estOffreGitesVerifiee(l)) continue;
    if (REPLI.test(l.proven ?? "")) continue;
    if (l.currency !== "EUR") continue;
    if (l.priceIndicative) continue;
    if (geoReasonFor(l, RAYON_DEFAUT_KM, ctx.dept) != null) continue;
    if (!gpsPrecis(l)) continue;
    if (availabilityOf(l, stay, ctx.now).status !== "confirmed") continue;
    // Une même annonce rendue deux fois ne compte qu'une fois.
    if (vus.has(l.id)) continue;
    vus.add(l.id);

    const verdict = partyVerdict(l, criteres);
    if (verdict === "convient") retenues.push(l);
    else if (verdict === "non-annonce") muettes += 1;
    else petits += 1;
  }

  return { retenues: regrouper(retenues).map((g) => g.principale), muettes, petits };
}

/** Les annonces que la médiane compte, enrichies : l'onglet « Par budget » ne
 *  propose que celles-là, pour qu'un logement affiché soit un logement mesuré. */
export function retenir(listings: readonly Listing[], ctx: ContexteReleve): Listing[] {
  return cribler(listings, ctx).retenues;
}

/** Ce qu'un relevé donne pour une station : la médiane des totaux publiés pour
 *  ces dates exactes, par des logements qui accueillent le groupe, une offre
 *  par logement. */
export function agreger(listings: readonly Listing[], ctx: ContexteReleve): Agregat {
  const { retenues, muettes, petits } = cribler(listings, ctx);
  return { n: retenues.length, muettes, petits, med: mediane(retenues.map((l) => l.total)) };
}

/** Une annonce retenue, réduite à ce que l'onglet budget affiche et à ce que
 *  `availabilityOf` relit : une grande station en retient des centaines. */
export type AnnonceRetenue = {
  id: string;
  title: string;
  source: Listing["source"];
  total: number;
  currency: string;
  guests: number | null;
  bedrooms: number | null;
  rooms: number | null;
  url: string | null;
  photo: string | null;
  pricedCheckIn: string | null;
  pricedCheckOut: string | null;
  scannedAt: number | null;
  distToSlopesM: number | null;
};

export function compacter(l: Listing): AnnonceRetenue {
  return {
    id: l.id,
    title: l.title,
    source: l.source,
    total: l.total,
    currency: l.currency,
    guests: l.guests,
    bedrooms: l.bedrooms,
    rooms: l.rooms ?? null,
    url: l.url,
    photo: l.photo,
    pricedCheckIn: l.pricedCheckIn ?? null,
    pricedCheckOut: l.pricedCheckOut ?? null,
    scannedAt: l.scannedAt ?? null,
    distToSlopesM: l.distToSlopesM ?? null,
  };
}

export const PARTS = ["airbnb", "gites", "cozy", "centrales", "greengo"] as const;
export type Part = (typeof PARTS)[number];

export const SOURCES_DE_PART: Record<Part, readonly Listing["source"][]> = {
  airbnb: ["Airbnb"],
  gites: ["Gîtes de France"],
  cozy: ["Abritel", "Booking"],
  centrales: ["Centrale"],
  greengo: ["GreenGo"],
};

/** Les plateformes existent pour toute station : leur silence est un défaut.
 *  Une centrale ou Gîtes de France peuvent ne pas exister pour la station. */
const PLATEFORMES: readonly Listing["source"][] = ["Airbnb", "Abritel", "Booking", "GreenGo"];

/** Un refus, une pause, un délai ou une coupure : la source existe, elle n'a
 *  pas tout rendu cette fois. Le motif de `dureeCache`, plus ce que les
 *  collecteurs écrivent d'autre (run.server.ts, airbnb.server.ts,
 *  gites.server.ts) et les délais du client.
 *  - « Cozy : » et « direct : » ne s'écrivent que sur un échec ou un arrêt ;
 *    le compte ordinaire s'écrit « Cozy 38, direct 408 ».
 *  - « échéance » : Cozy coupé avant Abritel ou Booking, relevé direct coupé.
 *  - « bloqué ( » : le pare-feu de Gîtes de France (403, 429, défi).
 *  - Le plafond de GreenGo, « arrêté en route » suivi de « 6 hôtes au-delà
 *    des 12 lus en détail », n'est pas un refus : il est de notre fait, et
 *    relever à nouveau ne l'effacerait jamais. */
const PASSAGER =
  /HTTP \d{3}|coupe-circuit|limiteur|arrêté en route(?! . \d+ hôtes au-delà des)|Délai dépassé|timeout|fetch failed|Cozy :|direct :|échéance|bloqué \(/i;

const ORDRE_SOURCES: readonly Listing["source"][] = PARTS.flatMap((p) => SOURCES_DE_PART[p]);

/** Sources en défaut pour ce relevé : noms uniques, dans l'ordre de PARTS.
 *  - toute source d'une part rejetée côté client (partsEchouees) ;
 *  - une source des plateformes (Airbnb, Abritel, Booking, GreenGo) avec ok: false ;
 *  - toute source dont error ou note matche un motif passager.
 *  Une centrale non branchée ou un Gîtes sans commune (ok: false sans motif
 *  passager) n'est PAS un défaut : la source n'existe pas pour cette station. */
export function sourcesEnDefaut(
  sources: readonly SourceReport[],
  partsEchouees: readonly Part[],
): string[] {
  const enDefaut = new Set<string>();
  for (const p of partsEchouees) for (const s of SOURCES_DE_PART[p]) enDefaut.add(s);
  for (const r of sources) {
    if (!r.ok && PLATEFORMES.includes(r.source)) enDefaut.add(r.source);
    else if (PASSAGER.test(`${r.error ?? ""} ${r.note ?? ""}`)) enDefaut.add(r.source);
  }
  return ORDRE_SOURCES.filter((s) => enDefaut.has(s));
}

const AUCUNE_SOURCE = "Aucune source n’a répondu.";

/** Ce que la boucle de relevé rapporte d'une station. */
export type EntreeReleve = ContexteReleve & {
  listings: readonly Listing[];
  sources: readonly SourceReport[];
  partsEchouees: readonly Part[];
};

/** Toutes les parts ont échoué côté client, ou aucune annonce réelle n'est
 *  revenue et les quatre plateformes sont en défaut : un zéro n'y serait pas
 *  une mesure. Le serveur ajoute le relevé figé (« repli ») à toute source
 *  muette : ces lignes-là ne prouvent pas qu'une source a répondu. */
function echoue(input: EntreeReleve, partiel: readonly string[]): boolean {
  const toutesEchouees = PARTS.every((p) => input.partsEchouees.includes(p));
  const aucuneReelle = input.listings.every((l) => REPLI.test(l.proven ?? ""));
  const plateformesMuettes = aucuneReelle && PLATEFORMES.every((s) => partiel.includes(s));
  return toutesEchouees || plateformesMuettes;
}

function contexte(input: EntreeReleve): ContexteReleve {
  return {
    dept: input.dept,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    groupe: input.groupe,
    now: input.now,
  };
}

/** Le résultat d'un relevé : `echec` s'il n'a rien mesuré, sinon `fait`, avec
 *  les sources en défaut dans `partiel`. */
export function resultatDuReleve(input: EntreeReleve): Resultat {
  const partiel = sourcesEnDefaut(input.sources, input.partsEchouees);
  if (echoue(input, partiel)) return { etat: "echec", ts: input.now, raison: AUCUNE_SOURCE };
  return { etat: "fait", ...agreger(input.listings, contexte(input)), ts: input.now, partiel };
}

/** Les annonces que ce relevé retient, compactes ; aucune s'il a échoué. */
export function annoncesDuReleve(input: EntreeReleve): AnnonceRetenue[] {
  if (echoue(input, sourcesEnDefaut(input.sources, input.partsEchouees))) return [];
  return retenir(input.listings, contexte(input)).map(compacter);
}

/* ---------- Filtres ---------- */

/** `null` : toute l'échelle, la plage ne filtre pas. */
export type Plage = readonly [number, number] | null;
/** Ce qui se lit sur la station elle-même. */
export type PlageStationK = "km" | "sommet" | "village";
export type PlageK = "prix" | PlageStationK | "budget";
/** Les deux onglets partagent massif, département et plages de station ;
 *  `prix` et `avecPrix` ne servent qu'à « Par station », `budget` qu'à
 *  « Par budget ». */
export type Filtres = {
  massif: string;
  dept: string;
  avecPrix: boolean;
  prix: Plage;
  km: Plage;
  sommet: Plage;
  village: Plage;
  budget: Plage;
};

export const FL0: Filtres = {
  massif: "",
  dept: "",
  avecPrix: false,
  prix: null,
  km: null,
  sommet: null,
  village: null,
  budget: null,
};

export type DefPlage = {
  k: PlageK;
  lbl: string;
  pas: number;
  unite: "€" | "km" | "m";
  fixe?: readonly [number, number];
};
export type DefPlageStation = DefPlage & { k: PlageStationK };

/** Les plages de station, communes aux deux onglets. */
export const PLAGES_STATION: readonly DefPlageStation[] = [
  { k: "km", lbl: "Kilomètres de pistes", pas: 10, unite: "km" },
  { k: "sommet", lbl: "Sommet", pas: 100, unite: "m" },
  { k: "village", lbl: "Altitude du village", pas: 100, unite: "m" },
];

/** Les plages de l'onglet « Par station ». */
export const PLAGES: readonly DefPlage[] = [
  { k: "prix", lbl: "Médiane", pas: 100, unite: "€", fixe: [0, 6000] },
  ...PLAGES_STATION,
];

/** Porte sur le total d'une annonce, jamais sur une station : `passe` l'ignore. */
export const PLAGE_BUDGET: DefPlage = {
  k: "budget",
  lbl: "Budget, total du séjour",
  pas: 100,
  unite: "€",
  fixe: [0, 10000],
};

/** Une altitude à zéro n'est pas mesurée : `maxM` et `villageM` la rendent nulle. */
export function valeurStation(k: PlageStationK, s: Station): number | null {
  if (k === "km") return s.pistesKm;
  if (k === "sommet") return maxM(s);
  return villageM(s);
}

export type Bornes = Record<PlageK, readonly [number, number]>;

function bornesDe(def: DefPlage, stations: readonly Station[]): readonly [number, number] {
  if (def.fixe) return def.fixe;
  let min = Infinity;
  let max = -Infinity;
  for (const s of stations) {
    const v = valeurStation(def.k as PlageStationK, s);
    if (v == null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min > max) return [0, def.pas];
  return [Math.floor(min / def.pas) * def.pas, Math.ceil(max / def.pas) * def.pas];
}

/** L'échelle de chaque curseur, arrondie au pas, sur les valeurs mesurées. */
export function bornesPlages(stations: readonly Station[]): Bornes {
  const b = {} as Record<PlageK, readonly [number, number]>;
  for (const def of [...PLAGES, PLAGE_BUDGET]) b[def.k] = bornesDe(def, stations);
  return b;
}

/** Pose une poignée, arrondie au pas et bornée à l'échelle ; les deux ne se
 *  croisent pas. Toute l'échelle couverte, la plage redevient `null`. */
export function poserBorne(
  pl: Plage,
  b: readonly [number, number],
  pas: number,
  which: 0 | 1,
  v: number,
): Plage {
  if (!Number.isFinite(v)) return pl;
  const cur = pl ?? b;
  const x = Math.min(b[1], Math.max(b[0], Math.round(v / pas) * pas));
  const next: readonly [number, number] =
    which === 0 ? [Math.min(x, cur[1]), cur[1]] : [cur[0], Math.max(x, cur[0])];
  if (next[0] <= b[0] && next[1] >= b[1]) return null;
  return next;
}

/** La poignée qu'un clic sur la piste déplace. Poignées confondues : celle
 *  du côté du clic, sinon aucune ne pourrait plus s'écarter de l'autre. */
export function poigneeProche(v: number, cur: readonly [number, number]): 0 | 1 {
  if (cur[0] === cur[1]) return v < cur[0] ? 0 : 1;
  return Math.abs(v - cur[0]) <= Math.abs(v - cur[1]) ? 0 : 1;
}

/** « 1 200 € » → 1200, « 1,5 » → 1.5 ; ce qui n'est pas un nombre → `null`. */
export function lireSaisie(texte: string): number | null {
  const c = texte.replace(/[^\d.,-]/g, "").replace(",", ".");
  if (c === "") return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}

export function fmtPlage(k: PlageK, v: number): string {
  if (k === "prix" || k === "budget") return eur(v);
  if (k === "km") return `${fmt(v)} km`;
  return `${fmt(v)} m`;
}

/** La borne haute au maximum de l'échelle ne plafonne pas : « et plus ». */
export function plageLbl(k: PlageK, pl: Plage, b: readonly [number, number]): string {
  if (pl == null) return "Indifférent";
  const [lo, hi] = pl;
  if (hi >= b[1]) return `${fmtPlage(k, lo)} et plus`;
  if (lo <= b[0]) return `jusqu’à ${fmtPlage(k, hi)}`;
  return `${fmtPlage(k, lo)} à ${fmtPlage(k, hi)}`;
}

/** Les filtres de l'onglet « Par station » : le budget n'y compte pas. */
export function filtresActifs(fl: Filtres): boolean {
  return fl.massif !== "" || fl.dept !== "" || fl.avecPrix || PLAGES.some((p) => fl[p.k] != null);
}

/** Les filtres de l'onglet « Par budget » : ni la médiane ni « avec un prix ». */
export function filtresActifsBudget(fl: Filtres): boolean {
  return (
    fl.budget != null ||
    fl.massif !== "" ||
    fl.dept !== "" ||
    PLAGES_STATION.some((p) => fl[p.k] != null)
  );
}

/** « Tout effacer » de l'onglet budget laisse les filtres de l'autre onglet. */
export function effacerBudget(fl: Filtres): Filtres {
  return { ...fl, budget: null, massif: "", dept: "", km: null, sommet: null, village: null };
}

/* ---------- Lignes, tri ---------- */

export type EtatLigne = "en-cours" | "attente" | "non-releve" | "echec" | "peu" | "prix";
export type Ligne = {
  id: string;
  nom: string;
  massif: string;
  dept: string | null;
  /** « Alpes du Nord · Isère » */
  subMassif: string;
  etat: EtatLigne;
  /** Logements retenus, pour un résultat « fait » seulement. */
  n: number | null;
  /** Seulement quand `etat === "prix"`. */
  med: number | null;
  res: Resultat | null;
};

/** Priorité : en-cours (même avec un résultat) > attente (seulement sans
 *  résultat) > pas de résultat → non-releve > echec > n < MIN_ANNONCES → peu > prix. */
export function ligne(
  s: Station,
  res: Resultat | null,
  course: { enCours: boolean; attente: boolean },
): Ligne {
  let etat: EtatLigne;
  if (course.enCours) etat = "en-cours";
  else if (course.attente && !res) etat = "attente";
  else if (!res) etat = "non-releve";
  else if (res.etat === "echec") etat = "echec";
  else if (res.n < MIN_ANNONCES) etat = "peu";
  else etat = "prix";
  const fait = res?.etat === "fait" ? res : null;
  return {
    id: s.id,
    nom: s.name,
    massif: s.massif,
    dept: s.dept,
    subMassif: [s.massif, s.dept].filter(Boolean).join(" · "),
    etat,
    n: fait ? fait.n : null,
    med: etat === "prix" && fait ? fait.med : null,
    res,
  };
}

/** Une plage active écarte une valeur absente : une absence n'est pas un
 *  zéro. La borne haute au maximum de l'échelle ne plafonne pas : « et plus ». */
function dansPlage(v: number | null, pl: Plage, b: readonly [number, number]): boolean {
  if (pl == null) return true;
  if (v == null) return false;
  if (v < pl[0]) return false;
  return !(pl[1] < b[1] && v > pl[1]);
}

/** Massif, département et plages de station : ce que les deux onglets
 *  partagent. */
export function passeStationSeule(s: Station, fl: Filtres, b: Bornes): boolean {
  if (fl.massif && s.massif !== fl.massif) return false;
  if (fl.dept && s.dept !== fl.dept) return false;
  return PLAGES_STATION.every((def) => dansPlage(valeurStation(def.k, s), fl[def.k], b[def.k]));
}

/** La plage de prix lit la médiane de la ligne ; le budget n'y entre pas. */
export function passe(l: Ligne, s: Station, fl: Filtres, b: Bornes): boolean {
  if (fl.avecPrix && l.etat !== "prix") return false;
  return dansPlage(l.med, fl.prix, b.prix) && passeStationSeule(s, fl, b);
}

export function passeBudget(total: number, pl: Plage, b: readonly [number, number]): boolean {
  return dansPlage(total, pl, b);
}

export type Tri = { k: "med" | "nom" | "massif" | "n"; dir: 1 | -1 };
export const TRI0: Tri = { k: "med", dir: 1 };

export const TRIS: readonly { v: string; label: string }[] = [
  { v: "med:1", label: "Prix croissant" },
  { v: "med:-1", label: "Prix décroissant" },
  { v: "nom:1", label: "Nom, de A à Z" },
  { v: "massif:1", label: "Massif, puis prix" },
  { v: "n:-1", label: "Nombre de logements" },
];

/** Le tri par massif ignore le sens : il n'a qu'une valeur. */
export function triVal(t: Tri): string {
  return t.k === "massif" ? "massif:1" : `${t.k}:${t.dir}`;
}

const CLES_TRI: readonly Tri["k"][] = ["med", "nom", "massif", "n"];

export function lireTri(v: string): Tri {
  const [k, d] = v.split(":");
  const cle = CLES_TRI.find((c) => c === k);
  if (!cle || (d !== "1" && d !== "-1")) return TRI0;
  return { k: cle, dir: cle === "massif" || d === "1" ? 1 : -1 };
}

/** Un clic d'en-tête peut poser un sens que la liste ne propose pas : le
 *  libellé le nomme quand même, plutôt que d'afficher le premier choix. */
export function triLbl(t: Tri): string {
  if (t.k === "nom" && t.dir === -1) return "Nom, de Z à A";
  if (t.k === "n" && t.dir === 1) return "Nombre de logements, croissant";
  return TRIS.find((x) => x.v === triVal(t))?.label ?? TRIS[0].label;
}

/** Nombre de stations décroissant, égalité départagée par le nom. */
export function ordreMassifs(stations: readonly Station[]): string[] {
  const compte = new Map<string, number>();
  for (const s of stations) compte.set(s.massif, (compte.get(s.massif) ?? 0) + 1);
  return [...compte.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .map(([m]) => m);
}

function parId(a: Ligne, b: Ligne): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Deux stations portent le même nom (« Praloup », « Le Granier ») : l'id
 *  départage, pour un ordre stable. */
function parNom(a: Ligne, b: Ligne): number {
  return a.nom.localeCompare(b.nom, "fr") || parId(a, b);
}

function parPrix(a: Ligne, b: Ligne): number {
  if (a.med == null && b.med == null) return parNom(a, b);
  if (a.med == null) return 1;
  if (b.med == null) return -1;
  return a.med - b.med || parNom(a, b);
}

/** Une station sans valeur passe en fin de liste dans les deux sens : un
 *  tri décroissant ne doit pas ouvrir sur des lignes vides. */
export function comparateur(
  t: Tri,
  rangMassif: ReadonlyMap<string, number>,
): (a: Ligne, b: Ligne) => number {
  if (t.k === "nom") return (a, b) => t.dir * a.nom.localeCompare(b.nom, "fr") || parId(a, b);
  if (t.k === "massif") {
    const rang = (m: string) => rangMassif.get(m) ?? Number.MAX_SAFE_INTEGER;
    return (a, b) => rang(a.massif) - rang(b.massif) || parPrix(a, b);
  }
  const k = t.k;
  return (a, b) => {
    const va = a[k];
    const vb = b[k];
    if (va == null && vb == null) return parNom(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    return t.dir * (va - vb) || parNom(a, b);
  };
}

/* ---------- Libellés ---------- */

export function plur(n: number, un: string, plusieurs: string): string {
  return `${n} ${n > 1 ? plusieurs : un}`;
}

/** « 12 stations sur 320 » */
export function countFl(n: number, total: number): string {
  return `${plur(n, "station", "stations")} sur ${total}`;
}

/** « 40 affichées sur 320 », « 1 affichée sur 1 » */
export function countLbl(affichees: number, total: number): string {
  return `${plur(affichees, "affichée", "affichées")} sur ${total}`;
}

export function moreLbl(restant: number): string {
  return `Afficher ${Math.min(PAGE, restant)} de plus`;
}

export function relLbl(n: number, listeFaite: boolean): string {
  if (listeFaite)
    return n === 1 ? "Relever à nouveau la station" : `Relever à nouveau les ${n} stations`;
  return n === 1 ? "Relever la station affichée" : `Relever les ${n} stations de la liste`;
}

/** Le nom d'une liste lancée : massif et département, les plages n'y entrent pas. */
export function nomListe(fl: Filtres): string {
  return [fl.massif, fl.dept].filter(Boolean).join(", ") || "stations de la liste";
}

export type Jeton = { k: keyof Filtres; lbl: string };

function jetonsPlages(defs: readonly DefPlage[], fl: Filtres, b: Bornes): Jeton[] {
  const out: Jeton[] = [];
  for (const def of defs) {
    const pl = fl[def.k];
    if (pl != null) out.push({ k: def.k, lbl: `${def.lbl} : ${plageLbl(def.k, pl, b[def.k])}` });
  }
  return out;
}

/** Les jetons de l'onglet « Par station » : le budget n'y paraît pas. */
export function jetons(fl: Filtres, b: Bornes): Jeton[] {
  const out: Jeton[] = [];
  if (fl.massif) out.push({ k: "massif", lbl: fl.massif });
  if (fl.dept) out.push({ k: "dept", lbl: fl.dept });
  if (fl.avecPrix) out.push({ k: "avecPrix", lbl: "Avec un prix" });
  return [...out, ...jetonsPlages(PLAGES, fl, b)];
}

/** Les jetons de l'onglet « Par budget » : le budget d'abord, puis la station. */
export function jetonsBudget(fl: Filtres, b: Bornes): Jeton[] {
  const out: Jeton[] = [];
  if (fl.budget != null) {
    out.push({ k: "budget", lbl: `Budget : ${plageLbl("budget", fl.budget, b.budget)}` });
  }
  if (fl.massif) out.push({ k: "massif", lbl: fl.massif });
  if (fl.dept) out.push({ k: "dept", lbl: fl.dept });
  return [...out, ...jetonsPlages(PLAGES_STATION, fl, b)];
}

/** Retirer le massif retire aussi le département : il en dépendait. */
export function retirerJeton(fl: Filtres, k: keyof Filtres): Filtres {
  if (k === "massif") return { ...fl, massif: "", dept: "" };
  if (k === "dept") return { ...fl, dept: "" };
  if (k === "avecPrix") return { ...fl, avecPrix: false };
  const next = { ...fl };
  next[k] = null;
  return next;
}

/** « 5 sans capacité annoncée, 2 trop petites » : ce que le relevé a écarté du compte. */
export function annSub(r: Resultat | null): string {
  if (r?.etat !== "fait") return "";
  const parts: string[] = [];
  if (r.muettes > 0) parts.push(`${r.muettes} sans capacité annoncée`);
  if (r.petits > 0) parts.push(plur(r.petits, "trop petite", "trop petites"));
  return parts.join(", ");
}

/** « partiel, sans Airbnb ni Booking » : après « sans », le dernier nom se
 *  relie par « ni », pas par une virgule. */
export function partielLbl(sources: readonly string[]): string {
  if (sources.length === 0) return "";
  const tete = sources.slice(0, -1);
  const dernier = sources[sources.length - 1];
  return `partiel, sans ${tete.length > 0 ? `${tete.join(", ")} ni ${dernier}` : dernier}`;
}

function deux(n: number): string {
  return String(n).padStart(2, "0");
}

/** « 24 sept. 2026 », jour du relevé à l'heure de l'utilisateur : le jour
 *  UTC datait de la veille tout relevé fait entre minuit et 2 h à Paris. Un
 *  horodatage hors de l'échelle des dates (stockage abîmé) ne se date pas,
 *  il ne casse pas l'écran. */
export function releveLbl(r: Resultat | null): string {
  if (!r) return "";
  const d = new Date(r.ts);
  if (Number.isNaN(d.getTime())) return "";
  const an = String(d.getFullYear()).padStart(4, "0");
  return formatDayIso(`${an}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`);
}

export function sousTitre(nights: number, trav: number): string {
  return `Médiane du total pour ${nuitsLbl(nights)}, parmi les logements qui accueillent ${travLbl(trav)}.`;
}

export function ecartLbl(sejour: Periode): string {
  return `Votre séjour : ${perLbl(sejour)}, ${nuitsLbl(sejour.nights)}.`;
}

export function medHead(nights: number): string {
  return `Médiane, ${nuitsLbl(nights)}`;
}

/** Compte à rebours, arrondi à la seconde supérieure : « 45 s », « 1 min 5 s ».
 *  Jamais négatif ; une attente écoulée se lit « 0 s ». */
export function dureeLbl(ms: number): string {
  const s = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const reste = s % 60;
  return reste ? `${min} min ${reste} s` : `${min} min`;
}

/* ---------- Onglet « Par budget » ---------- */

/** La maquette coupait à 60 cartes sans le dire : on pagine par 60. */
export const PAGE_CARTES = 60;

export type TriB = "prix:1" | "prix:-1" | "cap:-1";
export const TRIB0: TriB = "prix:1";
export const TRIS_B: readonly { v: TriB; label: string }[] = [
  { v: "prix:1", label: "Prix croissant" },
  { v: "prix:-1", label: "Prix décroissant" },
  { v: "cap:-1", label: "Capacité" },
];

export function lireTriB(v: string): TriB {
  return TRIS_B.find((t) => t.v === v)?.v ?? TRIB0;
}

export type CarteAnnonce = { a: AnnonceRetenue; stationId: string; stationNom: string };

function ordreTexte(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Une annonce à mi-chemin de deux stations peut sortir des deux relevés :
 *  la station départage après l'id, pour un ordre stable. */
function parCarte(p: CarteAnnonce, q: CarteAnnonce): number {
  return ordreTexte(p.a.id, q.a.id) || ordreTexte(p.stationId, q.stationId);
}

/** Capacité : la plus grande d'abord, puis la moins chère. */
export function comparateurBudget(t: TriB): (p: CarteAnnonce, q: CarteAnnonce) => number {
  if (t === "cap:-1") {
    return (p, q) =>
      (q.a.guests ?? 0) - (p.a.guests ?? 0) || p.a.total - q.a.total || parCarte(p, q);
  }
  const dir = t === "prix:-1" ? -1 : 1;
  return (p, q) => dir * (p.a.total - q.a.total) || parCarte(p, q);
}

/** « 12 logements dans 3 stations », « 0 logement ». */
export function countBudget(nAnnonces: number, nStations: number): string {
  const n = plur(nAnnonces, "logement", "logements");
  return nStations > 0 ? `${n} dans ${plur(nStations, "station", "stations")}` : n;
}

/** D'où viennent les logements proposés : les stations relevées pour ces dates. */
export function couverture(
  per: Periode,
  nomsAvec: readonly string[],
  total: number,
  trav: number,
): string {
  if (nomsAvec.length === 0) {
    return `Aucune station n’a d’annonces relevées ${perLbl(per)}, ${nuitsLbl(per.nights)}.`;
  }
  return (
    `Annonces relevées ${perLbl(per)} dans ${plur(nomsAvec.length, "station", "stations")} ` +
    `sur ${total} : ${nomsAvec.join(", ")}. Seuls les logements qui accueillent ` +
    `${travLbl(trav)} et publient leur capacité sont proposés.`
  );
}

/** Pourquoi la liste est vide : pas de relevé, le budget, ou les critères de station. */
export function videBudget(
  aucunReleve: boolean,
  avantBudget: number,
): { titre: string; hint: string; versStation: boolean } {
  if (aucunReleve) {
    return {
      titre: "Aucune annonce relevée pour ces dates",
      hint: "Les logements proposés viennent des relevés. Lancez un relevé dans l’onglet Par station, ou revenez à des dates déjà relevées.",
      versStation: true,
    };
  }
  if (avantBudget > 0) {
    return {
      titre: "Aucun logement dans ce budget",
      hint: `${plur(avantBudget, "logement correspond", "logements correspondent")} aux autres critères. Élargissez le budget pour ${avantBudget > 1 ? "les" : "le"} voir.`,
      versStation: false,
    };
  }
  return {
    titre: "Aucun logement ne correspond à ces critères",
    hint: "Retirez un critère de station, ou effacez-les tous.",
    versStation: false,
  };
}

export function sousTitreBudget(nights: number, trav: number): string {
  return `Logements qui accueillent ${travLbl(trav)} pour ${nuitsLbl(nights)}, dans votre budget.`;
}

/** « soit 298 € par personne » */
export function ppLbl(total: number, trav: number): string {
  return `soit ${eur(total / trav)} par personne`;
}

/* `capLbl` et `bedLbl` de `v7.ts` lisent un `Listing` entier, qu'une annonce
   compacte n'est pas : mêmes règles, recopiées, et un test les garde alignées. */
function capaciteLbl(a: AnnonceRetenue): string {
  return a.guests != null ? `${a.guests} pers.` : "capacité non annoncée";
}

function chambresLbl(a: AnnonceRetenue): string {
  if (a.bedrooms == null) {
    if (a.rooms != null && a.rooms > 0) return a.rooms === 1 ? "1 pièce" : `${a.rooms} pièces`;
    return "chambres non annoncées";
  }
  if (a.bedrooms === 0) return "studio";
  return `${a.bedrooms} ch.`;
}

/** « Airbnb · 8 pers. · 3 ch. » */
export function metaAnnonce(a: AnnonceRetenue): string {
  return [a.source, capaciteLbl(a), chambresLbl(a)].filter(Boolean).join(" · ");
}

/** Le verdict de disponibilité à l'affichage : un relevé retenu hier a
 *  vieilli depuis, et le dit. `confirme` sépare le prix frais, pour ces dates,
 *  de tous les autres cas : l'écran ne colore que lui comme un succès. */
export function dispo(
  a: AnnonceRetenue,
  per: Periode,
  now: number,
): { confirme: boolean; lbl: string } {
  const v = availabilityOf(a, { checkIn: per.from, checkOut: departIso(per) }, now);
  return { confirme: v.status === "confirmed", lbl: availabilityLabel(v) };
}

export function dispoLbl(a: AnnonceRetenue, per: Periode, now: number): string {
  return dispo(a, per, now).lbl;
}

/* ---------- File des relevés ---------- */

export type Job = { nom: string; ids: string[]; per: Periode; groupe: Groupe };

/** Même période, même groupe, mêmes stations dans le même ordre : même relevé.
 *  Le nom n'y entre pas, deux listes homonymes peuvent différer. */
export function signature(j: Pick<Job, "ids" | "per" | "groupe">): string {
  return `${perKey(j.per)}|${grpKey(j.groupe)}|${j.ids.join(",")}`;
}

export function dejaPrevu(j: Job, course: Job | null, file: readonly Job[]): boolean {
  const sig = signature(j);
  if (course && signature(course) === sig) return true;
  return file.some((x) => signature(x) === sig);
}

/** Les stations de `ids` qu'aucun relevé de même période et même groupe n'a
 *  pris en charge : ni la course, stations déjà faites comprises, ni la file.
 *  Une liste filtrée grandit pendant un relevé (« Avec un prix seulement ») :
 *  relancée telle quelle, elle referait les stations déjà prévues. Et une
 *  station que la course vient de finir n'est pas à refaire : sans cela, le
 *  bouton revenait en pleine course pour relever à nouveau ce qui venait de
 *  l'être. */
export function idsALancer(
  ids: readonly string[],
  per: Periode,
  groupe: Groupe,
  course: (Job & { i: number }) | null,
  file: readonly Job[],
): string[] {
  const cle = `${perKey(per)}|${grpKey(groupe)}`;
  const meme = (j: Job) => `${perKey(j.per)}|${grpKey(j.groupe)}` === cle;
  const prevus = new Set<string>();
  if (course && meme(course)) for (const id of course.ids) prevus.add(id);
  for (const j of file) if (meme(j)) for (const id of j.ids) prevus.add(id);
  return ids.filter((id) => !prevus.has(id));
}

/** Garde les `max` résultats les plus récents. Rend l'objet d'origine quand
 *  rien ne part, pour ne pas réécrire le stockage sans raison. */
export function elaguer(
  res: Readonly<Record<string, Resultat>>,
  max: number = MAX_RESULTATS,
): Record<string, Resultat> {
  const entrees = Object.entries(res);
  const garde = Math.max(0, Math.floor(max));
  if (entrees.length <= garde) return res as Record<string, Resultat>;
  entrees.sort((a, b) => b[1].ts - a[1].ts);
  return Object.fromEntries(entrees.slice(0, garde));
}
