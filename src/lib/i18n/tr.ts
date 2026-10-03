/**
 * Traduire un texte de l'interface : `tr("Texte en français")`.
 *
 * Le texte français **est** la clé. Il reste lisible dans le code, là où il
 * s'affiche, et une phrase sans traduction s'affiche en français plutôt que
 * de montrer un identifiant. L'anglais vit dans `en/`, un fichier par
 * écran ; `tr.test.ts` vérifie que chaque `tr("…")` du dépôt y a sa
 * traduction, avec les mêmes variables.
 *
 * Les variables s'écrivent entre accolades et se passent déjà formatées :
 * `tr("{n} logements", { n: entier(12) })`. Un pluriel se choisit avant :
 * `n > 1 ? tr("{n} logements", …) : tr("{n} logement", …)`.
 */

import { EN } from "./en/index.ts";
import { langue } from "./langue.ts";

export type Variables = Readonly<Record<string, string | number>>;

export function remplir(modele: string, vars?: Variables): string {
  if (!vars) return modele;
  return modele.replace(/\{(\w+)\}/g, (tout, k: string) => (k in vars ? String(vars[k]) : tout));
}

export function tr(fr: string, vars?: Variables): string {
  const modele = langue() === "en" ? (EN[fr] ?? fr) : fr;
  return remplir(modele, vars);
}

/**
 * Le même mot français, deux sens : « Départ » d'un séjour (Departure) et
 * « Départ » d'une piste (Top). `trC("piste", "Départ")` cherche d'abord la
 * clé `piste|Départ` dans le dictionnaire.
 */
export function trC(contexte: string, fr: string, vars?: Variables): string {
  const modele = langue() === "en" ? (EN[`${contexte}|${fr}`] ?? EN[fr] ?? fr) : fr;
  return remplir(modele, vars);
}

/**
 * Marque un texte à traduire **plus tard**, sans le traduire : pour une table
 * de libellés posée au chargement du module (options de tri, en-têtes de
 * colonnes). La langue n'est connue qu'au rendu ; un `tr` appelé au
 * chargement resterait en français. On écrit `label: aTraduire("Prix total")`
 * dans la table, et `tr(o.label)` au rendu. Le test lit ces marques comme
 * des `tr`.
 */
export function aTraduire(fr: string): string {
  return fr;
}

/** Un nombre et son nom, au singulier ou au pluriel selon la langue : « 0 logement » en français, « 0 listings » en anglais. */
export function trN(n: number, un: string, plusieurs: string, vars?: Variables): string {
  const pluriel = langue() === "en" ? n !== 1 : n > 1;
  return tr(pluriel ? plusieurs : un, { n, ...vars });
}
