/**
 * Coquille : barre haute, barre de séjour persistante hors accueil, contenu,
 * tab bar mobile, tiroirs globaux. Les hooks gelés du shell historique
 * (raccourcis, registre des connecteurs, synchro de la sélection) sont montés
 * ici et nulle part ailleurs.
 */

import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Onboarding } from '@/components/Onboarding'
import { PeopleDrawer } from '@/components/PeopleDrawer'
import { SvgDefs } from '@/components/Icons'
import { Snowfall } from '@/components/Snowfall'
import { useProviderRegistry } from '@/hooks/useProviderRegistry'
import { useSelectionSync } from '@/hooks/useSelectionStore'
import { useShortcuts } from '@/hooks/useShortcuts'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { stayDatesLabel } from '../lib/stay'
import { SearchStayBar } from '../ui/SearchStayBar'
import { PATHS } from '../router'
import { MobileTabBar } from './MobileTabBar'
import { TopNav } from './TopNav'

export function AppShell(): JSX.Element {
  const { state, patch, narrow } = useApp()
  const derived = useDerived()
  const { pathname } = useLocation()
  const { fmtStay } = useFormat()
  const { t } = useI18n()
  const [stayOpen, setStayOpen] = useState(false)
  useShortcuts()
  useProviderRegistry()
  useSelectionSync()

  useEffect(() => {
    if (state.selectedId != null && derived.filtered.some((d) => d.id === state.selectedId)) return
    const first = derived.filtered[0]
    if (first) patch({ selectedId: first.id })
  }, [derived.filtered, state.selectedId, patch])

  useEffect(() => {
    document.querySelector('.rc-main')?.scrollTo({ top: 0 })
    setStayOpen(false)
  }, [pathname])

  const home = pathname === PATHS.home
  const utility = /^\/(favoris|suivi|reglages)/.test(pathname)

  return (
    <div className="rc" data-testid="app-shell">
      <SvgDefs />
      <TopNav />
      {!home && !utility && (
        <div className="rc-staybar" data-testid="stay-bar-persistent">
          {narrow && !stayOpen ? (
            <button type="button" className="rc-staypill" data-testid="stay-bar-summary" onClick={() => setStayOpen(true)}>
              <span className="rc-staypill__txt">
                {derived.lodgDomain?.name ?? (state.domainQuery || '—')} · {stayDatesLabel(state, fmtStay, (n) => t('dp_nights').replace('{n}', String(n)), t('rc_sb_dates_any'))} · {state.travelers}
              </span>
              <span className="rc-staypill__edit">{t('rc_stay_edit')}</span>
            </button>
          ) : (
            <SearchStayBar compact />
          )}
        </div>
      )}
      <main className="rc-main" key={pathname}>
        <Outlet />
      </main>
      <MobileTabBar />
      {state.snowfall && !home && <Snowfall />}
      {state.peopleOpen && <PeopleDrawer />}
      {state.onboard && <Onboarding />}
    </div>
  )
}
