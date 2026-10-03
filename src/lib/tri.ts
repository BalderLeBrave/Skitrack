/**
 * Le sens d'un tri, commun à tous les écrans.
 *
 * Chaque liste se trie dans les deux sens : de la plus grande valeur à la plus
 * petite, et l'inverse. Le sens se choisit à côté du critère, par le même
 * bouton partout (`SensTri`).
 *
 * Une règle tenue dans les deux sens : **ce qui n'est pas relevé finit en
 * queue**. Le compter comme un zéro le mettrait en tête d'un tri croissant et
 * laisserait croire à une mesure nulle.
 *
 * Chargé tel quel par `node --experimental-strip-types` : aucun alias `@/`.
 */

/** `1` : croissant (de la plus petite valeur à la plus grande, de A à Z) ;
 *  `-1` : décroissant. */
import { tr } from "./i18n/tr.ts";

export type Sens = 1 | -1;

export function inverser(s: Sens): Sens {
  return s === 1 ? -1 : 1;
}

/** Relit un sens venu d'ailleurs (état enregistré, adresse). */
export function sensLu(x: unknown, defaut: Sens): Sens {
  return x === 1 || x === -1 ? x : defaut;
}

/** Deux mesures dans le sens demandé ; une valeur absente, ou qui n'est pas un
 *  nombre, passe après toutes les autres, quel que soit le sens. */
export function parMesure(a: number | null | undefined, b: number | null | undefined, sens: Sens): number {
  const na = a == null || !Number.isFinite(a);
  const nb = b == null || !Number.isFinite(b);
  if (na && nb) return 0;
  if (na) return 1;
  if (nb) return -1;
  return sens * ((a as number) - (b as number));
}

/** Deux noms dans le sens demandé, à la française. */
export function parTexte(a: string, b: string, sens: Sens): number {
  return sens * a.localeCompare(b, "fr");
}

/** Ce que le bouton dit du sens courant. Un tri par nom se lit « A → Z ». */
export function sensLbl(s: Sens, alpha = false): string {
  if (alpha) return s === 1 ? "A → Z" : "Z → A";
  return s === 1 ? tr("Croissant") : tr("Décroissant");
}
