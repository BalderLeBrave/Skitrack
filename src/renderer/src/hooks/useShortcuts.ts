/**
 * Raccourcis clavier globaux.
 *
 * L'application se pilote beaucoup au clavier : parcourir les domaines à la
 * flèche puis ouvrir les logements à Entrée évite l'aller-retour souris entre
 * la liste et la carte. Les touches simples (`f`, `m`) sont ignorées dès que le
 * focus est dans un champ, sinon taper « format » dans une adresse replierait
 * les filtres.
 */

import { useEffect } from 'react'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'

const MAX_RESULTS = 40

export function useShortcuts(): void {
  const { state, patch, screen } = useApp()
  const { filtered } = useDerived()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase() ?? ''
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return

      if (e.key === 'Escape') {
        patch({
          ficheId: null,
          compareOpen: false,
          onboard: false,
          domFicheId: null,
          importOpen: false,
          peopleOpen: false
        })
        return
      }

      if (screen === 'recherche') {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const list = filtered.slice(0, MAX_RESULTS)
          if (list.length === 0) return
          const i = Math.max(
            0,
            list.findIndex((d) => d.id === state.selectedId)
          )
          const j = Math.min(list.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))
          patch({ selectedId: list[j].id })
        } else if (e.key === 'f') {
          patch({ searchFiltersOpen: !state.searchFiltersOpen })
        } else if (e.key === 'm') {
          patch({ searchMapOpen: !state.searchMapOpen })
        } else if (e.key === 'Enter' && state.selectedId != null) {
          patch({ tab: 'logements', lodgingDomainId: state.selectedId })
        }
      } else if (screen === 'logements') {
        if (e.key === 'f') patch({ lodgFiltersOpen: !state.lodgFiltersOpen })
        else if (e.key === 'm') patch({ lodgMapOpen: !state.lodgMapOpen })
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, patch, screen, filtered])
}

/**
 * Piège de focus d'une modale : la tabulation tourne en boucle à l'intérieur.
 * Sans cela, on tabule derrière le voile jusqu'à des contrôles invisibles.
 */
export function useFocusTrap(ref: React.RefObject<HTMLElement>, active = true): void {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return
      const root = ref.current
      if (!root) return
      const focusables = root.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const outside = !root.contains(document.activeElement)
      if (e.shiftKey && (document.activeElement === first || outside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || outside)) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ref, active])
}
