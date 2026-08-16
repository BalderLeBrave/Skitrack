/**
 * Grille de résultats en mosaïque.
 *
 * Colonnes fluides — `repeat(auto-fill, minmax(240px, 1fr))` — et **aucune
 * media query** : la fenêtre d'une application de bureau se redimensionne à la
 * souris, en continu, et des paliers figés se voient au moment où on les
 * franchit. `auto-fill` recalcule le nombre de colonnes à chaque pixel, ce qui
 * donne 4 colonnes vers 1 280 px, 3 vers 1 000, 2 vers 760 et 1 sous 640.
 *
 * Les gouttières sont dissymétriques — 24 px entre les colonnes, 40 px entre
 * les rangées — parce que le bloc texte d'une carte se lit comme la légende de
 * son image : sans cet écart vertical plus large, la ligne de prix d'une carte
 * se rapproche de l'image de la carte du dessous et semble lui appartenir.
 *
 * `loading` rend des squelettes **au même gabarit** : la grille ne bouge pas
 * quand les résultats arrivent.
 */

import { ResultCardSkeleton, type ResultRatio } from './ResultCard'
import type { ReactNode } from 'react'

export interface ResultGridProps {
  children?: ReactNode
  /** Affiche des squelettes à la place du contenu. */
  loading?: boolean
  /** Nombre de squelettes. Assez pour remplir le premier écran, pas plus. */
  skeletonCount?: number
  ratio?: ResultRatio
  /** Gouttières resserrées, pour un volet étroit (liste à côté de la carte). */
  compact?: boolean
  label?: string
}

export function ResultGrid({
  children,
  loading = false,
  skeletonCount = 8,
  ratio = 'wide',
  compact = false,
  label
}: ResultGridProps): JSX.Element {
  return (
    <div
      className={`resultgrid${compact ? ' resultgrid--compact' : ''}`}
      role="list"
      aria-label={label}
      aria-busy={loading || undefined}
    >
      {loading
        ? Array.from({ length: skeletonCount }, (_, i) => <ResultCardSkeleton key={i} ratio={ratio} />)
        : children}
    </div>
  )
}
