/** IGN RGE ALTI = altitude d’un point GPS. Skiinfo = bande publiée (base–sommet).
 *  On ne compare pas les km ni le mix : l’IGN n’en publie pas. */

import { SKIINFO } from "./skiinfo.ts";
import { DEPOT_STATIONS, type Station } from "./stations.ts";

export const PIN_NEAR_M = 150;

export type IgnSkiVerdict = "village" | "sommet" | "domaine" | "sous_base" | "sur_sommet" | "manque";

export type IgnSkiRow = {
  id: string;
  name: string;
  massif: string;
  ignM: number | null;
  skiMin: number | null;
  skiMax: number | null;
  dBase: number | null;
  dSummit: number | null;
  verdict: IgnSkiVerdict;
};

export function ignSkiinfo(station: Station): IgnSkiRow {
  const si = SKIINFO[station.id];
  const ignM = station.demM;
  const skiMin = si?.minM ?? null;
  const skiMax = si?.maxM ?? null;
  const dBase = ignM != null && skiMin != null ? ignM - skiMin : null;
  const dSummit = ignM != null && skiMax != null ? ignM - skiMax : null;
  return {
    id: station.id,
    name: station.name,
    massif: station.massif,
    ignM,
    skiMin,
    skiMax,
    dBase,
    dSummit,
    verdict: verdict(ignM, skiMin, skiMax),
  };
}

export function verdict(ign: number | null, lo: number | null, hi: number | null): IgnSkiVerdict {
  if (ign == null || lo == null || hi == null) return "manque";
  if (Math.abs(ign - lo) <= PIN_NEAR_M) return "village";
  if (Math.abs(ign - hi) <= PIN_NEAR_M) return "sommet";
  if (lo < ign && ign < hi) return "domaine";
  if (ign < lo) return "sous_base";
  return "sur_sommet";
}

export const VERDICT_FR: Record<IgnSkiVerdict, string> = {
  village: "IGN ≈ village Skiinfo",
  sommet: "IGN ≈ sommet Skiinfo",
  domaine: "IGN dans le domaine, pas au village publié",
  sous_base: "IGN sous la base Skiinfo (pin en vallée)",
  sur_sommet: "IGN au-dessus du sommet Skiinfo",
  manque: "donnée manquante",
};

/** Comparaison adossée à la fiche Skiinfo : seules les stations du dépôt
 *  en ont une, le classeur seul n’est pas comparable. */
export function ignSkiinfoAll(stations: readonly Station[] = DEPOT_STATIONS): IgnSkiRow[] {
  return stations.map(ignSkiinfo);
}

function medianAbs(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export type IgnSkiSummary = {
  n: number;
  village: number;
  sommet: number;
  domaine: number;
  sous_base: number;
  sur_sommet: number;
  manque: number;
  medianAbsBase: number | null;
};

export function ignSkiinfoSummary(rows: readonly IgnSkiRow[]): IgnSkiSummary {
  const count = (v: IgnSkiVerdict) => rows.filter((r) => r.verdict === v).length;
  return {
    n: rows.length,
    village: count("village"),
    sommet: count("sommet"),
    domaine: count("domaine"),
    sous_base: count("sous_base"),
    sur_sommet: count("sur_sommet"),
    manque: count("manque"),
    medianAbsBase: medianAbs(rows.map((r) => r.dBase).filter((n): n is number => n != null).map(Math.abs)),
  };
}
