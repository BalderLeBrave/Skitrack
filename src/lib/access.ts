import type { Listing } from "./listings.ts";
import {
  displayLocality,
  isCabinLift,
  liftKindPhrase,
  metresBetween,
  nearestLift,
  nearestPlace,
} from "./osmAccess.ts";
import { domainFit, inSearchedDomain, otherDomainMessage } from "./domainFit.ts";
import type { Station } from "./stations.ts";
import { withinLiftM as withinM } from "./skiAccess.ts";

export { metresBetween };
export { LIFT_FOOT_M, LIFT_NEAR_M, LIFT_KM_M, skiAccessLabel } from "./skiAccess.ts";
export { isCabinLift };
export { formatLiftSpan, liftArrivalM } from "./liftSpan.ts";
export { otherDomainMessage, inSearchedDomain };

export function attachAccess(listing: Listing, station: Station): Listing {
  const fit = domainFit(listing, station);
  const keepLift = inSearchedDomain(fit);
  if (listing.lat == null || listing.lon == null) {
    return {
      ...listing,
      distToSlopesM: fit.distToSearchedPinM,
      distToLiftM: null,
      liftName: null,
      liftKind: null,
      liftLat: null,
      liftLon: null,
      liftOtherLat: null,
      liftOtherLon: null,
      placeName: listing.placeName ?? null,
      distToPlaceM: null,
      domainFit: fit.verdict,
      nearestDomainId: fit.nearestStationId,
      nearestDomainName: fit.nearestStationName,
      distToNearestDomainM: fit.distToNearestPinM,
      winterBarrier: fit.winterBarrier,
      searchedLiftM: null,
      searchedLiftName: null,
    };
  }
  const lift = nearestLift(station.id, listing.lat, listing.lon);
  const place = nearestPlace(station.id, listing.lat, listing.lon);
  return {
    ...listing,
    distToSlopesM: fit.distToSearchedPinM,
    distToLiftM: keepLift ? (lift?.m ?? null) : null,
    liftName: keepLift ? (lift?.name ?? null) : null,
    liftKind: keepLift ? (lift?.kind ?? null) : null,
    liftLat: keepLift ? (lift?.lat ?? null) : null,
    liftLon: keepLift ? (lift?.lon ?? null) : null,
    liftOtherLat: keepLift ? (lift?.otherLat ?? null) : null,
    liftOtherLon: keepLift ? (lift?.otherLon ?? null) : null,
    placeName: place?.name ?? listing.placeName ?? null,
    distToPlaceM: place?.m ?? null,
    domainFit: fit.verdict,
    nearestDomainId: fit.nearestStationId,
    nearestDomainName: fit.nearestStationName,
    distToNearestDomainM: fit.distToNearestPinM,
    winterBarrier: fit.winterBarrier,
    searchedLiftM: lift?.m ?? null,
    searchedLiftName: lift?.name ?? null,
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