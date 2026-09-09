import type { Listing } from "./listings";
import {
  displayLocality,
  isCabinLift,
  liftKindPhrase,
  metresBetween,
  nearestLift,
  nearestPlace,
} from "./osmAccess";
import type { Station } from "./stations";
import { withinLiftM as withinM } from "./skiAccess";

export { metresBetween };
export { LIFT_FOOT_M, LIFT_NEAR_M, LIFT_KM_M, skiAccessLabel } from "./skiAccess";
export { isCabinLift };
export { formatLiftSpan } from "./liftSpan";

export function attachAccess(listing: Listing, station: Station): Listing {
  if (listing.lat == null || listing.lon == null) {
    return {
      ...listing,
      distToSlopesM: null,
      distToLiftM: null,
      liftName: null,
      liftKind: null,
      liftLat: null,
      liftLon: null,
      liftOtherLat: null,
      liftOtherLon: null,
      placeName: null,
      distToPlaceM: null,
    };
  }
  const lift = nearestLift(station.id, listing.lat, listing.lon);
  const place = nearestPlace(station.id, listing.lat, listing.lon);
  return {
    ...listing,
    distToSlopesM: Math.round(metresBetween(listing.lat, listing.lon, station.lat, station.lon)),
    distToLiftM: lift?.m ?? null,
    liftName: lift?.name ?? null,
    liftKind: lift?.kind ?? null,
    liftLat: lift?.lat ?? null,
    liftLon: lift?.lon ?? null,
    liftOtherLat: lift?.otherLat ?? null,
    liftOtherLon: lift?.otherLon ?? null,
    placeName: place?.name ?? null,
    distToPlaceM: place?.m ?? null,
  };
}

export function formatDistFrom(m: number | null | undefined, place: string): string {
  if (m == null) return `Distance ${place} non mesurée`;
  if (m < 1000) return `${m} m ${place}`;
  return `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km ${place}`;
}

export function formatDist(m: number | null | undefined): string {
  if (m == null) return "Distance aux remontées mécaniques non mesurée";
  return formatDistFrom(m, "des remontées mécaniques");
}

export function sectorOf(listing: Listing): string | null {
  return displayLocality(listing.locality) ?? listing.placeName ?? null;
}

export function formatLift(listing: Listing): string {
  if (listing.distToLiftM == null) return "Remontée non mesurée";
  return formatDistFrom(listing.distToLiftM, liftKindPhrase(listing.liftKind, listing.liftName));
}

export function withinLiftM(listing: Listing, maxM: number): boolean {
  return withinM(listing.distToLiftM, maxM);
}

