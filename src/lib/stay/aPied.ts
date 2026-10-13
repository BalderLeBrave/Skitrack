/**
 * La distance d'un logement à sa remontée, **à pied**, posée sur l'annonce.
 *
 * `attachAccess` mesure à vol d'oiseau. Quand le réseau piéton de la station
 * est chargé (`geo/reseauPieton.ts`), `appliquerAPied` remplace la distance
 * et la remontée par celles du chemin : la gare atteinte à pied n'est pas
 * toujours la plus proche à vol d'oiseau (une passerelle, un torrent). Tout ce
 * qui lit `distToLiftM` et `liftName` (carte, fiche, catégories, filtre,
 * tri, épingles, comparaison des favoris) lit alors la marche.
 *
 * La marque `aPied` dit que la valeur est une marche, et depuis quel point.
 * Elle ne vaut que tant qu'elle concorde avec l'annonce (`estAPied`) : une
 * remesure à vol d'oiseau faite ensuite (`attachAccess`, `remesurerRemontee`,
 * une copie de favori rafraîchie) change la distance ou le point, et la
 * marque cesse d'être crue sans qu'il faille l'effacer partout.
 *
 * Sans réseau pour la station, ou pour un logement hors du réseau (à plus de
 * 200 m de toute voie), la distance reste celle à vol d'oiseau, et l'écran le
 * dit (`viaDistance`). Un chiffre à vol d'oiseau ne se présente jamais comme
 * une marche.
 *
 * **En voiture.** Quand la marche est plus longue que la route : au-delà
 * de `SEUIL_VOITURE_M` de marche (ou de ligne droite, faute de réseau
 * piéton : la marche est alors plus longue encore), et si la voiture y
 * arrive plus vite (`voitureRetenue`), `appliquerVoiture` pose `enVoiture`,
 * mesuré sur le réseau routier de la station (routes ouvertes l'hiver, sens
 * uniques compris), avec sa remontée, qui n'est pas toujours celle qu'on
 * atteint à pied. `distToLiftM` reste la marche : le tri, le filtre et les
 * catégories (« pied des pistes ») parlent de proximité, pas de trajet.
 */

import type { Listing } from "../listings.ts";
import { marcheVersGare, type Champ, type Reseau } from "../geo/reseauPieton.ts";
import { MARCHE_KMH } from "./accesPistes.ts";

/** Ce que la marche a remplacé, et depuis où elle a été mesurée. */
export type AccesAPied = {
  /** Mètres à pied, la valeur posée dans `distToLiftM`. */
  m: number;
  /** La distance à vol d'oiseau qu'elle remplace (`attachAccess`), ou `null`. */
  volM: number | null;
  /** Le point mesuré : la marque ne vaut que pour lui. */
  lat: number;
  lon: number;
  /** Le bout fait hors des voies, en mètres. */
  horsVoieM: number;
};

/** Au-delà de cette marche, le trajet se fait en voiture : un quart d'heure
 *  à pied (`MARCHE_KMH`), chaussures de ski ou skis sur l'épaule. */
export const SEUIL_VOITURE_M = 1000;
/** Vitesse moyenne en station : rues, lacets, neige. */
export const VOITURE_KMH = 30;

/** Le trajet en voiture, et depuis où il a été mesuré. */
export type AccesEnVoiture = {
  /** Mètres par la route, du logement à la remontée. */
  m: number;
  /** Minutes de trajet : la route à `VOITURE_KMH`, le bout jusqu'à la route
   *  à pied (`minutesEnVoiture`). */
  minutes: number;
  /** La distance (`distToLiftM`) qui a fait prendre la voiture. */
  marcheM: number;
  /** Le point mesuré : le trajet ne vaut que pour lui. */
  lat: number;
  lon: number;
  /** La remontée atteinte en voiture. */
  liftName: string | null;
  liftKind: string;
  liftLat: number;
  liftLon: number;
  liftOtherLat: number | null;
  liftOtherLon: number | null;
};

/** Un réseau prêt : le graphe et son champ de distances. */
export type ReseauCalcule = { reseau: Reseau; champ: Champ };

export type ViaDistance = "pieton" | "vol";

/** Ce que lit la marque : la distance, la marque et le point. */
export type AvecMarche = Pick<Listing, "distToLiftM" | "aPied" | "enVoiture"> & {
  lat?: number | null;
  lon?: number | null;
};

/** La distance de l'annonce est-elle une marche ? */
export function estAPied(l: AvecMarche): boolean {
  const a = l.aPied;
  return a != null && a.m === l.distToLiftM && a.lat === l.lat && a.lon === l.lon;
}

/** Le trajet de l'annonce se fait-il en voiture ? Seulement tant que la
 *  marche et le point sont ceux qui l'ont fait prendre. */
export function estEnVoiture(l: AvecMarche): boolean {
  const v = l.enVoiture;
  return v != null && v.marcheM === l.distToLiftM && v.lat === l.lat && v.lon === l.lon;
}

/** Le trajet en voiture de l'annonce, ou `null`. */
export function trajetVoiture(l: AvecMarche): AccesEnVoiture | null {
  return estEnVoiture(l) ? (l.enVoiture ?? null) : null;
}

/** Minutes de trajet pour `m` mètres dont `horsRouteM` à pied jusqu'à la
 *  route, sans arrondi. */
function dureeVoiture(m: number, horsRouteM: number): number {
  const aPied = Math.min(horsRouteM, m);
  return aPied / ((MARCHE_KMH * 1000) / 60) + (m - aPied) / ((VOITURE_KMH * 1000) / 60);
}

/** Minutes de trajet pour `m` mètres dont `horsRouteM` à pied jusqu'à la
 *  route, une au moins. */
