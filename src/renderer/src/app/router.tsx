/**
 * Routeur de la recomposition. Cinq routes produit + trois utilitaires.
 *
 * Le store reste la source de vérité du séjour ; l'URL n'est que la position
 * dans le parcours. `RouteStoreSync` tient les deux d'accord dans les deux
 * sens, parce que des hooks gelés (`useShortcuts`) écrivent encore
 * `state.tab` pour naviguer.
 */

import { useEffect } from 'react'
import { HashRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useI18n } from '@/i18n'
import type { Screen } from '@/state/appState'
import { useApp } from '@/state/appState'
import { AppShell } from './shell/AppShell'
import { EmptyHonest } from './ui/EmptyHonest'
import { CompareScreen } from './screens/CompareScreen'
import { HomeScreen } from './screens/HomeScreen'
import { LodgingsScreen } from './screens/LodgingsScreen'
import { ReservationScreen } from './screens/ReservationScreen'
import { StationScreen } from './screens/StationScreen'
import { ReferentialPage } from '@/pages/ReferentialPage'
import { SelectionPage } from '@/pages/SelectionPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TrackingPage } from '@/pages/TrackingPage'

export const PATHS = {
  home: '/',
  compare: '/comparer',
  station: (id: number | string) => `/stations/${id}`,
  lodgings: '/logements',
  reservation: (id: number | string) => `/reservation/${id}`,
  favorites: '/favoris',
  tracking: '/suivi',
  settings: '/reglages',
  referential: '/reglages/referentiel'
} as const

export function tabOfPath(pathname: string): Screen {
  if (pathname.startsWith(PATHS.referential)) return 'import-referentiel'
  const seg = `/${pathname.split('/')[1] ?? ''}`
  switch (seg) {
    case '/':
      return 'accueil'
    case '/comparer':
    case '/stations':
      return 'recherche'
    case '/logements':
    case '/reservation':
      return 'logements'
    case '/favoris':
      return 'selection'
    case '/suivi':
      return 'suivi'
    case '/reglages':
      return 'reglages'
    default:
      return 'accueil'
  }
}

export function pathOfTab(tab: Screen): string {
  switch (tab) {
    case 'recherche':
      return PATHS.compare
    case 'logements':
      return PATHS.lodgings
    case 'selection':
      return PATHS.favorites
    case 'suivi':
      return PATHS.tracking
    case 'reglages':
      return PATHS.settings
    case 'import-referentiel':
      return PATHS.referential
    default:
      return PATHS.home
  }
}

/** Sens unique : l'URL écrit `state.tab` (lu par les sélecteurs gelés), jamais l'inverse. */
function RouteStoreSync(): null {
  const { state, patch } = useApp()
  const { pathname } = useLocation()
  const tab = tabOfPath(pathname)

  useEffect(() => {
    if (state.tab !== tab) patch({ tab })
  }, [tab, state.tab, patch])

  return null
}

function LodgingsGuard(): JSX.Element {
  const { state } = useApp()
  const { t } = useI18n()
  if (state.lodgingDomainId == null) {
    return (
      <div className="rc-page rc-page--guard">
        <EmptyHonest testid="lodgings-no-station" title={t('rc_nav_lodgings_locked')} hint={t('rc_cmp_empty_hint')}>
          <Link to={PATHS.compare} className="rc-link" data-testid="lodgings-go-compare">← {t('rc_cmp_title')}</Link>
        </EmptyHonest>
      </div>
    )
  }
  return <LodgingsScreen />
}

export function AppRouter(): JSX.Element {
  return (
    <HashRouter>
      <RouteStoreSync />
      <Routes>
        <Route element={<AppShell />}>
          <Route path={PATHS.home} element={<HomeScreen />} />
          <Route path={PATHS.compare} element={<CompareScreen />} />
          <Route path="/stations/:id" element={<StationScreen />} />
          <Route path={PATHS.lodgings} element={<LodgingsGuard />} />
          <Route path="/reservation/:id" element={<ReservationScreen />} />
          <Route path={PATHS.favorites} element={<SelectionPage />} />
          <Route path={PATHS.tracking} element={<TrackingPage />} />
          <Route path={PATHS.settings} element={<SettingsPage />} />
          <Route path={PATHS.referential} element={<ReferentialPage />} />
          <Route path="*" element={<Navigate to={PATHS.home} replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
