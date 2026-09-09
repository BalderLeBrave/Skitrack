import type { Listing } from "./listings";
import type { Station } from "./stations";

/** Haversine en mètres. */
export function metresBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat);
  const dLon = toR(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function attachAccess(listing: Listing, station: Station): Listing {
  if (listing.lat == null || listing.lon == null) {
    return { ...listing, distToSlopesM: null };
  }
  const m = Math.round(metresBetween(listing.lat, listing.lon, station.lat, station.lon));
  return { ...listing, distToSlopesM: m };
}

export function formatDist(m: number | null | undefined): string {
  if (m == null) return "Distance aux pistes non mesurée";
  if (m < 1000) return `${m} m du front de neige`;
  return `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km du front de neige`;
}
