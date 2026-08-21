/**
 * Plages de filtre à deux bornes.
 *
 * Vivait dans `state/selectors.tsx`. En est sorti quand `data/lodgingFilter.ts`
 * en a eu besoin : l'importer depuis le sélecteur aurait fermé un cycle, et le
 * recopier aurait laissé deux définitions d'une règle qui n'en supporte pas
 * deux — la première recopie omettait déjà `rangeOpen`.
 */

/**
 * Une plage est **ouverte** — donc inactive — quand sa borne basse touche le
 * plancher et sa borne haute le plafond. Le plafond compte comme « sans
 * limite » : sans cela, un domaine à 620 km de route sortirait d'une plage de
 * distance laissée grande ouverte à 1 200 km.
 */
export const rangeOpen = (lo: number, hi: number, ceil: number): boolean => lo === 0 && hi >= ceil

export const inRange = (v: number, lo: number, hi: number, ceil: number): boolean =>
  rangeOpen(lo, hi, ceil) || (v >= lo && (hi >= ceil || v <= hi))

/**
 * Même règle, mais une valeur inconnue est écartée dès que la plage est posée :
 * un domaine dont on ignore le temps de route ou le tarif de forfait ne peut
 * pas prétendre entrer dans une fourchette qu'on ne peut pas vérifier.
 */
export const inRangeOrNull = (v: number | null, lo: number, hi: number, ceil: number): boolean =>
  rangeOpen(lo, hi, ceil) || (v != null && v >= lo && (hi >= ceil || v <= hi))
