/**
 * Les équipements d'une annonce, sur une liste fermée de douze clés.
 *
 * Deux lectures, et une seule règle : ce que l'annonce ne dit pas vaut
 * `inconnu`, jamais `non`.
 *
 * - Une liste structurée (les équipements d'une fiche Airbnb, les
 *   pictogrammes d'une centrale) : un équipement listé vaut `oui`, un
 *   équipement que la plateforme marque comme absent vaut `non`.
 * - Un texte libre (une description) : un équipement nommé vaut `oui` ; `non`
 *   seulement quand le texte le dit en toutes lettres (« sans ascenseur »,
 *   « animaux non admis »).
 *
 * Module pur, chargé tel quel par `node --experimental-strip-types`.
 */

import { aTraduire } from "../i18n/tr.ts";

export const CLES_EQUIPEMENT = [
  "balcon",
  "cheminee",
  "wifi",
  "laveVaisselle",
  "laveLinge",
  "linge",
  "parking",
  "casierSkis",
  "saunaSpa",
  "piscine",
  "animaux",
  "ascenseur",
] as const;
export type CleEquipement = (typeof CLES_EQUIPEMENT)[number];
export type ValeurEquipement = "oui" | "non" | "inconnu";
export type Equipement = { cle: CleEquipement; libelle: string; valeur: ValeurEquipement };

/** Les libellés, en français ; à traduire au rendu : `tr(LIBELLE_EQUIPEMENT[c])`. */
export const LIBELLE_EQUIPEMENT: Record<CleEquipement, string> = {
  balcon: aTraduire("Balcon ou terrasse"),
  cheminee: aTraduire("Cheminée"),
  wifi: aTraduire("Wi-Fi"),
  laveVaisselle: aTraduire("Lave-vaisselle"),
  laveLinge: aTraduire("Lave-linge"),
  linge: aTraduire("Linge fourni"),
  parking: aTraduire("Parking"),
  casierSkis: aTraduire("Local ou casier à skis"),
  saunaSpa: aTraduire("Sauna ou spa"),
  piscine: aTraduire("Piscine"),
  animaux: aTraduire("Animaux acceptés"),
  ascenseur: aTraduire("Ascenseur"),
};

