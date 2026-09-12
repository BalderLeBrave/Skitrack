/** Référentiel des stations FR : classeur France Montagnes × OpenSkiMap (284),
 *  plus les stations du dépôt absentes du classeur (36) — 320 entrées.
 *
 *  Clé primaire : l'identifiant du dépôt partout où la station y existe. Les
 *  231 identifiants du dépôt survivent donc tous, inchangés — voir
 *  `stationMigration.ts` et son test. Les 89 stations que seul le classeur
 *  décrit portent un identifiant dérivé de leur nom.
 *
 *  Ce que le dépôt garde la main sur : nom curé, altitudes vérifiées, IGN RGE
 *  ALTI au pin, photo, mix Skiinfo. Ce que le classeur apporte : type, statut,
 *  domaine, km, remontées, tronçons par couleur, distance à la piste.
 *
 *  **Aucune valeur n'est estimée.** Un champ d'échelle domaine vient du domaine
 *  de rattachement ou vaut `null` ; un champ d'échelle station vaut `null` s'il
 *  n'est pas mesuré. L'écran affiche l'absence, il ne la comble pas. */

import {
  CLASSEUR,
  shareFromCounts,
  type ColorCounts,
  type ColorShare,
  type MeasureScale,
  type StationKind,
} from "./classeur.ts";
import type { StationSlopes } from "./pistes.ts";
import { SKIINFO_AT, skiinfoPhoto, slopesFromSkiinfo } from "./skiinfo.ts";
import rows from "./stations.data.json" with { type: "json" };

export type PinKind = "base" | "sommet" | "autre" | "inconnu";

/** « depot » : la station a une fiche Skiinfo et une altitude IGN au pin. */
export type StationOrigin = "classeur" | "depot";

export type Station = {
  id: string;
  name: string;
  massif: string;
  villageM: number;
  minM: number;
  maxM: number;
  photo: string | null;
  fmId: number | null;
  fmVillageM: number | null;
  fmMinM: number | null;
  fmMaxM: number | null;
  /** IGN RGE ALTI au pin. null hors du référentiel du dépôt. */
  demM: number | null;
  pinKind: PinKind;
  gpsDup: boolean;
  lat: number;
  lon: number;
  /** Mix de pistes à l'échelle de la fiche Skiinfo. */
  slopes: StationSlopes;
  origin: StationOrigin;
  /** Présente au classeur France Montagnes. Faux pour les 36 reprises de la
   *  seule fiche Skiinfo — axe distinct d'`origin`, qui dit l'inverse : avoir
   *  une fiche au dépôt. */
  inClasseur: boolean;
  kind: StationKind;
  dept: string | null;
  commune: string | null;
  /** « En activité », « En activité (bénévole) »… null hors classeur. */
  status: string | null;
  domain: string | null;
  /** Km de pistes, avec l'échelle du relevé. */
  pistesKm: number | null;
  pistesKmScale: MeasureScale | null;
  /** Tronçons de pistes du domaine. */
  segments: number | null;
  lifts: number | null;
  liftsScale: MeasureScale | null;
  /** Distance village → première piste, en km. */
  distToPisteKm: number | null;
  colorShare: ColorShare | null;
  colorScale: MeasureScale | null;
  colorCounts: ColorCounts | null;
  /** % de la fiche Skiinfo — autre échelle que `colorShare` du domaine. */
  skiinfoPct: ColorShare | null;
  measuredAt: string | null;
  medianM: number | null;
  above2000Pct: number | null;
};

type DepotRow = {
  id: string;
  name: string;
  massif: string;
  villageM: number;
  minM: number;
  maxM: number;
  photo: string | null;
  fmId: number | null;
  fmVillageM: number | null;
  fmMinM: number | null;
  fmMaxM: number | null;
  demM: number | null;
  pinKind: PinKind;
  gpsDup: boolean;
  lat: number;
  lon: number;
};

/** % par couleur publiés par la fiche Skiinfo — autre échelle que le domaine. */
function pctOf(slopes: StationSlopes): ColorShare | null {
  const p = slopes.pct;
  if (!p) return null;
  const g = p.green ?? 0,
    b = p.blue ?? 0,
    r = p.red ?? 0,
    k = p.black ?? 0;
  return g + b + r + k > 0 ? { green: g, blue: b, red: r, black: k } : null;
}

const DEPOT: DepotRow[] = rows as DepotRow[];
const DEPOT_BY_ID = new Map(DEPOT.map((r) => [r.id, r]));

/** Mix pour une station que seul le classeur décrit : les tronçons du domaine,
 *  marqués `source: "osm"`. La colonne « non classées » reste dehors —
 *  `slopes` porte la sémantique Skiinfo, qui n'a pas cette colonne, et les
 *  filtres de pistes s'y adossent. Elle vit dans `colorCounts.other`. */
