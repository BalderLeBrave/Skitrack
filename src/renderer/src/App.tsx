import { useEffect, useMemo, useState } from 'react'
import { I18nContext, LANGUAGES, LANGUAGE_LABELS, type Language, useI18n } from '@/i18n'
import { useSidecar } from '@/hooks/useSidecar'
import { useShortcuts } from '@/hooks/useShortcuts'
import { AppProvider, useApp } from '@/state/appState'
import { DerivedProvider, useDerived } from '@/state/selectors'
import { WeatherProvider } from '@/state/weather'
import { LogoIcon, SvgDefs } from '@/components/Icons'
import { DomainSheet } from '@/components/DomainSheet'
import { Onboarding } from '@/components/Onboarding'
import { PeopleDrawer } from '@/components/PeopleDrawer'
import { Snowfall } from '@/components/Snowfall'
import { CombosPage } from '@/pages/CombosPage'
import { DecisionPage } from '@/pages/DecisionPage'
import { DomainSearchPage } from '@/pages/DomainSearchPage'
import { HomePage } from '@/pages/HomePage'
import { LodgingsPage } from '@/pages/LodgingsPage'
import { OffersPage } from '@/pages/OffersPage'
import { ReferentialPage } from '@/pages/ReferentialPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TrackingPage } from '@/pages/TrackingPage'

/** Sélecteur de langue de la barre supérieure : sept langues, une ligne. */
function LangSelect(): JSX.Element {
  const { t, lang, setLang } = useI18n()
  return (
    <select
      className="nav__lang"
      value={lang}
      aria-label={t('settings_language')}
      title={t('settings_language')}
      onChange={(e) => setLang(e.target.value as Language)}
    >
      {LANGUAGES.map((code) => (
        <option key={code} value={code}>
          {LANGUAGE_LABELS[code]}
        </option>
      ))}
    </select>
  )
}

function ThemeSwitch(): JSX.Element {
  const { state, patch, narrow } = useApp()
  const { t } = useI18n()
  const dark = state.theme === 'dark'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      title={t('theme_toggle')}
      className="themeswitch"
      onClick={() => patch({ theme: dark ? 'light' : 'dark' })}
    >
      {/* Sur la barre encre, le libellé actif se lit en blanc plein et l'autre
          en blanc atténué : les jetons de texte du contenu clair y seraient
          invisibles. */}
      {!narrow && (
        <span className="themeswitch__label" style={{ color: dark ? 'var(--nav-muted)' : 'var(--nav-fg)' }}>
          {t('theme_light')}
        </span>
      )}
      <span className={`themeswitch__track${dark ? ' themeswitch__track--on' : ''}`}>
        <span className="themeswitch__knob" />
      </span>
      {!narrow && (
        <span className="themeswitch__label" style={{ color: dark ? 'var(--nav-fg)' : 'var(--nav-muted)' }}>
          {t('theme_dark')}
        </span>
      )}
    </button>
  )
}

function Nav(): JSX.Element {
  const { state, patch, screen, narrow } = useApp()
  const { t } = useI18n()
  const tab = (on: boolean): string => `tab${on ? ' tab--on' : ''}${narrow ? ' tab--narrow' : ''}`
  const tab2 = (on: boolean): string => `tab2${on ? ' tab2--on' : ''}`

  return (
    <nav className="nav">
      <span className="nav__brand">
        <LogoIcon />
        SKITRACK
      </span>

      <div className="nav__tabs">
        <button type="button" className={tab(screen === 'accueil')} onClick={() => patch({ tab: 'accueil' })}>
          {t('nav_home')}
        </button>
        <button
          type="button"
          className={tab(screen === 'recherche' || screen === 'import-referentiel')}
          onClick={() => patch({ tab: 'recherche' })}
        >
          {t('nav_search')}
        </button>
        <button type="button" className={tab(screen === 'offres')} onClick={() => patch({ tab: 'offres' })}>
          {t('nav_offers')}
        </button>
        <button type="button" className={tab(screen === 'combinaisons')} onClick={() => patch({ tab: 'combinaisons' })}>
          {t('nav_combos')}
        </button>
        <button type="button" className={tab(screen === 'decision')} onClick={() => patch({ tab: 'decision' })}>
          {t('nav_decision')}
        </button>
        {/* L'onglet Logements n'apparaît qu'une fois un domaine ouvert : sans
            domaine il n'aurait rien à montrer. */}
        {state.lodgingDomainId != null && (
          <button type="button" className={tab(screen === 'logements')} onClick={() => patch({ tab: 'logements' })}>
            {t('nav_lodgings')}
          </button>
        )}
      </div>

      <span className="nav__spacer" />

      <button type="button" className={tab2(screen === 'suivi')} onClick={() => patch({ tab: 'suivi' })}>
        {t('nav_tracking')}
        {state.tracked.length > 0 ? ` · ${state.tracked.length}` : ''}
      </button>
      <button type="button" className={tab2(screen === 'reglages')} onClick={() => patch({ tab: 'reglages' })}>
        {t('nav_settings')}
      </button>
      <LangSelect />
      <button
        type="button"
        className={`tab2 tab-people ${state.peopleOpen ? 'tab2--accent' : 'tab2--on'}`}
        onClick={() => patch({ peopleOpen: true })}
      >
        {t('nav_travelers')} · {state.people.length}
      </button>
      <ThemeSwitch />
    </nav>
  )
}