/** Minuscules, sans accents, apostrophes droites, espaces repliées. */
export function plierEquipement(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ce qui désigne chaque équipement, en français et en anglais, sur un texte
 * plié. « Lift » n'est pas un ascenseur : c'est une remontée.
 */
const OUI: Record<CleEquipement, RegExp> = {
  balcon: /\b(balcons?|terrasses?|balcony|balconies|terrace|patio)\b/,
  cheminee: /\b(cheminee|poele a bois|insert|fireplace|wood ?(burning )?stove)\b/,
  wifi: /\b(wi[- ]?fi|wireless|internet)\b/,
  laveVaisselle: /\b(lave[- ]?vaisselle|dishwasher)\b/,
  laveLinge: /\b(lave[- ]?linge|machine a laver|washing machine|washer)\b/,
  linge: /\b(linge (de maison|de lit|fourni|inclus|de toilette)|draps|serviettes|bed linens?|linens|towels|essentials)\b/,
  parking: /\b(parking|garage|stationnement|place de parc|car park)\b/,
  casierSkis: /\b(casiers? a skis?|locals? a skis?|local skis?|casiers? skis?|ski ?rooms?|skiroom|ski lockers?|ski storage)\b/,
  saunaSpa: /\b(sauna|spa|hammam|jacuzzi|bain a remous|bain nordique|hot tub)\b/,
  piscine: /\b(piscine|swimming pool|pool)\b/,
  animaux: /\b(animaux (acceptes|admis|bienvenus|autorises|avec supplement)|animal (accepte|admis)|pets? (allowed|welcome)|pet friendly)\b/,
  ascenseur: /\b(ascenseur|elevator)\b/,
};

/** Ce qui dit l'absence en toutes lettres. */
const NON: Partial<Record<CleEquipement, RegExp>> = {
  wifi: /\b(pas de wi[- ]?fi|sans wi[- ]?fi|no wi[- ]?fi)\b/,
  parking: /\b(pas de parking|sans parking|no parking)\b/,
  animaux: /\b(animaux[^.]{0,30}\b(ne sont pas|non|pas) (toleres|acceptes|admis|autorises)|animaux (interdits|refuses)|pas d'animaux|no pets|pets not allowed)\b/,
  ascenseur: /\b(sans ascenseur|pas d'ascenseur|no elevator)\b/,
  piscine: /\b(pas de piscine|sans piscine)\b/,
  // Le linge de lit ou de maison. Le linge de toilette seul n'en décide pas :
  // ses mentions sont ôtées avant (`SANS_TOILETTE`).
  // « La location de linge de maison est incluse » (Morzine, GreenGo) dit le
  // contraire : une location suivie de « inclus » ou « compris » n'est pas une absence.
  linge: /\b((linge|draps)[^.\n]{0,60}\bnon (fourni|fournis|inclus|compris)|linge (de lit )?en option|location de linge(?![^.\n]{0,40}\b(inclus|incluse|compris|comprise|offert|offerte)\b)|linge a louer)\b/,
};

/** « Linge de toilette non fourni », « serviettes non incluses » : rien ne s'en
 *  déduit pour le linge de lit (« draps fournis, linge de toilette non
 *  fourni », Pralognan). */
const SANS_TOILETTE = /\b(linge de toilette|serviettes)( de toilette)? non (fourni|fournis|fournies|inclus|incluses|compris)\b/g;

export type EquipementsLus = Partial<Record<CleEquipement, "oui" | "non">>;

/** Lit un texte libre : `oui` pour un équipement nommé, `non` pour une
 *  absence écrite. Le silence ne donne rien. */
export function depuisTexte(texte: string | null | undefined): EquipementsLus {
  const t = plierEquipement(texte ?? "");
  const out: EquipementsLus = {};
  if (!t) return out;
  for (const c of CLES_EQUIPEMENT) {
    if (NON[c]?.test(c === "linge" ? t.replace(SANS_TOILETTE, " ") : t)) out[c] = "non";
    else if (OUI[c].test(t)) out[c] = "oui";
  }
  return out;
}

/**
 * Lit une liste structurée : chaque élément nomme un équipement et dit, quand
 * la plateforme le précise, s'il est présent (`disponible`). Un élément
 * présent l'emporte sur un absent du même nom.
 */
export function depuisListe(items: readonly { texte: string; disponible?: boolean | null }[]): EquipementsLus {
  const out: EquipementsLus = {};
  for (const it of items) {
    const lu = depuisTexte(it.texte);
    for (const c of Object.keys(lu) as CleEquipement[]) {
      const v = it.disponible === false ? "non" : lu[c];
      if (v === "oui" || out[c] !== "oui") out[c] = v;
    }
  }
  return out;
}

/** Réunit plusieurs lectures, la première l'emportant : la liste structurée
 *  avant le texte libre. */
export function fusionner(...parts: readonly (EquipementsLus | null | undefined)[]): EquipementsLus {
  const out: EquipementsLus = {};
  for (const p of parts) {
    if (!p) continue;
    for (const c of Object.keys(p) as CleEquipement[]) if (out[c] == null && p[c]) out[c] = p[c];
  }
  return out;
}

/** Les douze équipements, dans l'ordre de la liste ; `inconnu` pour ce que
 *  l'annonce ne dit pas. `null` quand aucune source n'a été lue : une annonce
 *  sans équipements relevés n'est pas une annonce « sans rien ». */
export function equipements(lus: EquipementsLus | null | undefined): Equipement[] | null {
  if (!lus) return null;
  return CLES_EQUIPEMENT.map((cle) => ({ cle, libelle: LIBELLE_EQUIPEMENT[cle], valeur: lus[cle] ?? "inconnu" }));
}
