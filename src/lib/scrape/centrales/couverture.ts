/**
 * Ce qu'une centrale a rendu de chaque logement : un point, une capacité, des
 * chambres.
 *
 * Le propriétaire veut les trois pour chaque logement de chaque source. Aucun
 * chiffre ne disait jusqu'ici combien de logements de centrale en manquent :
 * la recette du 13 septembre 2026 comptait des « sans localisation » à
 * l'écran, et rien au journal. Cette ligne se lit à chaque recherche, sans
 * une requête de plus, et c'est elle qui dit si un correctif a porté.
 *
 * Les chambres se comptent deux fois, parce qu'elles ne se valent pas : des
 * chambres publiées, et des pièces seules, que la comparaison convertit
 * (« N pièces » = N − 1 chambres, `lodgingFilter.normalizedBedrooms`).
 *
 * **Un point partagé se compte à part.** Trois logements ou plus au même
 * point, au mètre près, c'est souvent une résidence ; ce peut être aussi
 * l'adresse d'une agence recopiée sur tous ses lots, ou la page d'accueil
 * d'une centrale lue comme une fiche. Le compte ne tranche pas : il signale.
 */

import type { Listing } from "@/lib/listings";

export type Couverture = {
  total: number;
  /** Un point plausible, comme `gpsPrecis` le demande. */
  gps: number;
  capacite: number;
  /** Chambres publiées, zéro compris (un studio). */
  chambres: number;
  /** Ni chambres, mais des pièces : la convention s'applique. */
  piecesSeules: number;
  /** Logements dont le point exact est aussi celui de deux autres au moins. */
  pointsPartages: number;
};

type Sujet = Pick<Listing, "lat" | "lon" | "guests" | "bedrooms"> & { rooms?: number | null };

function point(l: Sujet): boolean {
  const { lat, lon } = l;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function couverture(listings: readonly Sujet[]): Couverture {
  const c: Couverture = {
    total: listings.length,
    gps: 0,
    capacite: 0,
    chambres: 0,
    piecesSeules: 0,
    pointsPartages: 0,
  };
  const parPoint = new Map<string, number>();
  for (const l of listings) {
    if (point(l)) {
      c.gps += 1;
      const cle = `${l.lat},${l.lon}`;
      parPoint.set(cle, (parPoint.get(cle) ?? 0) + 1);
    }
    if (l.guests != null) c.capacite += 1;
    if (l.bedrooms != null) c.chambres += 1;
    else if (l.rooms != null && l.rooms > 0) c.piecesSeules += 1;
  }
  for (const n of parPoint.values()) if (n >= 3) c.pointsPartages += n;
  return c;
}

/** « GPS 39/40 · capacité 38/40 · chambres 30/40, pièces seules 10 · points partagés 0 ». */
export function phraseCouverture(c: Couverture): string {
  const n = c.total;
  return (
    `GPS ${c.gps}/${n} · capacité ${c.capacite}/${n} · chambres ${c.chambres}/${n}, ` +
    `pièces seules ${c.piecesSeules} · points partagés ${c.pointsPartages}`
  );
}
