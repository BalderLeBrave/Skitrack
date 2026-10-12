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
 */

import type { Listing } from "../listings.ts";
import { marcheVersGare, type Champ, type Reseau } from "../geo/reseauPieton.ts";

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

/** Un réseau prêt : le graphe et son champ de distances. */
export type ReseauCalcule = { reseau: Reseau; champ: Champ };

export type ViaDistance = "pieton" | "vol";

/** Ce que lit la marque : la distance, la marque et le point. */
export type AvecMarche = Pick<Listing, "distToLiftM" | "aPied"> & { lat?: number | null; lon?: number | null };

/** La distance de l'annonce est-elle une marche ? */
export function estAPied(l: AvecMarche): boolean {
  const a = l.aPied;
  return a != null && a.m === l.distToLiftM && a.lat === l.lat && a.lon === l.lon;
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
 * Toute une liste, chaque annonce avec le réseau de sa station
 * (`stationId`). Une liste sans réseau chargé ressort telle quelle, au même
 * tableau : les mémos de l'écran ne se recalculent pas pour rien.
 */
export function appliquerAPiedListe<T extends Listing>(
  listings: readonly T[],
  reseauDe: (stationId: string) => ReseauCalcule | null | undefined,
): T[] {
  let change = false;
  const out = listings.map((l) => {
    const x = appliquerAPied(l, reseauDe(l.stationId));
    if (x !== l) change = true;
    return x;
  });
  return change ? out : (listings as T[]);
}
