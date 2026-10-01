/**
 * La migration des annonces enregistrées avant la phase 1 : elles n'ont pas
 * de `completude`, et en reçoivent une, aux trois champs inconnus.
 *
 * Rien n'est deviné. Les nombres que l'annonce porte (`capacity`, `bedrooms`)
 * datent de son relevé, et la porte (`stay/porte.ts`) ne les croit pas sans
 * rafraîchissement : la raison est la sienne, mot pour mot. Le module est
 * pur, pour être lu dans la transaction de mise à niveau d'IndexedDB
 * (`annonces.ts`) comme dans un test.
 */

import { inconnu, remonteeInconnue } from "../stay/statut.ts";

export const RAISON_ANTERIEURE = "annonce antérieure, en attente de rafraîchissement";

function estObjet(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** La completude d'une annonce d'avant la phase 1 : inconnue de bout en bout. */
function completudeAnterieure(source: string) {
  return {
    bedrooms: inconnu(source, RAISON_ANTERIEURE),
    capacity: inconnu(source, RAISON_ANTERIEURE),
    nearestLift: remonteeInconnue(RAISON_ANTERIEURE),
  };
}

/**
 * Ce qu'une entrée de la base doit devenir, et si elle a changé. Un tableau
 * d'objets : chaque objet sans `completude` en reçoit une, les autres restent.
 * Tout le reste est rendu tel quel : la relecture (`versListing`) juge déjà
 * ce qui est illisible. L'entrée n'est pas mutée, et une entrée déjà migrée
 * revient identique, `changee` à faux.
 */
export function migrerAnnonces(v: unknown): { valeur: unknown; changee: boolean } {
  if (!Array.isArray(v)) return { valeur: v, changee: false };
  let changee = false;
  const valeur = v.map((a: unknown) => {
    if (!estObjet(a) || estObjet(a.completude)) return a;
    changee = true;
    const source = typeof a.source === "string" ? a.source : "";
    return { ...a, completude: completudeAnterieure(source) };
  });
  return changee ? { valeur, changee } : { valeur: v, changee };
}
