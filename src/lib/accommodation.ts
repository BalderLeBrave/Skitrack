import { metresBetween } from "./access";
import { listingById, type Listing } from "./listings";
import { annonceEnMemoire } from "./prix/annonces";
import { useStay } from "./stay";
import { useTrack } from "./track";
import { montant } from "./devises.ts";

/** Prix par personne pour le séjour (total / voyageurs de la recherche). */
export function pricePerPerson(total: number, guests: number): number | null {
  if (!(guests > 0) || !(total > 0)) return null;
  return total / guests;
}

/** Les annonces en direct, le relevé figé, puis celles que les relevés de
 *  l'écran « Prix » ont retenues : un logement choisi dans l'onglet budget
 *  n'est que là, et Réservation doit le retrouver.
 *
 *  La copie tarifée pour les dates du séjour passe devant toutes les autres.
 *  Retenir dans Prix change les dates du séjour sans toucher aux annonces en
 *  direct de Logements, et un gîte du relevé figé porte le même code que son
 *  relevé en direct : lus d'abord, ils rendaient le prix et le lien d'autres
 *  dates. */
export function resolveListing(id: string): Listing | undefined {
  const { liveListings, checkIn, checkOut } = useStay.getState();
  const direct = liveListings?.find((l) => l.id === id);
  const prix = annonceEnMemoire(id, { checkIn, checkOut });
  const pourCeSejour = (l: Listing | undefined) =>
    l && l.pricedCheckIn === checkIn && l.pricedCheckOut === checkOut ? l : undefined;
  return pourCeSejour(direct) ?? pourCeSejour(prix) ?? direct ?? listingById(id) ?? prix;
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
