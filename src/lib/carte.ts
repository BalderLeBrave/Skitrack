/** Carte des stations : recherche, massif, filtres, tri.
 *
 *  Tous les seuils portent sur des valeurs mesurées. Une station dont le champ
 *  filtré n'est pas mesuré ne « passe » pas un seuil actif : elle en sort, elle
 *  n'est pas comptée comme zéro. */

import type { ColorShare } from "./classeur.ts";
import { domainForStation } from "./forfaits/catalog.ts";
import type { Station } from "./stations.ts";

export type CarteOrder = "km" | "v" | "lo" | "hi" | "np" | "lifts" | "n";

export const CARTE_ORDERS: readonly [CarteOrder, string][] = [
  ["km", "km de pistes"],
  ["v", "altitude village"],
  ["lo", "bas des pistes"],
  ["hi", "sommet"],
  ["np", "tronçons de pistes"],
  ["lifts", "remontées"],
  ["n", "nom"],
];

export const CARTE_SORT_LABELS: Record<CarteOrder, string> = Object.fromEntries(
  CARTE_ORDERS,
) as Record<CarteOrder, string>;

export type ColorKey = keyof ColorShare;
export const COLOR_KEYS: readonly ColorKey[] = ["green", "blue", "red", "black"];
export const COLOR_LABELS: Record<ColorKey, string> = {
  green: "Vertes",
  blue: "Bleues",
  red: "Rouges",
  black: "Noires",
};
export const COLOR_HEX: Record<ColorKey, string> = {
  green: "#2e9e5b",
  blue: "#0b6fc2",
  red: "#d9382e",
  black: "#1b2530",
};

/** Unité du filtre par couleur. « n » et « km » ne valent que pour une station
 *  dont le domaine compte ses tronçons. */
export type ColorUnit = "pct" | "n" | "km";

export type CarteFilters = {
  villageM: number;
  loM: number;
  hiM: number;
  km: number;
  lifts: number;
  /** "" = tous. */
  kind: "" | "station" | "village-station";
  /** "" = tous, "__none" = sans domaine renseigné. */
  domain: string;
  colors: Record<ColorKey, number>;
};

export const NO_FILTERS: CarteFilters = {
  villageM: 0,
  loM: 0,
  hiM: 0,
  km: 0,
  lifts: 0,
  kind: "",
  domain: "",
  colors: { green: 0, blue: 0, red: 0, black: 0 },
};

/** Valeur d'une couleur dans l'unité demandée, ou `null` si non mesurée. Les
 *  km par couleur sont une part des km du domaine : approchés, et signalés
 *  comme tels par l'écran. */
export function colorValue(station: Station, color: ColorKey, unit: ColorUnit): number | null {
  if (unit === "pct") return station.colorShare?.[color] ?? null;
  if (unit === "n") return station.colorCounts?.[color] ?? null;
  const share = station.colorShare?.[color];
  if (share == null || station.pistesKm == null) return null;
  return Math.round((station.pistesKm * share) / 100);
}

/** Un seuil actif sur un champ non mesuré écarte la station. */
function atLeast(value: number | null | undefined, min: number): boolean {
  if (!min) return true;
  return value != null && value >= min;
}

export function passesFilters(station: Station, f: CarteFilters, unit: ColorUnit): boolean {
  if (!atLeast(station.villageM, f.villageM)) return false;
  if (!atLeast(station.minM, f.loM)) return false;
  if (!atLeast(station.maxM, f.hiM)) return false;
  if (!atLeast(station.pistesKm, f.km)) return false;
  if (!atLeast(station.lifts, f.lifts)) return false;
  if (f.kind && station.kind !== f.kind) return false;
  if (f.domain === "__none" ? station.domain != null : f.domain && station.domain !== f.domain) {
    return false;
  }
  for (const c of COLOR_KEYS) {
    if (!atLeast(colorValue(station, c, unit), f.colors[c])) return false;
  }
  return true;
}

