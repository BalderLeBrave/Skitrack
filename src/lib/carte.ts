/** Carte des stations : recherche, massif, filtres, tri.
 *
 *  Chaque filtre chiffré est une fourchette, et toutes portent sur des valeurs
 *  mesurées. Une station dont le champ filtré n'est pas mesuré ne « passe »
 *  pas une fourchette active : elle en sort, elle n'est pas comptée comme
 *  zéro. Le tri va dans les deux sens, le non mesuré toujours en queue. */

import { domaineNomme, sansDomaineAlpin, type ColorShare } from "./classeur.ts";
import { domainForStation } from "./forfaits/catalog.ts";
import { dansPlage, type Echelle, type Plage } from "./plage.ts";
import type { Station } from "./stations.ts";
import { parMesure, parTexte, type Sens } from "./tri.ts";

export type CarteOrder = "km" | "v" | "lo" | "hi" | "np" | "lifts" | "n";

export const CARTE_ORDERS: readonly [CarteOrder, string][] = [
  ["km", "km de pistes"],
  ["v", "altitude du village"],
  ["lo", "bas des pistes"],
  ["hi", "sommet"],
  ["np", "tronçons de pistes"],
  ["lifts", "remontées"],
  ["n", "nom"],
];

export const CARTE_SORT_LABELS: Record<CarteOrder, string> = Object.fromEntries(
  CARTE_ORDERS,
) as Record<CarteOrder, string>;

/** Le sens de départ de chaque critère : le plus grand d'abord, le nom de A à Z. */
export const CARTE_SENS: Record<CarteOrder, Sens> = {
  km: -1,
  v: -1,
  lo: -1,
  hi: -1,
  np: -1,
  lifts: -1,
  n: 1,
};

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

/** L'échelle des fourchettes par couleur, selon l'unité. */
export const COLOR_RANGE: Record<ColorUnit, { b: Echelle; pas: number; suffix: string; unite: string }> = {
  pct: { b: [0, 60], pas: 5, suffix: " %", unite: "%" },
  n: { b: [0, 200], pas: 5, suffix: " tronçons", unite: "tronç." },
  km: { b: [0, 200], pas: 10, suffix: " km", unite: "km" },
};

/** Les critères chiffrés de la carte : chacun est une fourchette. */
export type CarteFourchette = "villageM" | "loM" | "hiM" | "km" | "lifts";

export type CarteFilters = {
  villageM: Plage;
  loM: Plage;
  hiM: Plage;
  km: Plage;
  lifts: Plage;
  /** "" = tous. */
  kind: "" | "station" | "village-station";
  /** "" = tous, "__none" = sans domaine renseigné. */
  domain: string;
  colors: Record<ColorKey, Plage>;
};

export const NO_FILTERS: CarteFilters = {
  villageM: null,
  loM: null,
  hiM: null,
  km: null,
  lifts: null,
  kind: "",
  domain: "",
  colors: { green: null, blue: null, red: null, black: null },
};

/** L'échelle et le pas de chaque fourchette. La borne haute au bout de
 *  l'échelle veut dire « et plus ». */
