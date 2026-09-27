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
import {
  remonteeInconnue,
  type AvecCompletude,
  type NearestLift,
  type PositionSource,
} from "./stay/statut.ts";
import { convertir, dansLeSysteme, mesure, type Systeme } from "./unites.ts";

export { metresBetween };
export { LIFT_FOOT_M, LIFT_NEAR_M, LIFT_KM_M, skiAccessLabel } from "./skiAccess.ts";
export { isCabinLift };
export { formatLiftSpan, liftArrivalM } from "./liftSpan.ts";
export { otherDomainMessage, inSearchedDomain };

/**
 * La remontée la plus proche, avec son statut (`stay/statut.ts`).
 *
 * C'est celle de la station cherchée, quel que soit le verdict de domaine :
 * `distToLiftM` s'efface hors du domaine, la fiche structurée dit quand même
 * à quelle distance sont les remontées de la station. Le jeu embarqué n'a ni
 * identifiant OSM ni version avant la phase 3 : `liftId` et
 * `liftsDatasetVersion` restent nuls.
 */
export function nearestLiftDe(listing: Listing, station: Station): NearestLift {
  const { lat, lon } = listing;
  // Un (0, 0) est un trou, pas un point dans le golfe de Guinée.
  if (lat == null || lon == null || (lat === 0 && lon === 0)) {
    return remonteeInconnue("position inconnue");
  }
  const lift = nearestLift(station.id, lat, lon);
  if (!lift) return remonteeInconnue("aucune remontée connue pour cette station");
  // La marque « · adresse » est posée par le géocodage d'adresse
  // (`stay/completerFiche.server.ts`) : la position n'est pas celle de
  // l'annonce, et la distance en hérite.
  const positionSource: PositionSource = /·\s*adresse/.test(listing.proven ?? "")
    ? "geocoded_address"
    : "listing";
  return {
    distanceM: Math.round(lift.m / 10) * 10,
    liftId: null,
    liftName: lift.name,
    liftType: lift.kind,
    status: positionSource === "listing" ? "extracted" : "derived",
    positionSource,
    liftsDatasetVersion: null,
    computedAt: new Date().toISOString(),
  };
}

export function attachAccess(
  listing: Listing & AvecCompletude,
  station: Station,
): Listing & AvecCompletude {
  const fit = domainFit(listing, station);
  const keepLift = inSearchedDomain(fit);
  // La remontée structurée se pose dans les deux branches : sans position,
  // elle dit pourquoi elle manque, et le reste de la completude est gardé.
  const completude = { ...listing.completude, nearestLift: nearestLiftDe(listing, station) };
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
      completude,
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
    completude,
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