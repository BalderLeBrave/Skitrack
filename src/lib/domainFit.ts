/**
 * Un logement n’appartient à un domaine que s’il y est vraiment, pas s’il est
 * « à 5 km à vol d’oiseau ».
 *
 * Le logement est d'abord rattaché à sa station (`rattachement.ts` : localité
 * publiée, puis coordonnées, puis texte). Le verdict compare ensuite cette
 * station à celle qu'on cherche : la même (`in`), une station du même grand
 * domaine relié (`linked`, `grandsDomaines.ts`), une autre (`other`), ou aucune
 * (`unknown`, logement non rattaché). Ni un forfait commercial ni un libellé de
 * domaine OpenStreetMap ne relient deux stations : seule la table le fait,
 * comme pour les voisines de `domaineStations.ts`.
 */

import type { Listing } from "./listings.ts";
import { metresBetween } from "./remontees.ts";
import { grandDomaineDe } from "./grandsDomaines.ts";
import {
  rattacher,
  repereLePlusProche,
  stationIdFromText,
  stationsReliees,
  type IndicesLieu,
  type MotifNonRattache,
  type ViaRattachement,
} from "./rattachement.ts";
import { stationById, type Station } from "./stations.ts";
import { aStation } from "./v7.ts";
import { langue } from "./i18n/langue.ts";
import { tr } from "./i18n/tr.ts";

export { stationIdFromText };

export type GeoHint = IndicesLieu;

export type DomainVerdict = "in" | "linked" | "other" | "unknown";

export type DomainFit = {
  searchedId: string;
  /** La station du logement (`rattachement.ts`), pas forcément la plus proche
   *  à vol d'oiseau : la localité publiée passe avant. */
  nearestStationId: string | null;
  nearestStationName: string | null;
  /** Le village de la table qui a rattaché le logement, s'il y en a un. */
  villageId: string | null;
  via: ViaRattachement | null;
  /** Pourquoi le logement n'est rattaché à rien (verdict `unknown`). */
  motif: MotifNonRattache | null;
  distToSearchedPinM: number | null;
  distToNearestPinM: number | null;
  verdict: DomainVerdict;
  winterBarrier: string | null;
};

/** Cols fermés l’hiver : proches à vol d’oiseau, pas le même domaine skiable. */
const WINTER_BARRIERS: { a: string; b: string; col: string }[] = [
  { a: "val-disere", b: "bonneval-sur-arc", col: "col de l’Iseran" },
  { a: "val-disere", b: "bessans", col: "col de l’Iseran" },
  { a: "val-disere", b: "val-cenis", col: "col de l’Iseran" },
  { a: "tignes", b: "bonneval-sur-arc", col: "col de l’Iseran" },
  { a: "tignes", b: "bessans", col: "col de l’Iseran" },
  { a: "tignes", b: "val-cenis", col: "col de l’Iseran" },
];

function barrierBetween(a: string, b: string): string | null {
  if (a === b) return null;
  for (const row of WINTER_BARRIERS) {
    if ((row.a === a && row.b === b) || (row.a === b && row.b === a)) return row.col;
  }
  return null;
}

/** La station et celles de son grand domaine relié (`grandsDomaines.ts`). */
export function linkedSkiStations(stationId: string): Set<string> {
  return new Set([stationId, ...(grandDomaineDe(stationId)?.stations ?? [])]);
}

export function winterBarrier(a: string, b: string): string | null {
  return barrierBetween(a, b);
}

/** Le repère de station le plus proche, un village valant sa station. */
export function nearestStationPin(lat: number, lon: number): { station: Station; m: number } {
  const r = repereLePlusProche(lat, lon);
  return { station: stationById(r.stationId)!, m: r.m };
}

