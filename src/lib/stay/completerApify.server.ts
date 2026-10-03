/**
 * Les annonces Airbnb que nos lectures laissent incomplètes, complétées par
 * Apify (`scrape/apify/airbnbApify.server.ts`) : ce qu'il a déjà rendu se
 * pose ici, sans réseau ; le reste part chez lui en tâche de fond, et la
 * relecture suivante de l'écran le pose.
 *
 * Incomplète : capacité, chambres, prix, photo ou point manquant. Seulement
 * après notre propre lecture de sa page (`pdpLue`), ou quand Airbnb refuse
 * nos lectures : Apify ne remplace pas la lecture gratuite, il la complète.
 */

import type { Listing } from "../listings.ts";
import { airbnbIdOf } from "./airbnbId.ts";
import { poserValeur, qualifierLogement } from "./logement.ts";
import { airbnbComplet } from "./priseFiche.ts";
import type { FicheApify } from "../scrape/apify/airbnbApify.ts";

/** La trace dans `proven` d'une valeur venue d'Apify. */
export const MARQUE_APIFY = "Apify";

function plausible(lat: number | null | undefined, lon: number | null | undefined): boolean {
  return lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
}

/** Ce qu'il manque encore à une annonce Airbnb, parmi les cinq champs. */
export function manquesAirbnb(l: Listing): string[] {
  const m: string[] = [];
  if (!airbnbComplet(l)) {
    if (l.capacity == null || !(l.capacity > 0)) m.push("capacité");
    if (l.bedrooms == null) m.push("chambres");
    if (!plausible(l.lat, l.lon)) m.push("GPS");
  }
  if (!(l.total > 0)) m.push("prix");
  if (!l.photo && !(l.photos?.length ?? 0)) m.push("photo");
  return m;
}

/**
 * Pose sur l'annonce ce qu'Apify a rendu et qu'elle tait : jamais une valeur
 * déjà là (`poserValeur` garde la meilleure source), jamais un prix ou une
 * photo qui existe. Rend `true` si quelque chose a été posé.
 */
export function poserApify(row: Listing, f: FicheApify): boolean {
  const poses: string[] = [];
  let logement = false;
  if (poserValeur(row, "capacity", f.capacity, "structured")) {
    logement = true;
    poses.push("capacité");
  }
  if (poserValeur(row, "bedrooms", f.bedrooms, "structured")) {
    logement = true;
    poses.push("chambres");
  }
  if (logement) Object.assign(row, qualifierLogement(row));
  if (row.beds == null && f.beds != null) row.beds = f.beds;
  if (!plausible(row.lat, row.lon) && plausible(f.lat, f.lon)) {
    row.lat = f.lat;
    row.lon = f.lon;
    row.gpsSource = "apify";
    poses.push("GPS");
  }
  if (!row.photo && !(row.photos?.length ?? 0) && f.photo) {
    row.photo = f.photo;
    row.photos = f.photos.length > 0 ? f.photos : [f.photo];
    poses.push("photo");
  }
  if (!(row.total > 0) && f.total != null && f.total > 0) {
    row.total = Math.round(f.total * 100) / 100;
    row.currency = "EUR";
    row.priceLabel = f.priceLabel;
    poses.push("prix");
  }
  if (poses.length === 0) return false;
  const note = `${MARQUE_APIFY} (${poses.join(", ")})`;
  if (!row.proven.includes(note)) row.proven = `${row.proven} · ${note}`;
  return true;
}

export type PorteApify = {
  /** Le séjour que l'écran cherche pour la station, ou `null`. */
  sejour: (stationId: string) => { checkIn: string; checkOut: string; guests: number } | null;
  fiche: (id: string, sejour: { checkIn: string; checkOut: string; guests: number }) => FicheApify | null | undefined;
  demander: (stationId: string, sejour: { checkIn: string; checkOut: string; guests: number }, ids: readonly string[]) => number;
};

/**
 * Pose ce qu'Apify sait déjà, puis demande le reste. `refusAirbnb` : Airbnb
 * refuse nos lectures en ce moment, les pages non lues partent aussi.
 * Rend le nombre d'annonces complétées et de nouvelles demandes.
 */
export function completerParApify(
  listings: Listing[],
  porte: PorteApify,
  refusAirbnb = false,
): { posees: number; demandees: number } {
  let posees = 0;
  const parStation = new Map<string, string[]>();
  for (const row of listings) {
    if (row.source !== "Airbnb") continue;
    if (manquesAirbnb(row).length === 0) continue;
    const id = airbnbIdOf(row);
    const sejour = porte.sejour(row.stationId);
    if (!id || !sejour) continue;
    const f = porte.fiche(id, sejour);
    if (f && poserApify(row, f)) posees += 1;
    if (f !== undefined || manquesAirbnb(row).length === 0) continue;
    if (row.pdpLue !== true && !refusAirbnb) continue;
    parStation.set(row.stationId, [...(parStation.get(row.stationId) ?? []), id]);
  }
  let demandees = 0;
  for (const [stationId, ids] of parStation) {
    const sejour = porte.sejour(stationId);
    if (sejour) demandees += porte.demander(stationId, sejour, ids);
  }
  return { posees, demandees };
}