export function minutesEnVoiture(m: number, horsRouteM = 0): number {
  return Math.max(1, Math.round(dureeVoiture(m, horsRouteM)));
}

/** Ce que coûte la voiture en plus du trajet : se garer, rejoindre la
 *  remontée. Compté pour choisir, pas dans les minutes affichées. */
export const STATIONNEMENT_MIN = 5;

/**
 * La voiture l'emporte-t-elle sur la marche ? Trois conditions :
 * - la marche dépasse `SEUIL_VOITURE_M` ;
 * - la route aussi : à moins, on y va à pied par la même route ;
 * - la voiture arrive plus vite, le bout jusqu'à la route fait à pied et le
 *   stationnement compté (`STATIONNEMENT_MIN`). Un détour de 10 km pour
 *   éviter 1,7 km de marche ne se prend pas.
 */
export function voitureRetenue(marcheM: number, routeM: number, horsRouteM: number): boolean {
  if (marcheM <= SEUIL_VOITURE_M || routeM <= SEUIL_VOITURE_M) return false;
  return dureeVoiture(routeM, horsRouteM) + STATIONNEMENT_MIN < marcheM / ((MARCHE_KMH * 1000) / 60);
}

/** « pieton » ou « vol » : ce que mesure `distToLiftM`. */
export function viaDistance(l: AvecMarche): ViaDistance {
  return estAPied(l) ? "pieton" : "vol";
}

/**
 * La distance à vol d'oiseau de l'annonce, même quand la marche l'a
 * remplacée : la règle « dans la station » des relevés (`dansLaStation`,
 * 2 km d'une remontée) est une règle d'appartenance, tranchée à vol d'oiseau
 * au relevé ; elle ne change pas parce qu'un réseau s'est chargé.
 */
export function distVolOiseauM(l: AvecMarche): number | null {
  return estAPied(l) ? (l.aPied?.volM ?? null) : (l.distToLiftM ?? null);
}

/**
 * L'annonce avec sa distance à pied, quand elle se mesure. Ressort inchangée :
 * - sans point, ou avec un point triangulé (ce n'est pas la porte : rien ne
 *   s'y mesure, `mesuresPubliees`) ;
 * - hors du domaine cherché (`attachAccess` a effacé la remontée) ;
 * - hors du réseau : vol d'oiseau, dit comme tel.
 */
export function appliquerAPied<T extends Listing>(l: T, calc: ReseauCalcule | null | undefined): T {
  if (!calc) return l;
  if (l.lat == null || l.lon == null || (l.lat === 0 && l.lon === 0)) return l;
  if (l.gpsSource === "triangule") return l;
  if (l.domainFit !== "in" && l.domainFit !== "linked") return l;
  if (estAPied(l)) return l;
  const m = marcheVersGare(calc.reseau, calc.champ, l.lat, l.lon);
  if (!m) return l;
  const g = calc.reseau.gares[m.gare];
  return {
    ...l,
    distToLiftM: m.m,
    liftName: g.n,
    liftKind: g.k,
    liftLat: g.lat,
    liftLon: g.lon,
    liftOtherLat: g.olat,
    liftOtherLon: g.olon,
    aPied: { m: m.m, volM: l.distToLiftM ?? null, lat: l.lat, lon: l.lon, horsVoieM: Math.round(m.horsVoieM) },
  };
}

/**
 * L'annonce avec son trajet en voiture, quand la voiture l'emporte sur la
 * marche (`voitureRetenue`) et que le réseau routier de sa station la mène à
 * une remontée. À appliquer après `appliquerAPied` : c'est la marche qui
 * décide. Ressort inchangée dans les mêmes cas que `appliquerAPied`, quand la
 * marche est courte, quand la voiture ne fait pas gagner de temps, ou
 * qu'aucune route ne mène du logement à une remontée.
 */
export function appliquerVoiture<T extends Listing>(l: T, calc: ReseauCalcule | null | undefined): T {
  if (!calc) return l;
  if (l.lat == null || l.lon == null || (l.lat === 0 && l.lon === 0)) return l;
  if (l.gpsSource === "triangule") return l;
  if (l.domainFit !== "in" && l.domainFit !== "linked") return l;
  if (l.distToLiftM == null || l.distToLiftM <= SEUIL_VOITURE_M) return l;
  if (estEnVoiture(l)) return l;
  const m = marcheVersGare(calc.reseau, calc.champ, l.lat, l.lon);
  if (!m || !voitureRetenue(l.distToLiftM, m.m, m.horsVoieM)) return l;
  const g = calc.reseau.gares[m.gare];
  return {
    ...l,
    enVoiture: {
      m: m.m,
      minutes: minutesEnVoiture(m.m, m.horsVoieM),
      marcheM: l.distToLiftM,
      lat: l.lat,
      lon: l.lon,
      liftName: g.n,
      liftKind: g.k,
      liftLat: g.lat,
      liftLon: g.lon,
      liftOtherLat: g.olat,
      liftOtherLon: g.olon,
    },
  };
}

/**
 * Toute une liste, chaque annonce avec les réseaux de sa station
 * (`stationId`) : la marche, puis la voiture quand la marche est longue.
 * Une liste sans réseau chargé ressort telle quelle, au même tableau : les
 * mémos de l'écran ne se recalculent pas pour rien.
 */
export function appliquerAPiedListe<T extends Listing>(
  listings: readonly T[],
  reseauDe: (stationId: string) => ReseauCalcule | null | undefined,
  routeDe: (stationId: string) => ReseauCalcule | null | undefined = () => null,
): T[] {
  let change = false;
  const out = listings.map((l) => {
    const x = appliquerVoiture(appliquerAPied(l, reseauDe(l.stationId)), routeDe(l.stationId));
    if (x !== l) change = true;
    return x;
  });
  return change ? out : (listings as T[]);
}
