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
import { nearestStationLift } from "./remontees.ts";
import { stationById, type Station } from "./stations.ts";
import { withinLiftM as withinM } from "./skiAccess.ts";
import { convertir, dansLeSysteme, mesure, type Systeme } from "./unites.ts";

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
  // Dans le domaine cherché, la remontée du logement est la plus proche de
  // toutes : la liste de la station en oublie (27 m de la gare « Village » au
  // repère de Saint-Martin-de-Belleville, 2 839 m selon sa liste). Hors du
  // domaine, rien n'est gardé, et la remontée « cherchée » reste celle de la
  // station : la fiche dit à quelle distance sont ses remontées à elle.
  let near = keepLift ? lift : null;
  const proche = fit.nearestStationId ? stationById(fit.nearestStationId) : undefined;
  const world = keepLift ? nearestStationLift(listing.lat, listing.lon, [station, proche]) : null;
  if (world && (!near || world.m < near.m)) near = world;
  return {
    ...listing,
    distToSlopesM: fit.distToSearchedPinM,
    distToLiftM: near?.m ?? null,
    liftName: near?.name ?? null,
    liftKind: near?.kind ?? null,
    liftLat: near?.lat ?? null,
    liftLon: near?.lon ?? null,
    liftOtherLat: near?.otherLat ?? null,
    liftOtherLon: near?.otherLon ?? null,
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

/**
 * Une distance à quelque chose : mètres en deçà du kilomètre, kilomètres
 * au-delà. Le seuil est de lisibilité, pas d'unité — « 1 240 m des remontées »
 * se lit moins bien que « 1,2 km ».
 */
export function formatDistFrom(
  m: number | null | undefined,
  place: string,
  systeme: Systeme = "metrique",
): string {
  if (m == null) return `Distance ${place} non mesurée`;
  // Sous le kilomètre on reste dans la petite unité du système — le mètre ou
  // le pied —, au-delà on passe à la grande. Le seuil est de lisibilité :
  // « 1 240 m des remontées » se lit moins bien que « 1,2 km ».
  const petite = { valeur: m, unite: "m" } as const;
  if (m < 1000) {
    const proche = systeme === "imperial" ? convertir(petite, "ft")! : petite;
    return `${mesure(proche)} ${place}`;
  }
  return `${mesure(dansLeSysteme({ valeur: m / 1000, unite: "km" }, systeme))} ${place}`;
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