/**
 * Lecture d'un jeton du système depuis du code qui ne peut pas écrire de CSS.
 *
 * Deux endroits en ont besoin : le canevas des flocons et les couches MapLibre,
 * qui attendent une couleur résolue et ne comprennent pas `var(--x)`. Plutôt
 * que de recopier la valeur dans le composant, on la lit sur la feuille : le
 * système reste la seule source.
 *
 * `repli` sert au rendu serveur et au cas où la variable n'existe pas encore.
 */

export function jeton(nom: string, repli: string): string {
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") return repli;
  const lu = getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
  return lu || repli;
}
