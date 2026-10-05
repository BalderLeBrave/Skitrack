/**
 * Le relevé d'un grand domaine relié : la station cherchée, puis ses voisines.
 *
 * Chercher La Plagne doit rendre aussi les logements de Champagny, de
 * Montchavin, de Peisey et des Arcs (verdict `linked`, `domainFit.ts`). Un
 * relevé centré sur le seul repère de La Plagne ne les atteignait pas : la
 * zone Airbnb et GreenGo s'arrête à 6 km, et Cozy, les centrales, les agences
 * et Gîtes de France cherchent par le nom, la commune ou les lieux de la
 * station. Chaque collecteur interroge donc aussi les stations reliées, avec
 * leur propre nom et leur propre repère.
 *
 * Seul l'écran Logements le demande (`LiveSearchInput.domaine`) : l'écran Prix
 * compare des stations, et le prix de La Plagne ne doit pas se faire avec les
 * logements des Arcs.
 *
 * Les annonces rendues restent celles du relevé de la station cherchée
 * (`stationId`) : c'est leur rattachement (`nearestDomainId`) qui dit sous
 * quelle station elles se rangent.
 */

import { grandDomaineDe } from "../grandsDomaines.ts";
import { metresBetween } from "../remontees.ts";
import { stationById, type Station } from "../stations.ts";
import { agencesDe, lieuxDe, type SourceAgence } from "./agences/couverture.ts";
import type { LiveSearchInput } from "./types";

/** Les stations reliées à celle de la recherche, la plus proche d'abord ; vide hors grand domaine. */
export function stationsReliees(input: LiveSearchInput): LiveSearchInput[] {
  if (!input.domaine) return [];
  const domaine = grandDomaineDe(input.stationId);
  if (!domaine) return [];
  const loin = (s: Pick<Station, "lat" | "lon">) => metresBetween(input.lat, input.lon, s.lat, s.lon);
  return domaine.stations
    .map((id) => stationById(id))
    .filter((s): s is Station => s != null && s.id !== input.stationId)
    .sort((a, b) => loin(a) - loin(b))
    .map((s) => ({ ...input, stationId: s.id, stationName: s.name, lat: s.lat, lon: s.lon }));
}

/** La station de la recherche, puis ses stations reliées. */
export function stationsDuReleve(input: LiveSearchInput): LiveSearchInput[] {
  return [input, ...stationsReliees(input)];
}

/**
 * Les agences à interroger, et pour chacune les stations où elle a des lieux.
 * Une agence qui donne les mêmes lieux à deux stations (Alpissime : un seul
 * lieu pour La Plagne, Montchavin et Champagny) n'est appelée qu'une fois.
 */
export function agencesDuReleve(input: LiveSearchInput): Map<SourceAgence, LiveSearchInput[]> {
  const out = new Map<SourceAgence, LiveSearchInput[]>();
  const vus = new Map<SourceAgence, Set<string>>();
  for (const st of stationsDuReleve(input)) {
    for (const source of agencesDe(st.stationId)) {
      const cle = lieuxDe(source, st.stationId).join("+");
      const deja = vus.get(source) ?? new Set<string>();
      if (deja.has(cle)) continue;
      deja.add(cle);
      vus.set(source, deja);
      out.set(source, [...(out.get(source) ?? []), st]);
    }
  }
  return out;
}

/** Une annonce par identifiant : la première lue garde sa place. */
export function sansDoublons<T extends { id: string }>(rows: readonly T[]): T[] {
  const vus = new Set<string>();
  return rows.filter((l) => (vus.has(l.id) ? false : (vus.add(l.id), true)));
}

/**
 * `fn` sur chaque élément, `n` à la fois au plus, dans l'ordre : la station
 * cherchée part la première. Les résultats gardent l'ordre des éléments.
 */
export async function parPaquets<T, R>(
  items: readonly T[],
  n: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let suivant = 0;
  const filiere = async () => {
    while (suivant < items.length) {
      const i = suivant++;
      try {
        out[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        out[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, filiere));
  return out;
}