function slopesFromClasseur(km: number | null, cnt: ColorCounts | null): StationSlopes {
  if (!cnt) {
    return { announcedKm: km ?? 0, counts: {}, source: "osm", quality: "partial" };
  }
  return {
    announcedKm: km ?? 0,
    counts: { green: cnt.green, blue: cnt.blue, red: cnt.red, black: cnt.black },
    source: "osm",
    quality: km != null && km > 0 ? "segments" : "partial",
  };
}

const FROM_CLASSEUR: Station[] = CLASSEUR.map((entry) => {
  const { fm } = entry;
  const depot = entry.depotId ? DEPOT_BY_ID.get(entry.depotId) : undefined;
  // Les chiffres de domaine viennent de `entry.measure`, pas de la ligne :
  // celle d'une station dont le rattachement a été corrigé porte encore les
  // mesures de l'ancien domaine. Voir `classeur.ts`, étape 5.
  const cnt = entry.measure.counts;
  const slopes = depot ? slopesFromSkiinfo(entry.id) : slopesFromClasseur(entry.measure.km, cnt);
  return {
    id: entry.id,
    // Le classeur porte des coquilles (« Gourrette », « Fond d'Urle ») : le nom
    // curé du dépôt prime partout où il existe.
    name: depot?.name ?? fm.fmName,
    massif: depot?.massif ?? fm.massif,
    villageM: depot?.villageM ?? fm.village ?? 0,
    minM: depot?.minM ?? fm.min ?? 0,
    maxM: depot?.maxM ?? fm.max ?? 0,
    photo: skiinfoPhoto(entry.id),
    fmId: depot?.fmId ?? null,
    fmVillageM: depot?.fmVillageM ?? null,
    fmMinM: depot?.fmMinM ?? null,
    fmMaxM: depot?.fmMaxM ?? null,
    demM: depot?.demM ?? null,
    pinKind: depot?.pinKind ?? "inconnu",
    gpsDup: depot?.gpsDup ?? false,
    lat: depot?.lat ?? fm.lat,
    lon: depot?.lon ?? fm.lon,
    slopes,
    origin: depot ? "depot" : "classeur",
    inClasseur: true,
    kind: entry.kind,
    dept: fm.departement || null,
    commune: fm.commune || null,
    status: fm.status || null,
    domain: entry.domain,
    // Échelle domaine : joints tels quels, jamais recalculés.
    pistesKm: entry.measure.km,
    pistesKmScale: entry.measure.km != null ? ("domaine" as MeasureScale) : null,
    segments: entry.measure.slopes,
    lifts: entry.measure.lifts,
    liftsScale: entry.measure.lifts != null ? ("domaine" as MeasureScale) : null,
    // Échelle station : mesurée ou nulle.
    distToPisteKm: fm.slopeDistance,
    colorShare: shareFromCounts(cnt),
    colorScale: cnt ? ("domaine" as MeasureScale) : null,
    colorCounts: cnt,
    skiinfoPct: pctOf(slopes),
    measuredAt: depot ? SKIINFO_AT : null,
    medianM: fm.median,
    above2000Pct: fm.highShare,
  } satisfies Station;
});

const IN_CLASSEUR = new Set(FROM_CLASSEUR.map((s) => s.id));

/** Stations du dépôt qu'aucune ligne du classeur ne réclame. On ne les perd
 *  pas : leur fiche, leurs séjours et leurs logements existent déjà. Leurs
 *  champs d'échelle domaine sont nuls — elles n'ont pas de domaine rattaché. */
const DEPOT_ONLY: Station[] = DEPOT.filter((r) => !IN_CLASSEUR.has(r.id)).map((r) => {
  const slopes = slopesFromSkiinfo(r.id);
  return {
    ...r,
    photo: skiinfoPhoto(r.id),
    slopes,
    origin: "depot",
    inClasseur: false,
    kind: "station",
    dept: null,
    commune: null,
    status: null,
    domain: null,
    pistesKm: null,
    pistesKmScale: null,
    segments: null,
    lifts: null,
    liftsScale: null,
    distToPisteKm: null,
    colorShare: null,
    colorScale: null,
    colorCounts: null,
    skiinfoPct: pctOf(slopes),
    measuredAt: SKIINFO_AT,
    medianM: null,
    above2000Pct: null,
  } satisfies Station;
});

export const STATIONS: Station[] = [...FROM_CLASSEUR, ...DEPOT_ONLY];

/** Les 231 du dépôt : seules à porter `demM` et une fiche Skiinfo. */
export const DEPOT_STATIONS: Station[] = STATIONS.filter((s) => s.origin === "depot");

const BY_ID = new Map(STATIONS.map((s) => [s.id, s]));

export function stationById(id: string): Station | undefined {
  return BY_ID.get(id);
}

export function dropM(station: Station): number {
  return Math.max(0, station.maxM - station.minM);
}

export function formatAlt(n: number): string {
  return `${n.toLocaleString("fr-FR")} m`;
}
