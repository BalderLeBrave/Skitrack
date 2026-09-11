/** Carte des stations : recherche et ordre de la liste. */

import { dropM, type Station } from "./stations.ts";

export type CarteOrder = "catalog" | "name" | "summit" | "km" | "drop";

export const CARTE_ORDERS: readonly [CarteOrder, string][] = [
  ["catalog", "Catalogue"],
  ["name", "A → Z"],
  ["summit", "Plus haut"],
  ["km", "Plus de km"],
  ["drop", "Plus de dénivelé"],
];

/** Recherche sans accents ni casse : « megeve » trouve « Megève ». */
export function foldName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function searchStations(rows: readonly Station[], query: string): Station[] {
  const q = foldName(query);
  if (!q) return [...rows];
  return rows.filter((s) => foldName(s.name).includes(q));
}

export function orderStations(rows: readonly Station[], order: CarteOrder): Station[] {
  const out = [...rows];
  if (order === "name") out.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  else if (order === "summit") out.sort((a, b) => b.maxM - a.maxM);
  else if (order === "km") out.sort((a, b) => b.slopes.announcedKm - a.slopes.announcedKm);
  else if (order === "drop") out.sort((a, b) => dropM(b) - dropM(a));
  return out;
}
