import { useEffect, useMemo, useState } from 'react'
import { I18nContext, LANGUAGES, LANGUAGE_LABELS, isLanguage, type Language, useI18n } from '@/i18n'
import { useSidecar } from '@/hooks/useSidecar'
import { useShortcuts } from '@/hooks/useShortcuts'
import { useProviderRegistry } from '@/hooks/useProviderRegistry'
import { useSelectionSync } from '@/hooks/useSelectionStore'
import { AppProvider, useApp } from '@/state/appState'
import { DerivedProvider, useDerived } from '@/state/selectors'
import { WeatherProvider } from '@/state/weather'
import { SvgDefs } from '@/components/Icons'
import { BrandLogo } from '@/components/BrandLogo'
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
import { SelectionPage } from '@/pages/SelectionPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TrackingPage } from '@/pages/TrackingPage'

/** Sélecteur de langue de la barre supérieure : français et anglais. */
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
      {/* Les deux libellés suivent les jetons de la barre : l'actif en encre
          pleine, l'autre atténué. Depuis que la barre est blanche, ces jetons
          sont ceux du contenu — plus rien n'est forcé en blanc ici. */}
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

/**
 * Barre supérieure.
 *
 * Trois onglets primaires seulement — Accueil, Rechercher, Logements — parce
 * que ce sont les trois seuls endroits où l'on *cherche* quelque chose. Offres,
 * Combinaisons et Décision sont trois vues d'une même comparaison déjà en
 * cours : elles vivent dans un groupe segmenté, qui dit qu'on change d'angle et
 * pas de tâche. Les utilitaires restent à droite.
 *
 * L'onglet Logements ne disparaît plus quand aucun domaine n'est ouvert : un
 * onglet qui va et vient force à retenir *quand* il apparaît. Il reste visible
 * et renvoie vers Rechercher, ce qui est aussi la marche à suivre.
 */
function Nav(): JSX.Element {
  const { state, patch, screen, narrow } = useApp()
  const { t } = useI18n()
  const tab = (on: boolean): string => `tab${on ? ' tab--on' : ''}${narrow ? ' tab--narrow' : ''}`
  const tab2 = (on: boolean): string => `tab2${on ? ' tab2--on' : ''}`
  const seg = (on: boolean): string => `navseg__btn${on ? ' navseg__btn--on' : ''}`

  /** Sans domaine ouvert, l'onglet Logements n'a rien à montrer : il renvoie
   *  vers l'écran qui permet d'en ouvrir un. */
  const openLodgings = (): void => {
    patch({ tab: state.lodgingDomainId != null ? 'logements' : 'recherche' })
  }

  return (
    <nav className="nav">
      <div className="nav__side">
        <BrandLogo />
      </div>

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
        <button
          type="button"
          className={tab(screen === 'logements')}
          title={state.lodgingDomainId == null ? t('nav_lodgings_need_domain') : undefined}
          onClick={openLodgings}
        >
          {t('nav_lodgings')}
        </button>

        {/* Groupe segmenté : trois lectures d'une même comparaison. */}
        <div className="navseg" role="group" aria-label={t('nav_seg_label')}>
          <button
            type="button"
            className={seg(screen === 'offres')}
            aria-current={screen === 'offres' ? 'page' : undefined}
            onClick={() => patch({ tab: 'offres' })}
          >
            {t('nav_offers')}
          </button>
          <button
            type="button"
            className={seg(screen === 'combinaisons')}
            aria-current={screen === 'combinaisons' ? 'page' : undefined}
            onClick={() => patch({ tab: 'combinaisons' })}
          >
            {t('nav_combos')}
          </button>
          <button
            type="button"
            className={seg(screen === 'decision')}
            aria-current={screen === 'decision' ? 'page' : undefined}
            onClick={() => patch({ tab: 'decision' })}
          >
            {t('nav_decision')}
          </button>
        </div>
      </div>

      <div className="nav__side nav__side--right">
        {/* Favoris : les domaines retenus, adossés à `selDomains`. Le compte
            ne s'affiche que s'il y en a — « Favoris · 0 » n'apprend rien. */}
        <button
          type="button"
          className={tab2(screen === 'selection')}
          onClick={() => patch({ tab: 'selection' })}
        >
          {t('nav_favorites')}
          {state.selDomains.length > 0 ? ` · ${state.selDomains.length}` : ''}
        </button>
        <button type="button" className={tab2(screen === 'suivi')} onClick={() => patch({ tab: 'suivi' })}>
          {t('nav_tracking')}
          {state.tracked.length > 0 ? ` · ${state.tracked.length}` : ''}
        </button>
        {/* Réglages reste dans la barre bien que le prototype l'en retire :
            c'est le seul chemin vers l'écran, et le retirer le rendrait
            inatteignable. */}
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
      </div>
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
    case 'selection':
      return <SelectionPage />
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
  const { state, patch, screen, reloadDomains } = useApp()
  const derived = useDerived()
  const { state: sidecar, log, restart } = useSidecar()
  const [engineSkipped, setEngineSkipped] = useState(false)
  useShortcuts()
  // Les sources de logement viennent du registre du moteur, pas d'une liste
  // écrite ici. Lu au montage de la coque : l'accueil compte les sources
  // avant même qu'on ouvre l'écran Logements.
  useProviderRegistry()
  // Notes et votes viennent de `selection.db`, pas des préférences.
  useSelectionSync()

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
          d'amorçage, elle décorerait un message d'erreur.

          Pas sur l'Accueil non plus : le héros y a sa propre chute, sur toile
          (`Flocons`). Les deux ensemble faisaient tomber deux neiges de
          densités différentes sur la même image. Les écrans-outils gardent
          celle-ci, en DOM et légère, et l'un comme l'autre obéissent au même
          réglage `snowfall`. */}
      {state.snowfall && screen !== 'accueil' && <Snowfall />}
      {state.peopleOpen && <PeopleDrawer />}
      {state.domFicheId != null && <DomainSheet />}
      {state.onboard && <Onboarding />}
    </div>
  )
}

/** Passerelle i18n : la langue vit dans l'état applicatif, comme le thème. */
function I18nBridge({ children }: { children: React.ReactNode }): JSX.Element {
  const { state, patch } = useApp()
  // Une préférence enregistrée peut nommer une langue retirée du catalogue :
  // on retombe sur le français plutôt que d'afficher des clés.
  const value = useMemo(
    () => ({
      lang: isLanguage(state.lang) ? state.lang : 'fr',
      setLang: (l: Language) => patch({ lang: l })
    }),
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
