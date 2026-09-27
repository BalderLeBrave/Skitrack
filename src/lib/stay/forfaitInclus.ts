/**
 * Un séjour vendu forfaits de ski compris.
 *
 * Consigne du propriétaire du 26 septembre 2026 : ces séjours sont gardés,
 * comme toute location, et leur prix porte déjà les forfaits. Le récapitulatif
 * (Réservation, et le pied de Logements) n'y ajoute donc pas le coût des
 * forfaits du groupe : il les dit compris. L'écran Prix les écartait depuis le
 * 25 septembre (motif « forfait compris » de `prix/horsSujet.ts`).
 *
 * Deux preuves, dans cet ordre : ce que le collecteur a lu à la source
 * (`skiPassIncluded`), puis le titre, pour les plateformes qui ne le disent
 * qu'en toutes lettres (« Belambra Clubs Arc 2000 - L'aiguille Rouge - Ski
 * Pass Included », sur Booking). Sans l'une ni l'autre, le séjour est une
 * location seule : rien n'est supposé.
 *
 * Module pur. Chargé tel quel par `node --experimental-strip-types` : imports
 * relatifs avec leur extension, types en `import type`.
 */

import type { Listing } from "../listings.ts";

/** Minuscules, sans accents, espaces repliées. */
function plier(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * « Ski Pass Included », « forfaits de ski inclus », « forfait compris ».
 * « Reduced Prices On Ski Passes » (Ikaria, Châtel) n'est pas un forfait
 * compris, ni « à 50 m du point de vente des forfaits ».
 */
const FORFAIT_COMPRIS =
  /\bski[\s-]?pass(?:es)?\s+(?:included|inclus)\b|\bforfaits?\s+(?:de\s+ski\s+)?(?:inclus|compris)\b/;

export function forfaitCompris(titre: string | null | undefined): boolean {
  return FORFAIT_COMPRIS.test(plier(titre));
}

/**
 * Le prix publié comprend-il les forfaits ? Ce que la source a dit l'emporte,
 * dans un sens comme dans l'autre ; sinon, le titre.
 */
export function forfaitInclus(l: Pick<Listing, "title"> & Partial<Pick<Listing, "skiPassIncluded">>): boolean {
  if (l.skiPassIncluded != null) return l.skiPassIncluded;
  return forfaitCompris(l.title);
}
