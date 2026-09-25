import { metresBetween } from "./access";
import { listingById, type Listing } from "./listings";
import { useStay } from "./stay";
import { useTrack } from "./track";
import { montant } from "./devises.ts";

/** Prix par personne pour le séjour (total / voyageurs de la recherche). */
export function pricePerPerson(total: number, guests: number): number | null {
  if (!(guests > 0) || !(total > 0)) return null;
  return total / guests;
}

export function resolveListing(id: string): Listing | undefined {
  const live = useStay.getState().liveListings;
  return live?.find((l) => l.id === id) ?? listingById(id);
}

export function distToGpxStartM(listing: Listing): number | null {
  if (listing.lat == null || listing.lon == null) return null;
  const start = useTrack.getState().stats?.start;
  if (!start) return null;
  return Math.round(metresBetween(listing.lat, listing.lon, start.lat, start.lon));
}

/** Distance au point GPX le plus proche — pas seulement le départ. */
export function distToTrackM(
  lat: number,
  lon: number,
  points: readonly { lat: number; lon: number }[],
): number | null {
  if (points.length === 0) return null;
  let best = Number.POSITIVE_INFINITY;
  for (const p of points) {
    const m = metresBetween(lat, lon, p.lat, p.lon);
    if (m < best) best = m;
  }
  return Number.isFinite(best) ? Math.round(best) : null;
}

export function distToGpxM(
  listing: Listing,
  points: readonly { lat: number; lon: number }[] = useTrack.getState().points,
): number | null {
  if (listing.lat == null || listing.lon == null) return null;
  return distToTrackM(listing.lat, listing.lon, points);
}

export function formatPerPerson(total: number, guests: number, devise = "EUR"): string {
  const n = pricePerPerson(total, guests);
  if (n == null) return "–";
  return montant(n, devise);
}
