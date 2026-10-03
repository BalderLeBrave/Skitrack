/**
 * Écrire un nombre. **Une seule implémentation**, pour de bon.
 *
 * Elle vivait dans `parcours.ts`, puis `devises.ts` en a eu besoin pour écrire
 * une somme, et `unites.ts` pour écrire une distance. Trois copies de la même
 * règle auraient fini par diverger sur l'espace des milliers — c'est un détail
 * qu'on ne voit pas en relisant, et qui saute aux yeux sur un écran où deux
 * nombres se suivent.
 *
 * La règle tenue depuis l'origine : séparateur de milliers en espace **simple**
 * et non en espace fine, que l'ICU insère et que le dépôt n'a jamais voulue.
 */

/** Les espaces que l'ICU glisse entre les milliers et devant les symboles. */
const ESPACES_ETROITES = new RegExp(
  `[${String.fromCharCode(0x202f)}${String.fromCharCode(0xa0)}]`,
  "g",
);

import { langueIntl } from "./i18n/langue.ts";

/**
 * La langue dans laquelle les nombres sont écrits : celle de l'interface
 * (`langueIntl`). Isolée ici pour qu'il y ait **un** endroit à reprendre, et
 * non onze `toLocaleString("fr-FR")` à retrouver dans le dépôt.
 */
export function langueNombres(): string {
  return langueIntl();
}

/** Entier arrondi, séparateur de milliers, espace simple. */
export function entier(n: number): string {
  return Math.round(n).toLocaleString(langueNombres()).replace(ESPACES_ETROITES, " ");
}

/** Décimal, au plus `max` chiffres après la virgule, et aucun zéro inutile. */
export function decimal(n: number, max = 1): string {
  return n
    .toLocaleString(langueNombres(), { maximumFractionDigits: max })
    .replace(ESPACES_ETROITES, " ");
}
