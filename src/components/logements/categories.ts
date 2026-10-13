/**
 * Les catégories de logements de la maquette (`LCATS`, Skitrack App.dc.html) :
 * huit pictogrammes du bandeau collant, chacun posé sur un champ réel de
 * l'annonce. Ce que la source ne publie pas ne passe pas : une annonce sans
 * distance mesurée n'est pas « au pied des pistes », une annonce dont les
 * équipements n'ont pas été lus n'a pas de cheminée.
 */

import { ICONES } from "@/components/maquette";
import { aTraduire } from "@/lib/i18n";
import type { Listing } from "@/lib/listings";
import { aEquipement } from "@/lib/stay/ficheEnrichie";
import type { TypeLogement } from "@/lib/stay/logement";
import { distRemonteePublieeM } from "@/lib/stay/situer";

export type CleCategorie = "pied" | "skis" | "chalet" | "appart" | "tablee" | "cheminee" | "sauna" | "animaux";

/** Distance publiée à une remontée, ou `null` (point triangulé, pas de point). */
function remonteeM(l: Listing): number | null {
  return distRemonteePublieeM(l) ?? null;
}

export const CATEGORIES_LOGEMENTS: readonly {
  key: CleCategorie;
  label: string;
  icone: string;
  fn: (l: Listing) => boolean;
}[] = [
  {
    key: "pied",
    label: aTraduire("Pied des pistes"),
    icone: ICONES.lift,
    fn: (l) => {
      const d = remonteeM(l);
      return d != null && d <= 200;
    },
  },
  {
    key: "skis",
    label: aTraduire("Ski aux pieds"),
    icone: ICONES.skis,
    fn: (l) => {
      const d = remonteeM(l);
      return (d != null && d <= 50) || aEquipement(l, "ski_aux_pieds");
    },
  },
  { key: "chalet", label: aTraduire("Chalets"), icone: ICONES.chalet, fn: (l) => l.lodgingType === "chalet" },
  {
    key: "appart",
    label: aTraduire("Appartements"),
    icone: ICONES.appart,
    fn: (l) => l.lodgingType === "appartement",
  },
  {
    key: "tablee",
    label: aTraduire("Grandes tablées"),
    icone: ICONES.family,
    fn: (l) => l.capacity != null && l.capacity >= 12,
  },
  { key: "cheminee", label: aTraduire("Cheminée"), icone: ICONES.flame, fn: (l) => aEquipement(l, "cheminee") },
  {
    key: "sauna",
    label: aTraduire("Sauna"),
    icone: ICONES.sauna,
    fn: (l) => aEquipement(l, "sauna") || aEquipement(l, "sauna_spa"),
  },
  { key: "animaux", label: aTraduire("Animaux acceptés"), icone: ICONES.paw, fn: (l) => aEquipement(l, "animaux") },
];

/** Les types de logement du filtre, dans l'ordre de la maquette, avec leur pictogramme. */
export const TYPES_LOGEMENT: readonly { key: TypeLogement; label: string; icone: string }[] = [
  { key: "chalet", label: aTraduire("Chalet"), icone: ICONES.chalet },
  { key: "appartement", label: aTraduire("Appartement"), icone: ICONES.appart },
  { key: "studio", label: aTraduire("Studio"), icone: ICONES.studio },
  { key: "maison", label: aTraduire("Maison"), icone: ICONES.chalet },
  { key: "hotel", label: aTraduire("Hôtel"), icone: ICONES.res },
  { key: "chambre", label: aTraduire("Chambre"), icone: ICONES.studio },
  { key: "autre", label: aTraduire("Autre"), icone: ICONES.list },
];

/** Le pictogramme d'un équipement (`EQUIPEMENTS_FICHE`) ; défaut : la coche. */
export const ICONE_EQUIPEMENT: Readonly<Record<string, string>> = {
  wifi: ICONES.wifi,
  parking: ICONES.parking,
  cheminee: ICONES.flame,
  sauna: ICONES.sauna,
  sauna_spa: ICONES.sauna,
  jacuzzi: ICONES.sauna,
  lave_vaisselle: ICONES.lv,
  casier_skis: ICONES.skiroom,
  balcon: ICONES.balcon,
  animaux: ICONES.paw,
  piscine: ICONES.pool,
  ski_aux_pieds: ICONES.skis,
  vue: ICONES.mount,
};

/** Les neuf équipements de la fenêtre Filtres de la maquette (`EQ`), dans son
 *  ordre et sous ses libellés, sur les clés de `EQUIPEMENTS_FICHE`. */
export const EQUIPEMENTS_MAQUETTE: readonly { id: string; label: string; icone: string }[] = [
  { id: "wifi", label: aTraduire("Wi-Fi"), icone: ICONES.wifi },
  { id: "parking", label: aTraduire("Parking"), icone: ICONES.parking },
  { id: "cheminee", label: aTraduire("Cheminée"), icone: ICONES.flame },
  { id: "sauna", label: aTraduire("Sauna"), icone: ICONES.sauna },
  { id: "lave_vaisselle", label: aTraduire("Lave-vaisselle"), icone: ICONES.lv },
  { id: "casier_skis", label: aTraduire("Local à skis"), icone: ICONES.skiroom },
  { id: "balcon", label: aTraduire("Balcon"), icone: ICONES.balcon },
  { id: "animaux", label: aTraduire("Animaux acceptés"), icone: ICONES.paw },
  { id: "piscine", label: aTraduire("Piscine"), icone: ICONES.pool },
];