export function domainFit(listing: GeoHint, searched: Station): DomainFit {
  const pinM =
    listing.lat != null && listing.lon != null
      ? Math.round(metresBetween(listing.lat, listing.lon, searched.lat, searched.lon))
      : null;
  const r = rattacher(listing);
  const nearest = r.stationId ? stationById(r.stationId) : undefined;
  if (!nearest) {
    return {
      searchedId: searched.id,
      nearestStationId: null,
      nearestStationName: null,
      villageId: null,
      via: null,
      motif: r.motif ?? "sans-lieu",
      distToSearchedPinM: pinM,
      distToNearestPinM: r.distanceM,
      verdict: "unknown",
      winterBarrier: null,
    };
  }
  const col = barrierBetween(searched.id, nearest.id);
  let verdict: DomainVerdict;
  if (nearest.id === searched.id) verdict = "in";
  else if (!col && stationsReliees(searched.id, nearest.id)) verdict = "linked";
  else verdict = "other";
  return {
    searchedId: searched.id,
    nearestStationId: nearest.id,
    nearestStationName: nearest.name,
    villageId: r.villageId,
    via: r.via,
    motif: null,
    distToSearchedPinM: pinM,
    distToNearestPinM: r.distanceM,
    verdict,
    winterBarrier: col,
  };
}

/** Ce que l'annonce garde du verdict : la station, la preuve, le motif. */
export function champsDuVerdict(fit: DomainFit): Pick<
  Listing,
  | "domainFit"
  | "nearestDomainId"
  | "nearestDomainName"
  | "distToNearestDomainM"
  | "winterBarrier"
  | "villageId"
  | "rattachementVia"
  | "nonRattache"
> {
  return {
    domainFit: fit.verdict,
    nearestDomainId: fit.nearestStationId,
    nearestDomainName: fit.nearestStationName,
    distToNearestDomainM: fit.distToNearestPinM,
    winterBarrier: fit.winterBarrier,
    villageId: fit.villageId,
    rattachementVia: fit.via,
    nonRattache: fit.motif,
  };
}

export function inSearchedDomain(fit: DomainFit): boolean {
  return fit.verdict === "in" || fit.verdict === "linked";
}

/**
 * Le verdict de domaine d'une annonce déjà relevée, rejugé sur le référentiel
 * d'aujourd'hui.
 *
 * `attachAccess` tranche au relevé, et l'annonce enregistrée garde ce verdict :
 * une correction de rattachement (La Bourboule détachée de Super Besse,
 * Lispach rendue à son domaine, Abondance séparée de Morzine) ne changeait
 * donc rien aux relevés déjà faits avant qu'on relève à nouveau la station.
 * Au 26 septembre 2026, les 37 annonces du Mont-Dore restaient « à La
 * Bourboule ». Rejugée à la relecture, avec la même fonction et la station du
 * relevé, l'annonce suit le référentiel.
 *
 * Comme `attachAccess`, une annonce sortie du domaine perd sa remontée : elle
 * n'est pas la sienne, et la distance se rabat sur le repère de la station
 * cherchée. Une annonce qui y entre la retrouve à la remesure
 * (`remesurerRemontee`), qui doit donc passer après.
 *
 * Depuis le 5 octobre 2026, le rattachement lui-même se recalcule ici, à
 * chaque relecture et sans migration : une annonce sans position est rejugée
 * aussi, par sa localité et son texte (`rattachement.ts`). Un relevé fait
 * avant la table des villages suit donc la table du jour.
 */
export function rejugerDomaine<L extends Listing>(l: L, searched: Station | undefined): L {
  if (!searched) return l;
  const fit = domainFit(l, searched);
  const juge: L = { ...l, ...champsDuVerdict(fit) };
  if (inSearchedDomain(fit)) return juge;
  return {
    ...juge,
    distToLiftM: null,
    liftName: null,
    liftKind: null,
    liftLat: null,
    liftLon: null,
    liftOtherLat: null,
    liftOtherLon: null,
  };
}

export function otherDomainMessage(fit: DomainFit, searchedName: string): string | null {
  if (fit.verdict !== "other" || !fit.nearestStationName) return null;
  // « à Tignes », « aux Arcs » en français ; l'anglais écrit « in » devant le nom.
  const lieu = langue() === "en" ? searchedName : aStation(searchedName);
  if (fit.winterBarrier) {
    return tr(
      "Autre domaine : {domaine}. Ce logement n’est pas {lieu} : le {col} est fermé l’hiver, et il n’y a ni liaison à ski ni route directe.",
      { domaine: fit.nearestStationName, lieu, col: fit.winterBarrier },
    );
  }
  return tr("Autre domaine : {domaine}. Ce logement n’est ni {lieu} ni sur un domaine relié en saison.", {
    domaine: fit.nearestStationName,
    lieu,
  });
}