function Screens(): JSX.Element {
  const { screen } = useApp()
  switch (screen) {
    case 'accueil':
      return <HomePage />
    case 'import-referentiel':
      return <ReferentialPage />
    case 'offres':
      return <OffersPage />
    case 'combinaisons':
      return <CombosPage />
    case 'decision':
      return <DecisionPage />
    case 'logements':
      return <LodgingsPage />
    case 'suivi':
      return <TrackingPage />
    case 'reglages':
      return <SettingsPage />
    default:
      return <DomainSearchPage />
  }
}

/** Écran d'amorçage : réservé aux problèmes de démarrage du moteur local. */
function Boot({
  message,
  hint,
  isError,
  log,
  onRetry,
  onSkip
}: {
  message: string
  hint?: string
  isError: boolean
  log: string[]
  onRetry: () => void
  onSkip: () => void
}): JSX.Element {
  return (
    <div className="boot">
      <div className="boot__panel">
        <h1>SKITRACK</h1>
        <h2>{isError ? 'Le moteur local ne démarre pas' : 'Démarrage du moteur local…'}</h2>
        <p className="boot__msg">{message}</p>
        {hint && <p className="boot__msg">{hint}</p>}
        {isError && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn btn--primary" onClick={onRetry}>
              Réessayer
            </button>
            {/* Le référentiel des domaines est embarqué : la recherche, les
                offres et le comparateur fonctionnent sans le moteur. Bloquer
                l'accès à tout l'écran pour un sidecar absent coûterait plus
                qu'il ne protège. */}
            <button type="button" className="btn" onClick={onSkip}>
              Continuer sans le moteur
            </button>
          </div>
        )}
        {log.length > 0 && (
          <details className="boot__log">
            <summary style={{ cursor: 'pointer', fontSize: 13 }}>Journal</summary>
            <pre>{log.slice(-40).join('\n')}</pre>
          </details>
        )}
      </div>
    </div>
  )
}

function Shell(): JSX.Element {
  const { state, patch, reloadDomains } = useApp()
  const derived = useDerived()
  const { state: sidecar, log, restart } = useSidecar()
  const [engineSkipped, setEngineSkipped] = useState(false)
  useShortcuts()

  // La liste des domaines est chargée une première fois depuis le fichier
  // livré ; dès que le moteur répond, elle est remplacée par sa base complète.
  useEffect(() => {
    if (sidecar.status === 'ready') reloadDomains()
  }, [sidecar.status, reloadDomains])

  // Le domaine sélectionné change quand la liste filtrée change : on garde une
  // sélection valide plutôt que d'afficher une fiche vide.
  useEffect(() => {
    if (state.selectedId != null && derived.filtered.some((d) => d.id === state.selectedId)) return
    const first = derived.filtered[0]
    if (first) patch({ selectedId: first.id })
  }, [derived.filtered, state.selectedId, patch])

  if (sidecar.status === 'starting') {
    return (
      <Boot
        message="Lecture des domaines, des forfaits et des tarifs."
        isError={false}
        log={log}
        onRetry={restart}
        onSkip={() => setEngineSkipped(true)}
      />
    )
  }

  if (!engineSkipped && sidecar.status !== 'ready') {
    return (
      <Boot
        message={
          sidecar.status === 'error'
            ? sidecar.message
            : 'Le moteur local est arrêté. Les temps de trajet calculés et les clés d’API ne sont pas disponibles.'
        }
        hint={sidecar.status === 'error' ? sidecar.hint : undefined}
        isError
        log={log}
        onRetry={restart}
        onSkip={() => setEngineSkipped(true)}
      />
    )
  }

  return (
    <div className="app">
      <SvgDefs />
      <Nav />
      <main className="main">
        <Screens />
      </main>
      {/* La neige n'apparaît qu'une fois l'application ouverte : sur l'écran
          d'amorçage, elle décorerait un message d'erreur. */}
      {state.snowfall && <Snowfall />}
      {state.peopleOpen && <PeopleDrawer />}
      {state.domFicheId != null && <DomainSheet />}
      {state.onboard && <Onboarding />}
    </div>
  )
}

/** Passerelle i18n : la langue vit dans l'état applicatif, comme le thème. */
function I18nBridge({ children }: { children: React.ReactNode }): JSX.Element {
  const { state, patch } = useApp()
  const value = useMemo(
    () => ({ lang: state.lang as Language, setLang: (l: Language) => patch({ lang: l }) }),
    [state.lang, patch]
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function App(): JSX.Element {
  return (
    <AppProvider>
      <DerivedProvider>
        <WeatherProvider>
          <I18nBridge>
            <Shell />
          </I18nBridge>
        </WeatherProvider>
      </DerivedProvider>
    </AppProvider>
  )
}
