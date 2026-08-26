/**
 * Filtres de logements réellement posés, et de quoi les retirer un par un.
 *
 * Pendant de `activeFilters.ts`, pour l'écran Logements. Même raison d'être :
 * depuis que le panneau de réglage est un survol qu'on referme, ce qui
 * restreint la liste doit rester visible **au-dessus** d'elle. Sans cette
 * rangée, une liste raccourcie par un budget oublié ou une source décochée
 * ressemble à une recherche infructueuse, et on relance un relevé pour rien.
 *
 * Les valeurs de repos sont celles de `LODG_FILTER_RESET` : une seule table
 * pour le bouton « Réinitialiser » et pour le calcul des puces, sinon le
 * compteur annonce des filtres que la remise à zéro ne remet pas à zéro.
 */

import { useI18n } from '@/i18n'
import { srcOf } from '@/data/lodgings'
import type { AppState } from '@/state/appState'
import { FILTER_RANGES, LODG_FILTER_RESET, useApp } from '@/state/appState'
import { rangeOpen, useDerived } from '@/state/selectors'
import { useFormat } from '@/hooks/useFormat'

export interface ActiveLodgingFilter {
  key: string
  label: string
  clear: () => void
}

export function useActiveLodgingFilters(): {
  active: ActiveLodgingFilter[]
  resetAll: () => void
} {
  const { state, patch } = useApp()
  const { lodgAll } = useDerived()
  const { eur, fmt } = useFormat()
  const { t } = useI18n()

  const active: ActiveLodgingFilter[] = []
  const add = (key: string, label: string, reset: Partial<AppState>): void => {
    active.push({ key, label, clear: () => patch(reset) })
  }

  /** Puce d'une plage posée. Sa croix rouvre la plage **entière**. */
  const addRange = (
    range: 'lodgBudget' | 'lodgDist',
    name: string,
    render: (v: number) => string
  ): void => {
    const spec = FILTER_RANGES[range]
    const lo = state[spec.lo] as number
    const hi = state[spec.hi] as number
    if (rangeOpen(lo, hi, spec.max)) return
    const high = hi >= spec.max ? t('range_no_limit') : render(hi)
    add(range, `${name} ${render(lo)} – ${high}`, {
      [spec.lo]: 0,
      [spec.hi]: spec.max
    } as unknown as Partial<AppState>)
  }

  addRange('lodgBudget', t('filter_lodg_budget_range'), (v) => eur(v))
  addRange('lodgDist', t('filter_lodg_dist_range'), (v) => `${fmt(v)} m`)

  for (const type of state.lodgTypes) {
    add(`type:${type}`, type, { lodgTypes: state.lodgTypes.filter((x) => x !== type) })
  }

  // Une source décochée est le filtre le plus discret et le plus radical :
  // elle retire d'un coup tout ce qu'un relevé a rapporté.
  for (const source of state.lodgSrcOff) {
    const count = lodgAll.filter((l) => srcOf(l) === source).length
    add(`src:${source}`, `${source} ${t('lodg_src_hidden')} (${count})`, {
      lodgSrcOff: state.lodgSrcOff.filter((x) => x !== source)
    })
  }

  if (state.lodgAnnul) add('annul', t('lodg_free_cancel'), { lodgAnnul: false })
  // Plus de puce « Disponibilité confirmée uniquement » : la réservabilité
  // n'est plus un filtre qu'on relâche, c'est une règle de l'écran. Une puce
  // avec une croix promettait de la lever.
  if (state.rooms > 0) {
    add('rooms', `${state.rooms} ${t('scan_rooms_min')}`, { rooms: 0 })
  }

  return { active, resetAll: () => patch({ ...LODG_FILTER_RESET }) }
}
