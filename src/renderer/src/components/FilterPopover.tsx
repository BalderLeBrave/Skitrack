/**
 * Bouton « Filtres » et son panneau, en survol ancré.
 *
 * ## Ce que ce composant corrige
 *
 * Le panneau de filtres occupait la colonne entière : ouvert — et il l'était
 * par défaut — il poussait la liste sous la ligne de flottaison, si bien qu'on
 * réglait un critère sans jamais voir ce qu'il changeait. Un filtre dont on ne
 * voit pas l'effet n'est pas un filtre, c'est un formulaire.
 *
 * Il devient un survol ancré au bouton qui l'ouvre : trois cent quatre-vingts
 * pixels de large, borné en hauteur, posé **au-dessus** de la liste et non
 * devant elle. La liste reste visible et se met à jour derrière, à chaque
 * mouvement de curseur.
 *
 * ## Les deux fermetures
 *
 * Un clic à l'extérieur et la touche Échap. Ce sont les deux gestes qu'on fait
 * sans y penser devant un survol ; en manquer un seul donne l'impression d'un
 * panneau collé. Le clic est écouté en `pointerdown` et non en `click` : un
 * `click` arrive après que la cible a bougé, et un curseur relâché hors du
 * panneau refermait alors le survol en plein réglage.
 *
 * Ce qui reste dehors : la rangée de puces des filtres posés. Elle vit
 * au-dessus de la liste, panneau fermé compris — sans elle, une liste
 * raccourcie par un curseur oublié passe pour une liste vide.
 */

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface Props {
  open: boolean
  onToggle: () => void
  onClose: () => void
  /** Libellé du bouton : « Filtres ». */
  label: string
  /** Nombre de filtres posés, affiché en pastille. `0` = rien à annoncer. */
  count?: number
  /** Classe du bouton déclencheur, pour suivre le style de son bandeau. */
  buttonClassName?: string
  children: ReactNode
}

export function FilterPopover({
  open,
  onToggle,
  onClose,
  label,
  count = 0,
  buttonClassName = 'btn btn--pill',
  children
}: Props): JSX.Element {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) onClose()
    }
    const escape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', escape)
    }
  }, [open, onClose])

  return (
    <div className="filteranchor" ref={root}>
      <button
        type="button"
        className={`${buttonClassName}${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={onToggle}
      >
        {label}
        {count > 0 && <span className="filteranchor__count u-num">{count}</span>}
      </button>
      {open && (
        <div className="filterpop" role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  )
}
