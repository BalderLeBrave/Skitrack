/** Gestes du parcours qui écrivent dans le store puis changent de route. */

import type { NavigateFunction } from 'react-router-dom'
import type { Domain } from '@/data/referentiel'
import type { AppState } from '@/state/appState'
import { PATHS } from '../router'

/** Ouvre l'étape Logements pour une station et lance le relevé. */
export function openLodgings(d: Domain, patch: (p: Partial<AppState>) => void, navigate: NavigateFunction): void {
  patch({ lodgingDomainId: d.id, selectedId: d.id, lodgPhase: 'searching', lodgSearchMsg: null })
  navigate(PATHS.lodgings)
}