export function activeFilterCount(f: CarteFilters): number {
  let n = 0;
  for (const k of ["villageM", "loM", "hiM", "km", "lifts"] as const) if (f[k]) n += 1;
  if (f.kind) n += 1;
  if (f.domain) n += 1;
  for (const c of COLOR_KEYS) if (f.colors[c]) n += 1;
  return n;
}

/** Massifs présents dans le référentiel, pour les puces du bandeau. */
export function stationMassifs(rows: readonly Station[]): string[] {
  return [...new Set(rows.map((s) => s.massif))].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Domaines skiables rattachés, pour le sélecteur du panneau de filtres. */
export function stationDomains(rows: readonly Station[]): string[] {
  return [...new Set(rows.map((s) => s.domain).filter((d): d is string => d != null))].sort(
    (a, b) => a.localeCompare(b, "fr"),
  );
}

export function filterMassif(rows: readonly Station[], massif: string | null): Station[] {
  return massif ? rows.filter((s) => s.massif === massif) : [...rows];
}

/** Ligne secondaire : ce que la station est, et d'où viennent ses chiffres. */
export function stationTags(station: Station): string {
  const bits: string[] = [];
  if (station.kind === "village-station") bits.push("Village-station");
  bits.push(station.domain ?? "Domaine non renseigné");
  if (station.status && station.status !== "En activité") {
    bits.push(station.status.replace(/^En activité[,( ]*/, "").replace(/\)$/, ""));
  }
  if (!station.inClasseur) bits.push("fiche Skiinfo, hors classeur");
  // Le forfait n'apparaît que s'il nomme autre chose que le domaine : le
  // classeur dit « Les Trois Vallées », le catalogue « Les 3 Vallées ».
  const pass = domainForStation(station.id)?.pass;
  if (pass && !sameDomainName(pass, station.domain)) bits.push(pass);
  return bits.filter(Boolean).join(" · ");
}

const DOMAIN_NOISE = new Set([
  "les",
  "la",
  "le",
  "des",
  "du",
  "de",
  "et",
  "en",
  "sur",
  "aux",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
]);

/** Deux graphies du même domaine : « Les 3 Vallées » et « Les Trois Vallées ».
 *  On compare les jetons porteurs de sens, articles et nombres retirés. */
function sameDomainName(a: string, b: string | null): boolean {
  if (!b) return false;
  const tokens = (s: string) =>
    new Set(
      foldName(s)
        .split(/[^a-z]+/)
        .filter((t) => t.length >= 3 && !DOMAIN_NOISE.has(t)),
    );
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return false;
  const subset = (m: Set<string>, n: Set<string>) => [...m].every((t) => n.has(t));
  return subset(x, y) || subset(y, x);
}

/** Km de pistes du domaine. Un tiret quand aucun domaine n'est rattaché. */
export function formatKm(km: number | null): string {
  return km != null && km > 0 ? `${Math.round(km).toLocaleString("fr-FR")} km` : "—";
}

/** Recherche sans accents ni casse : « megeve » trouve « Megève ». */
export function foldName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function searchStations(rows: readonly Station[], query: string): Station[] {
  const q = foldName(query);
  if (!q) return [...rows];
  return rows.filter((s) => foldName(s.name).includes(q) || foldName(s.domain ?? "").includes(q));
}

const SORT_VALUE: Record<Exclude<CarteOrder, "n">, (s: Station) => number | null> = {
  km: (s) => s.pistesKm,
  v: (s) => s.villageM,
  lo: (s) => s.minM,
  hi: (s) => s.maxM,
  np: (s) => s.segments,
  lifts: (s) => s.lifts,
};

/** Tri décroissant, sauf le nom. Les valeurs non mesurées finissent en queue. */
export function orderStations(rows: readonly Station[], order: CarteOrder): Station[] {
  const out = [...rows];
  if (order === "n") {
    out.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return out;
  }
  const value = SORT_VALUE[order];
  out.sort((a, b) => (value(b) ?? -1) - (value(a) ?? -1));
  return out;
}