export const CARTE_ECHELLES: Record<CarteFourchette, { b: Echelle; pas: number }> = {
  villageM: { b: [0, 2400], pas: 100 },
  loM: { b: [0, 2200], pas: 100 },
  hiM: { b: [0, 3400], pas: 100 },
  km: { b: [0, 300], pas: 10 },
  lifts: { b: [0, 150], pas: 5 },
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

/** Une altitude ou un kilométrage à zéro n'est pas une mesure : La Bourboule,
 *  détachée de Super Besse, porte 0 m en bas et en haut des pistes. */
function mesuree(v: number | null | undefined): number | null {
  return v != null && v > 0 ? v : null;
}

/** Ce que chaque fourchette lit sur la station. */
const LECTURE_CARTE: Record<CarteFourchette, (s: Station) => number | null> = {
  villageM: (s) => mesuree(s.villageM),
  loM: (s) => mesuree(s.minM),
  hiM: (s) => mesuree(s.maxM),
  km: (s) => mesuree(s.pistesKm),
  lifts: (s) => s.lifts,
};

export function passesFilters(station: Station, f: CarteFilters, unit: ColorUnit): boolean {
  for (const k of Object.keys(CARTE_ECHELLES) as CarteFourchette[]) {
    if (!dansPlage(LECTURE_CARTE[k](station), f[k], CARTE_ECHELLES[k].b)) return false;
  }
  if (f.kind && station.kind !== f.kind) return false;
  if (f.domain === "__none" ? station.domain != null : f.domain && station.domain !== f.domain) {
    return false;
  }
  for (const c of COLOR_KEYS) {
    if (!dansPlage(colorValue(station, c, unit), f.colors[c], COLOR_RANGE[unit].b)) return false;
  }
  return true;
}

export function activeFilterCount(f: CarteFilters): number {
  let n = 0;
  for (const k of Object.keys(CARTE_ECHELLES) as CarteFourchette[]) if (f[k] != null) n += 1;
  if (f.kind) n += 1;
  if (f.domain) n += 1;
  for (const c of COLOR_KEYS) if (f.colors[c] != null) n += 1;
  return n;
}

/** Massifs présents dans le référentiel, pour les puces du bandeau. */
export function stationMassifs(rows: readonly Station[]): string[] {
  return [...new Set(rows.map((s) => s.massif))].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Domaines skiables rattachés, pour le sélecteur du panneau de filtres. Le
 *  libellé « domaine non nommé (OpenStreetMap) » n'en est pas un : il réunirait
 *  Beille, Névache et Saint-Colomban, sans rapport entre elles. */
export function stationDomains(rows: readonly Station[]): string[] {
  return [...new Set(rows.map((s) => s.domain).filter(domaineNomme))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
}

export function filterMassif(rows: readonly Station[], massif: string | null): Station[] {
  return massif ? rows.filter((s) => s.massif === massif) : [...rows];
}

/** Ligne secondaire : ce que la station est, et d'où viennent ses chiffres. */
export function stationTags(station: Station): string {
  const bits: string[] = [];
  if (station.kind === "village-station") bits.push("Village-station");
  // Sans domaine alpin, c'est une donnée : La Bourboule n'a plus de ski alpin.
  // « non renseigné » la confondait avec un relevé manquant.
  bits.push(
    station.domain ??
      (sansDomaineAlpin(station.id) ? "Sans domaine alpin" : "Domaine non renseigné"),
  );
  if (station.status && station.status !== "En activité") {
    bits.push(station.status.replace(/^En activité[,( ]*/, "").replace(/\)$/, ""));
  }
  if (!station.inClasseur) bits.push("fiche Skiinfo, absente de France Montagnes");
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
  return km != null && km > 0 ? `${Math.round(km).toLocaleString("fr-FR")} km` : "–";
}

/** Recherche sans accents ni casse : « megeve » trouve « Megève ». */
/**
 * Le nom d'une station réduit à ce qui compte pour une recherche : sans
 * accents, sans casse, et sans les traits d'union ni les apostrophes qui
 * séparent ses mots.
 *
 * Ces séparateurs se tapent rarement. Depuis que les noms portent leur
 * typographie — « Saint-Martin-de-Belleville », « L'Alpe d'Huez » —, les
 * chercher avec des espaces ne rendait plus rien.
 */
export function foldName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchStations(rows: readonly Station[], query: string): Station[] {
  const q = foldName(query);
  if (!q) return [...rows];
  return rows.filter((s) => foldName(s.name).includes(q) || foldName(s.domain ?? "").includes(q));
}

const SORT_VALUE: Record<Exclude<CarteOrder, "n">, (s: Station) => number | null> = {
  km: (s) => s.pistesKm,
  v: (s) => mesuree(s.villageM),
  lo: (s) => mesuree(s.minM),
  hi: (s) => mesuree(s.maxM),
  np: (s) => s.segments,
  lifts: (s) => s.lifts,
};

/** Dans le sens demandé, par défaut celui du critère (`CARTE_SENS`) : le plus
 *  grand d'abord, le nom de A à Z. Les valeurs non mesurées finissent en
 *  queue, dans les deux sens. */
export function orderStations(
  rows: readonly Station[],
  order: CarteOrder,
  sens: Sens = CARTE_SENS[order],
): Station[] {
  const out = [...rows];
  if (order === "n") {
    out.sort((a, b) => parTexte(a.name, b.name, sens));
    return out;
  }
  const value = SORT_VALUE[order];
  out.sort((a, b) => parMesure(value(a), value(b), sens));
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
   Le cadre visible de la carte
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Les quatre bornes du cadre, telles que Leaflet les rend.
 *
 * Nommées en français et à plat plutôt qu'en `LatLngBounds` : cette fonction
 * doit se tester sans carte, donc sans Leaflet.
 */
export type Bornes = { sud: number; ouest: number; nord: number; est: number };

/** Le minimum qu'il faut porter pour être situé quelque part. */
export type PointCarte = { lat?: number | null; lon?: number | null };

/**
 * Ce point est-il dans le cadre ?
 *
 * **Une entrée sans coordonnées répond `true`.** Elle n'est pas dans le cadre,
 * elle n'a pas de cadre : la carte ne peut ni la montrer ni la cacher, et la
 * masquer parce qu'on ignore où elle est reviendrait à punir un relevé
 * incomplet. Les écrans la comptent à part et le disent.
 *
 * Sans cadre — la carte n'a pas encore rendu ses bornes, ou l'utilisateur n'a
 * pas demandé à filtrer — tout répond `true`.
 */
export function dansLesBornes(p: PointCarte, b: Bornes | null): boolean {
  if (!b) return true;
  if (p.lat == null || p.lon == null) return true;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return true;
  if (p.lat < b.sud || p.lat > b.nord) return false;
  // Un cadre qui enjambe l'antiméridien a son est à l'ouest de son ouest. La
  // France n'y va pas, mais une carte se déplace sans demander la permission.
  return b.ouest <= b.est
    ? p.lon >= b.ouest && p.lon <= b.est
    : p.lon >= b.ouest || p.lon <= b.est;
}

/**
 * Sépare une liste en trois, parce qu'il y a trois situations et non deux :
 * ce que la carte montre, ce qu'elle ne montre pas, et ce qu'elle ne peut pas
 * montrer faute de position.
 */
export function partagerParBornes<T extends PointCarte>(
  rows: readonly T[],
  b: Bornes | null,
): { visibles: T[]; horsCadre: T[]; sansPosition: T[] } {
  const visibles: T[] = [];
  const horsCadre: T[] = [];
  const sansPosition: T[] = [];
  for (const r of rows) {
    const situe = r.lat != null && r.lon != null && Number.isFinite(r.lat) && Number.isFinite(r.lon);
    if (!situe) {
      sansPosition.push(r);
      visibles.push(r);
      continue;
    }
    if (dansLesBornes(r, b)) visibles.push(r);
    else horsCadre.push(r);
  }
  return { visibles, horsCadre, sansPosition };
}

/** « 3 sans localisation », ou rien du tout. */
export function sansPositionLabel(n: number): string {
  if (n <= 0) return "";
  return `${n} sans localisation`;
}
