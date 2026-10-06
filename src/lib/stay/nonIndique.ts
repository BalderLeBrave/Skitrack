/**
 * Les champs que l'annonce ne porte pas, pour l'encadré « Non indiqué par
 * [plateforme] » de la fiche. Seuls les champs publiés par la plateforme
 * comptent : la distance à la remontée ou l'altitude, que Skitrack mesure,
 * n'y figurent pas, ni la description : absente, elle ne s'affiche pas.
 *
 * Module pur, chargé tel quel par `node --experimental-strip-types`.
 */

import type { Listing } from "../listings.ts";
import { aTraduire } from "../i18n/tr.ts";

export const CHAMPS_ANNONCE = [
  "prix",
  "capacite",
  "chambres",
  "lits",
  "sallesDeBain",
  "type",
  "note",
  "avis",
  "position",
  "photos",
  "lien",
] as const;
export type ChampAnnonce = (typeof CHAMPS_ANNONCE)[number];

/** Les libellés, à traduire au rendu : `tr(CHAMP_LIBELLE[c])`. */
export const CHAMP_LIBELLE: Record<ChampAnnonce, string> = {
  prix: aTraduire("prix du séjour"),
  capacite: aTraduire("capacité"),
  chambres: aTraduire("chambres"),
  lits: aTraduire("lits"),
  sallesDeBain: aTraduire("salles de bain"),
  type: aTraduire("type de logement"),
  note: aTraduire("note"),
  avis: aTraduire("nombre d’avis"),
  position: aTraduire("position"),
  photos: aTraduire("photos"),
  lien: aTraduire("lien de l’annonce"),
};

type Sujet = Pick<
  Listing,
  | "total"
  | "capacity"
  | "bedrooms"
  | "rooms"
  | "isStudio"
  | "beds"
  | "baths"
  | "propertyType"
  | "rating"
  | "reviewCount"
  | "lat"
  | "lon"
  | "photo"
  | "photos"
  | "url"
>;

const vide = (s: string | null | undefined) => s == null || s.trim() === "";

/** Les champs vides de l'annonce, dans l'ordre de `CHAMPS_ANNONCE`. Un
 *  studio a ses chambres (zéro) ; des pièces publiées en tiennent lieu. */
export function champsNonIndiques(l: Sujet): ChampAnnonce[] {
  const manque: Record<ChampAnnonce, boolean> = {
    prix: !(l.total > 0),
    capacite: l.capacity == null,
    chambres: l.bedrooms == null && l.isStudio !== true && !(l.rooms != null && l.rooms > 0),
    lits: l.beds == null,
    sallesDeBain: l.baths == null,
    type: vide(l.propertyType),
    note: l.rating == null,
    avis: l.reviewCount == null,
    position: l.lat == null || l.lon == null,
    photos: !l.photo && !(l.photos ?? []).some(Boolean),
    lien: vide(l.url),
  };
  return CHAMPS_ANNONCE.filter((c) => manque[c]);
}
