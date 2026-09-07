/**
 * Bornes réelles des filtres chiffrés, lues dans le référentiel chargé.
 *
 * ## Pourquoi les bornes ne peuvent pas être écrites en dur
 *
 * `FILTER_RANGES` fixe une échelle **sémantique** : 0 à 600 km de pistes, 0 à
 * 4 000 m de sommet. Ce sont les bornes du modèle, celles sur lesquelles se
 * décide si une plage est « grande ouverte » ou posée, et elles ne doivent pas
 * bouger — un plafond qui change d'un référentiel à l'autre rendrait une plage
 * enregistrée impossible à rouvrir.
 *
 * Mais ce n'est pas une échelle à montrer. Le plus grand domaine français fait
 * six cents kilomètres seulement dans le pire des cas ; avec le référentiel
 * livré, le maximum réel est bien plus bas, et les trois quarts droits du
 * curseur ne désignaient aucun domaine. Symétriquement, le curseur des
 * kilomètres partait de dix — une valeur qui n'existe nulle part dans le
 * modèle, seulement dans un défaut oublié — et les petits domaines des Vosges
 * ou du Jura restaient hors d'atteinte.
 *
 * Ce module rend donc la plage **réellement occupée** par les domaines chargés.
 * Le curseur la parcourt d'un bout à l'autre ; `RangeFilter` se charge de
 * traduire ses extrémités en bornes sémantiques, de sorte qu'un curseur poussé
 * à fond vaut toujours « sans limite ».
 */

import { useMemo } from 'react'
import type { Domain } from '@/data/referentiel'
import type { FilterRangeKey } from '@/state/appState'
import { FILTER_RANGES, useApp } from '@/state/appState'

export interface FilterBounds {
  min: number
  max: number
}

/** Champ du domaine que chaque plage mesure. `null` = pas lisible du référentiel. */
const FIELD: Partial<Record<FilterRangeKey, (d: Domain) => number>> = {
  base: (d) => d.min,
  summit: (d) => d.max,
  km: (d) => d.km
}

/**
 * Arrondit la plage observée au pas du filtre, vers l'extérieur.
 *
 * Vers l'extérieur, sinon le domaine le plus petit et le plus grand tombent
 * juste en dehors du curseur et deviennent impossibles à atteindre au geste.
 */
function snap({ min, max }: FilterBounds, step: number, ceiling: number): FilterBounds {
  return {
    min: Math.max(0, Math.floor(min / step) * step),
    max: Math.min(ceiling, Math.ceil(max / step) * step)
  }
}

/**
 * Bornes à afficher pour une plage.
 *
 * Retombe sur les bornes sémantiques quand la plage ne se lit pas dans le
 * référentiel (trajet, distance, budget de logement : ils dépendent des
 * adresses de départ et des annonces relevées, pas des domaines) ou quand
 * aucun domaine n'est chargé.
 */
export function boundsOf(range: FilterRangeKey, domains: Domain[]): FilterBounds {
  const spec = FILTER_RANGES[range]
  const read = FIELD[range]
  if (!read || domains.length === 0) return { min: spec.min, max: spec.max }

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const d of domains) {
    const value = read(d)
    if (!Number.isFinite(value)) continue
    if (value < min) min = value
    if (value > max) max = value
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return { min: spec.min, max: spec.max }
  }
  return snap({ min, max }, spec.step, spec.max)
}

export function useFilterBounds(range: FilterRangeKey): FilterBounds {
  const { domains } = useApp()
  return useMemo(() => boundsOf(range, domains), [range, domains])
}
