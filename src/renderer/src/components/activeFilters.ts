/**
 * Filtres de domaines réellement posés, et de quoi les retirer un par un.
 *
 * Ce calcul vivait dans `FilterPanel`. La refonte sort la rangée de puces du
 * panneau pour la poser au-dessus de la liste — les puces doivent rester
 * visibles quand le panneau est fermé, sinon une liste raccourcie par un curseur
 * oublié passe pour une liste vide. Panneau et rangée lisent donc la **même**
 * fonction : deux copies auraient fini par diverger le jour où une borne change
 * de nom.
 *
 * Aucune logique n'a changé au passage : mêmes valeurs de repos, mêmes patches
 * de remise à zéro, même ordre.
 */

import { useI18n } from '@/i18n'
import type { AppState, FilterRangeKey } from '@/state/appState'
import { FILTER_RANGES, useApp } from '@/state/appState'
import { rangeOpen } from '@/state/selectors'
import { useFormat } from '@/hooks/useFormat'

/**
 * Valeurs de repos des filtres de domaines.
 *
 * Sert deux choses d'un coup : le bouton « Réinitialiser », et le calcul des
 * filtres actifs — un filtre est actif quand il s'écarte de cette table. Une
 * liste séparée pour chaque usage aurait fini par diverger, et le compteur
 * aurait annoncé des filtres que la réinitialisation ne remettait pas à zéro.
 *
 * Chaque borne haute repart à son **plafond**. La remettre à 0 fermerait la
 * plage sur le seul zéro et viderait la liste, ce qui est exactement l'inverse
 * de ce qu'attend un bouton « Réinitialiser ».
 */
export const FILTER_DEFAULTS = {
  domainQuery: '',
  baseMin: 0,
  baseMax: FILTER_RANGES.base.max,
  summitMin: 0,
  summitMax: FILTER_RANGES.summit.max,
  kmMin: 10,
  kmMax: FILTER_RANGES.km.max,
  travelMin: 0,
  travelMax: FILTER_RANGES.travel.max,
  distMin: 0,
  distMax: FILTER_RANGES.dist.max,
  forfaitMin: 0,
  forfaitMax: FILTER_RANGES.forfait.max,
  avoidTolls: false,
  massifs: [] as string[],
  glacier: false,
  linked: false
} satisfies Partial<AppState>

export interface ActiveFilter {
  key: string
  label: string
  clear: () => void
}

export function useActiveFilters(): { active: ActiveFilter[]; resetAll: () => void } {
  const { state, patch } = useApp()
  const { dur, eur, fmt } = useFormat()
  const { t } = useI18n()

  const active: ActiveFilter[] = []
  const add = (key: string, label: string, reset: Partial<AppState>): void => {
    active.push({ key, label, clear: () => patch(reset) })
  }

  /**
   * Puce d'une plage posée.
   *
   * Sa croix **rouvre la plage entière** — plancher à 0, plafond au maximum —
   * au lieu de ramener une borne à 0, qui refermerait le filtre au plus serré
   * au moment même où on croit le retirer.
   */
  const addRange = (range: FilterRangeKey, name: string, render: (v: number) => string): void => {
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

  if (state.domainQuery.trim()) add('q', `« ${state.domainQuery.trim()} »`, { domainQuery: '' })
  addRange('base', t('chip_base'), (v) => `${fmt(v)} m`)
  addRange('summit', t('chip_summit'), (v) => `${fmt(v)} m`)
  addRange('km', t('chip_km'), (v) => `${fmt(v)} km`)
  addRange('travel', t('chip_travel'), (v) => dur(v))
  addRange('dist', t('chip_dist'), (v) => `${fmt(v)} km`)
  addRange('forfait', t('chip_pass'), (v) => eur(v))
  if (state.avoidTolls) add('tolls', t('filter_avoid_tolls'), { avoidTolls: false })
  for (const name of state.massifs) {
    add(`massif:${name}`, name, { massifs: state.massifs.filter((x) => x !== name) })
  }
  if (state.glacier) add('glacier', t('filter_glacier'), { glacier: false })
  if (state.linked) add('linked', t('filter_linked'), { linked: false })

  return { active, resetAll: () => patch({ ...FILTER_DEFAULTS }) }
}
