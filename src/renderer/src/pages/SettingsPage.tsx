import { useEffect, useState } from 'react'
import type { AppInfo, SecretKey, SecretPresence } from '@shared/ipc-contract'
import { ExternalIcon } from '@/components/Icons'
import { api, isClientReady } from '@/api/client'
import type { ProviderStatus, ReferentialStatus } from '@/api/types'
import { exportReferential } from '@/data/referentiel'
import { CRITERIA } from '@/domain/scoring'
import { useFormat } from '@/hooks/useFormat'
import { routesCoverage } from '@/domain/travel'
import { useJob } from '@/hooks/useJob'
import { useSidecar } from '@/hooks/useSidecar'
import { LANGUAGES, LANGUAGE_LABELS, useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { AppState, ProvState } from '@/state/appState'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { LegalSection } from './LegalSection'

const KEY_LABELS: Record<SecretKey, { label: string; help: string; url?: string }> = {
  openrouteservice: {
    label: 'OpenRouteService',
    help: 'Itinéraires voiture et isochrones. Gratuit après inscription (≈2 000 trajets/jour).',
    url: 'https://openrouteservice.org/dev/#/signup'
  },
  google_maps: {
    label: 'Google Routes API',
    help: 'Alternative payante, seule à gérer l’évitement des péages sur un calcul en masse.',
    url: 'https://developers.google.com/maps/documentation/routes'
  },
  liteapi_key: {
    label: 'LiteAPI (Nuitee Connect)',
    help:
      'Prix et disponibilités réels, inscription libre et immédiate — aucune validation partenaire. ' +
      'Une clé « sand_ » interroge le bac à sable, à l’inventaire réduit ; une clé « prod_ » donne la couverture réelle.',
    url: 'https://dashboard.liteapi.travel/register'
  },
  expedia_rapid_key: {
    label: 'Expedia Rapid — API key',
    help: 'Nécessite un compte partenaire Expedia Group validé. Connecteur prévu en phase 3.',
    url: 'https://developers.expediagroup.com/docs/products/rapid'
  },
  expedia_rapid_secret: {
    label: 'Expedia Rapid — shared secret',
    help: 'Fourni avec la clé Rapid.'
  },
  booking_demand: {
    label: 'Booking.com Demand API',
    help: 'Validation partenaire Booking obligatoire. Connecteur prévu en phase 4.',
    url: 'https://developers.booking.com/'
  },
  meteofrance: {
    label: 'Météo-France',
    help: 'Bulletins neige et risque d’avalanche (BRA). Optionnel.',
    url: 'https://portail-api.meteofrance.fr/'
  },
  scrape_proxy: {
    label: 'Proxy résidentiel (relevés web)',
    help:
      'Optionnel. Format http://user:pass@hote:port, plusieurs séparés par des virgules. ' +
      'Sert aux relevés des sites qui n’exposent pas d’API.'
  },
  scrape_proxy_mobile: {
    label: 'Proxy mobile 4G/5G (relevés web)',
    help:
      'Optionnel, essayé avant le résidentiel. Même format. Les IP opérateur passent ' +
      'généralement mieux les contrôles anti-robot.'
  }
}

/** Sources telles que documentées dans PROVIDERS.md, affichées quand le moteur
 *  local ne répond pas et ne peut donc pas donner leur état réel. */
const STATIC_SOURCES: { kind: string; label: string; reason: string | null }[] = [
  { kind: 'referential', label: 'OpenSkiMap', reason: null },
  { kind: 'geocoding', label: 'Base Adresse Nationale', reason: null },
  { kind: 'elevation', label: 'IGN Géoplateforme — RGE ALTI', reason: 'France, précision métrique.' },
  { kind: 'elevation', label: 'OpenTopoData (EU-DEM)', reason: 'Reste de l’Europe.' },
  { kind: 'routing', label: 'OpenRouteService', reason: null },
  { kind: 'weather', label: 'Open-Meteo', reason: null },
  {
    kind: 'lodging',
    label: 'LiteAPI (Nuitee Connect)',
    reason: 'Prix et disponibilités en direct — clé en libre service, REST ou MCP.'
  },
  { kind: 'lodging', label: 'Expedia Rapid', reason: 'API partenaire — prix et disponibilités en direct.' },
  {
    kind: 'scraping',
    label: 'Booking.com',
    reason: 'API partenaire — validation de compte requise.'
  },
  { kind: 'lodging', label: 'Airbnb', reason: 'Aucune API publique — import d’annonce par URL uniquement.' },
  {
    kind: 'lodging',
    label: 'Gîtes de France',
    reason: 'Recherche pré-remplie et import d’annonce par URL.'
  },
]

const SHORTCUTS: [string, string][] = [
  ['Parcourir les domaines', '↑ ↓'],
  ['Ouvrir les logements', 'Entrée'],
  ['Afficher / masquer les filtres', 'F'],
  ['Afficher / masquer la carte', 'M'],
  ['Fermer fiche / comparateur', 'Échap']
]

/**
 * Les quatre états qu'une provenance corrigée peut prendre.
 *
 * « Saisi à la main » n'est pas la même chose que « relevé » : la correction
 * doit dire d'où vient sa propre valeur, sinon elle remplace une donnée
 * traçable par une affirmation anonyme — exactement ce que cet écran existe
 * pour empêcher.
 */
const PROV_STATES: [ProvState, TranslationKey, string][] = [
  ['manual', 'prov_manual', 'var(--brand)'],
  ['measured', 'prov_measured', 'var(--ok)'],
  ['estimated', 'prov_estimated', 'var(--warn)'],
  ['missing', 'prov_missing', 'var(--warn)']
]

/** Les quatre volets de l'Administration, dans l'ordre où on les ouvre. */
const ADMIN_SUBTABS: [AppState['admSub'], TranslationKey][] = [
  ['engine', 'settings_engine'],
  ['sources', 'settings_sources'],
  ['routes', 'settings_routing'],
  ['keys', 'settings_keys']
]

export function SettingsPage(): JSX.Element {
  const { fmt } = useFormat()
  const { state, patch, ref, refOrigin, domains, domainSource, domainWarning } = useApp()
  const { origins } = useDerived()
  const { t, lang, setLang } = useI18n()
  const { state: sidecar, restart } = useSidecar()

  /**
   * Enregistre une correction de provenance.
   *
   * Un texte vide **supprime** la surcharge au lieu d'en enregistrer une vide :
   * une correction sans contenu ne corrige rien, et laissée en base elle ferait
   * afficher une ligne d'annotation muette sous la ligne calculée.
   */
  const saveProvEdit = (key: string): void => {
    const src = state.provDraftSrc.trim()
    const next = { ...state.provEdits }
    if (src) next[key] = { src, state: state.provDraftState }
    else delete next[key]
    patch({ provEdits: next, provEditKey: null })
  }

  const clearProvEdit = (key: string): void => {
    const next = { ...state.provEdits }
    delete next[key]
    patch({ provEdits: next, provEditKey: null })
  }

  const [secrets, setSecrets] = useState<SecretPresence[]>([])
  const [drafts, setDrafts] = useState<Partial<Record<SecretKey, string>>>({})
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null)
  const [metrics, setMetrics] = useState<
    {
      provider: string
      calls: number
      errors: number
      avgMs?: number
      priceRate?: number | null
      lastError: string | null
      lastAt: string | null
    }[] | null
  >(null)
  /** État des connecteurs de logement. `null` tant qu'il n'a pas répondu. */
  const [lodgingHealth, setLodgingHealth] = useState<
    { name: string; reachable: boolean; detail: string }[] | null
  >(null)
  const [dbStatus, setDbStatus] = useState<ReferentialStatus | null>(null)
  const [routingProvider, setRoutingProvider] = useState('openrouteservice')
  const [error, setError] = useState<string | null>(null)
  const [importJobId, setImportJobId] = useState<string | null>(null)
  const { job: importJob, error: importError } = useJob(importJobId)

  useEffect(() => {
    void window.skitrack.secrets.list().then(setSecrets)
    void window.skitrack.appInfo().then(setAppInfo)
  }, [])

  /**
   * État des connecteurs de logement.
   *
   * Ils vivent dans le processus principal, pas dans le sidecar : ils
   * répondent même quand celui-ci est arrêté, d'où un effet séparé de celui
   * qui interroge le moteur local.
   *
   * Relu à chaque changement de `secrets` — poser une clé LiteAPI doit faire
   * passer la ligne au vert sans redémarrage. L'effet ne repose pas `secrets`
   * lui-même : le faire ici rendrait la dépendance cyclique.
   */
  useEffect(() => {
    void window.skitrack.providers
      .health()
      .then(setLodgingHealth)
      .catch(() => setLodgingHealth(null))
  }, [secrets])

  // Le moteur local peut être absent : chaque appel dégrade proprement plutôt
  // que de faire tomber l'écran de réglages.
  useEffect(() => {
    if (sidecar.status !== 'ready' || !isClientReady()) return
    void api.providers().then(setProviders).catch(() => setProviders(null))
    void window.skitrack.providers.metrics().then(setMetrics).catch(() => setMetrics(null))
    void api.status().then(setDbStatus).catch(() => setDbStatus(null))
    void api
      .settings()
      .then((s) => setRoutingProvider(String(s.settings.routing_provider ?? 'openrouteservice')))
      .catch(() => undefined)
  }, [sidecar.status])

  const saveKey = async (key: SecretKey): Promise<void> => {
    setError(null)
    try {
      setSecrets(await window.skitrack.secrets.set(key, drafts[key] ?? ''))
      setDrafts((prev) => ({ ...prev, [key]: '' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const coverage = routesCoverage(origins, domains, state.routes)
  const tab = (name: typeof state.settingsTab): string =>
    `chip${state.settingsTab === name ? ' chip--on' : ''}`

  /**
   * Sommaire de l'onglet ouvert.
   *
   * Il liste les sections **réellement rendues**, sous-onglet d'Administration
   * compris : un sommaire qui annonce des sections absentes de l'écran est pire
   * que pas de sommaire. Il ne remplace pas les onglets — ceux-ci restent de
   * l'état (`settingsTab`, `admSub`) — il navigue à l'intérieur de l'onglet
   * courant.
   */
  const toc: { id: string; label: string }[] =
    state.settingsTab === 'app'
      ? [
          { id: 'set-appearance', label: t('appearance') },
          { id: 'set-weights', label: 'Poids du classement' },
          { id: 'set-shortcuts', label: 'Raccourcis clavier' },
          { id: 'set-density', label: t('density') },
          { id: 'set-language', label: t('settings_language') }
        ]
      : state.settingsTab === 'admin'
        ? [
            { id: 'set-adminsub', label: t('settings_admin') },
            ...(state.admSub === 'engine'
              ? [
                  { id: 'set-engine', label: 'Moteur local' },
                  { id: 'set-about', label: t('settings_about') }
                ]
              : []),
            ...(state.admSub === 'sources'
              ? [
                  { id: 'set-provenance', label: t('settings_provenance') },
                  { id: 'set-sources', label: t('settings_sources') },
                  { id: 'set-lodgsources', label: t('settings_lodging_sources') }
                ]
              : []),
            ...(state.admSub === 'routes' ? [{ id: 'set-routes', label: t('settings_routing') }] : []),
            ...(state.admSub === 'keys' ? [{ id: 'set-keys', label: t('settings_keys') }] : [])
          ]
        : []

  /** Défilement interne : pas de `href="#id"`, qui écrirait un fragment dans
   *  l'URL du renderer sans qu'aucune route ne le lise. */
  const goTo = (id: string): void => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const relevés = new Set(
    Object.keys(ref.forfaits).map((id) => ref.domaines.find((d) => String(d.id) === id)?.name).filter(Boolean)
  ).size

  const provenance: { label: string; src: string; ok: boolean; tag: string }[] = [
    {
      label: 'Domaines et altitudes',
      src:
        domainSource === 'moteur'
          ? `OpenSkiMap / OpenStreetMap — base du moteur local, ${domains.length} domaines`
          : `${ref.sources?.domaines?.nom ?? 'OpenSkiMap / OpenStreetMap'} — ${refOrigin}, ${domains.length} domaines`,
      ok: domainSource === 'moteur',
      tag: domainSource === 'moteur' ? 'relevé' : 'fichier livré'
    },
    {
      label: 'Forfaits',
      src: `sites officiels — ${relevés} domaine(s) relevés, les autres estimés d’après les kilomètres de pistes et l’altitude`,
      ok: false,
      tag: 'partiel'
    },
    {
      label: 'Neige au sol',
      src: 'Open-Meteo — hauteur de neige au bas des pistes et au point culminant, interpolée sur l’altitude',
      ok: true,
      tag: 'relevé'
    },
    {
      label: 'Météo 7 jours',
      src: 'Open-Meteo — température, chutes et vent au point culminant, relevé toutes les 3 h',
      ok: true,
      tag: 'relevé'
    },
    {
      label: 'Risque d’avalanche',
      src: 'indice dérivé des chutes annoncées et du vent — le BRA officiel Météo-France demande une clé',
      ok: false,
      tag: 'estimé'
    },
    {
      label: 'Logements',
      src: 'catalogue de biens types — les connecteurs partenaires attendent une validation de compte',
      ok: false,
      tag: 'simulé'
    },
    {
      label: 'Temps de trajet',
      src: coverage.done
        ? `OSRM — ${coverage.done} itinéraire(s) sur ${coverage.total}`
        : 'estimation à vol d’oiseau corrigée d’un facteur de sinuosité routière',
      ok: coverage.done === coverage.total && coverage.total > 0,
      tag: coverage.done === coverage.total && coverage.total > 0 ? 'calculé' : 'partiel'
    },
    {
      label: 'Cours de ski',
      src: 'barème horaire indexé sur le prix du forfait, modifiable par station',
      ok: false,
      tag: 'estimé'
    },
    {
      label: 'Carburant et péages',
      src: '0,115 €/km et 0,058 €/km, aller-retour par foyer',
      ok: false,
      tag: 'forfaitaire'
    }
  ]

  return (
    <div className="page">
      <div className="page__inner settings" style={{ maxWidth: 1120 }}>
        {/* Trois onglets seulement : ce qu'on règle en usage, ce qu'on règle à
            l'installation, et les mentions. « Sources » et « Moteur » n'étaient
            pas des réglages du même ordre que le thème ou la langue — ils
            descendent d'un cran, sous Administration. */}
        <nav className="settings__tabs">
          <button type="button" className={tab('app')} onClick={() => patch({ settingsTab: 'app' })}>
            {t('settings_app')}
          </button>
          <button type="button" className={tab('admin')} onClick={() => patch({ settingsTab: 'admin' })}>
            {t('settings_admin')}
          </button>
          <button type="button" className={tab('legal')} onClick={() => patch({ settingsTab: 'legal' })}>
            {t('settings_legal')}
          </button>
        </nav>

        {/* Gabarit deux colonnes par onglet : sommaire des sections réelles à
            gauche, réglages en cartes à droite. */}
        <div className={`settings__cols${toc.length === 0 ? ' settings__cols--bare' : ''}`}>
          {toc.length > 0 && (
            <nav className="settings__toc" aria-label={t('nav_settings')}>
              {toc.map((item) => (
                <button key={item.id} type="button" className="settings__tocitem" onClick={() => goTo(item.id)}>
                  {item.label}
                </button>
              ))}
            </nav>
          )}

          <div className="settings__main">
        {state.settingsTab === 'app' && (
          <>
            <section id="set-appearance" className="panel panel--flat settings__section">
              <h2>{t('appearance')}</h2>
              <p className="settings__help">{t('theme_follows')}</p>
              {/* Une ligne par réglage : le libellé à gauche, le contrôle à
                  droite. Deux réglages d'apparence, deux lignes. */}
              <div className="setrow">
                <span className="setrow__label">{t('theme_toggle')}</span>
                <span className="setrow__ctl">
                  <button
                    type="button"
                    className={`chip${state.theme !== 'dark' ? ' chip--on' : ''}`}
                    onClick={() => patch({ theme: 'light' })}
                  >
                    {t('theme_light')}
                  </button>
                  <button
                    type="button"
                    className={`chip${state.theme === 'dark' ? ' chip--on' : ''}`}
                    onClick={() => patch({ theme: 'dark' })}
                  >
                    {t('theme_dark')}
                  </button>
                </span>
              </div>

              {/* Le seul réglage purement décoratif de l'application : il ne
                  change rien à ce qui est affiché, seulement à ce qui bouge. */}
              <div className="setrow">
                <span className="setrow__label" id="set-snowfall-label">
                  {t('settings_snowfall')}
                </span>
                <span className="setrow__ctl">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={state.snowfall}
                    aria-labelledby="set-snowfall-label"
                    className="toggle"
                    onClick={() => patch({ snowfall: !state.snowfall })}
                  >
                    <span className={`toggle__track${state.snowfall ? ' toggle__track--on' : ''}`}>
                      <span className="toggle__knob" />
                    </span>
                  </button>
                </span>
              </div>
            </section>

            <section id="set-weights" className="panel panel--flat settings__section">
              <h2>Poids du classement</h2>
              <p className="settings__help">
                Ajustez l’importance de chaque critère. Les poids sont renormalisés : mettre un critère à 0 l’exclut du
                score.
              </p>
              <div style={{ display: 'grid', gap: 14 }}>
                {CRITERIA.map((c) => {
                  const w = state.weights[c.key] ?? c.weight
                  return (
                    <div key={c.key}>
                      <label className="field-label">
                        {c.label}
                        <strong className="u-nowrap">{Math.round(w * 100)} %</strong>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={50}
                        step={5}
                        value={Math.round(w * 100)}
                        onChange={(e) => patch({ weights: { ...state.weights, [c.key]: +e.target.value / 100 } })}
                      />
                    </div>
                  )
                })}
              </div>
              <button type="button" className="btn" style={{ marginTop: 14 }} onClick={() => patch({ weights: {} })}>
                {t('settings_weights_reset')}
              </button>
            </section>

            <section id="set-shortcuts" className="panel panel--flat settings__section">
              <h2>Raccourcis clavier</h2>
              <dl className="shortcuts">
                {SHORTCUTS.map(([label, key]) => (
                  <div key={key}>
                    <dt className="u-muted">{label}</dt>
                    <dd style={{ fontWeight: 600 }}>{key}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {/* Densité et Langue étaient deux titres dans une seule carte : le
                sommaire ne pouvait en désigner qu'un. Deux réglages, deux
                cartes, deux entrées. */}
            <section id="set-density" className="panel panel--flat settings__section">
              <h2>{t('density')}</h2>
              <p className="settings__help">
                La densité compacte réduit les marges des cartes de domaines : utile sur une fenêtre 1 280 × 720 ou pour
                comparer beaucoup de résultats d’un coup d’œil.
              </p>
              <div className="setrow">
                <span className="setrow__label">{t('density')}</span>
                <span className="setrow__ctl">
                  <button
                    type="button"
                    className={`chip${state.density === 'comfortable' ? ' chip--on' : ''}`}
                    onClick={() => patch({ density: 'comfortable' })}
                  >
                    {t('density_comfortable')}
                  </button>
                  <button
                    type="button"
                    className={`chip${state.density === 'compact' ? ' chip--on' : ''}`}
                    onClick={() => patch({ density: 'compact' })}
                  >
                    {t('density_compact')}
                  </button>
                </span>
              </div>
            </section>

            <section id="set-language" className="panel panel--flat settings__section">
              <h2>{t('settings_language')}</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {LANGUAGES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    className={`chip${lang === code ? ' chip--on' : ''}`}
                    onClick={() => setLang(code)}
                  >
                    {LANGUAGE_LABELS[code]}
                  </button>
                ))}
              </div>
              <p className="settings__help" style={{ marginTop: 8 }}>
                {t('lang_note')}
              </p>
            </section>

          </>
        )}

        {state.settingsTab === 'admin' && (
          <>
            <section id="set-adminsub" className="panel panel--flat settings__section">
              <h2>{t('settings_admin')}</h2>
              <p className="settings__help">{t('settings_admin_intro')}</p>
              <nav className="settings__tabs settings__tabs--sub">
                {ADMIN_SUBTABS.map(([key, labelKey]) => (
                  <button
                    key={key}
                    type="button"
                    className={`chip${state.admSub === key ? ' chip--on' : ''}`}
                    style={{ fontSize: 12 }}
                    onClick={() => patch({ admSub: key })}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </nav>
            </section>

            {state.admSub === 'routes' && (
              <section id="set-routes" className="panel panel--flat settings__section">
                <h2>{t('settings_routing')}</h2>
                <select
                  className="field"
                  value={routingProvider}
                  disabled={sidecar.status !== 'ready'}
                  onChange={(e) => {
                    const next = e.target.value
                    setRoutingProvider(next)
                    void api.patchSettings({ routing_provider: next }).catch(() => undefined)
                  }}
                >
                  <option value="openrouteservice">{t('routing_ors')}</option>
                  <option value="osrm">{t('routing_osrm')}</option>
                  <option value="google">Google Routes API (payant)</option>
                </select>
                {sidecar.status !== 'ready' && (
                  <p className="settings__help">
                    {t('settings_engine_only')}
                  </p>
                )}
              </section>
            )}

            {state.admSub === 'keys' && (
            <section id="set-keys" className="panel panel--flat settings__section">
              <h2>{t('settings_keys')}</h2>
              <p className="settings__help">{t('settings_keys_help')}</p>
              {appInfo && !appInfo.encryptionAvailable && (
                <p className="notice notice--warn">{t('settings_encryption_unavailable')}</p>
              )}
              {error && <p className="notice notice--warn">{error}</p>}

              <ul className="keys">
                {secrets.map(({ key, present }) => {
                  const meta = KEY_LABELS[key]
                  return (
                    <li key={key} className="keys__row">
                      <div>
                        <strong className="u-nowrap">{meta.label}</strong>
                        <span className={`pill${present ? ' pill--ok' : ''}`}>
                          {present ? t('settings_key_set') : t('settings_key_unset')}
                        </span>
                        <p className="settings__help">{meta.help}</p>
                        {meta.url && (
                          <button
                            type="button"
                            className="linkbtn"
                            onClick={() => void window.skitrack.openExternal(meta.url!)}
                          >
                            Documentation
                            <ExternalIcon />
                          </button>
                        )}
                      </div>
                      <div className="keys__actions">
                        <input
                          type="password"
                          className="field"
                          placeholder="••••••••"
                          value={drafts[key] ?? ''}
                          disabled={appInfo?.encryptionAvailable === false}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="btn btn--primary btn--small"
                          disabled={!drafts[key]}
                          onClick={() => void saveKey(key)}
                        >
                          {t('settings_save')}
                        </button>
                        {present && (
                          <button
                            type="button"
                            className="linkbtn"
                            onClick={() => void window.skitrack.secrets.remove(key).then(setSecrets)}
                          >
                            {t('settings_delete')}
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
            )}

            {state.admSub === 'sources' && (
          <>
            <section id="set-provenance" className="panel panel--flat settings__section">
              <h2>{t('settings_provenance')}</h2>
              {domainWarning && <p className="notice notice--warn">{domainWarning}</p>}
              <p className="settings__help">
                D’où vient chaque chiffre affiché dans l’application, et à quelle date il a été établi. Les postes
                marqués comme estimés ou simulés ne sont pas relevés à la source : ils sont dérivés d’autres données et
                doivent être vérifiés avant de servir à une décision.
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {provenance.map((p) => {
                  const edit = state.provEdits[p.label]
                  const editing = state.provEditKey === p.label
                  const stateMeta = edit ? PROV_STATES.find(([key]) => key === edit.state) : null
                  return (
                    <div key={p.label} className="provrow provrow--stack">
                      <div className="provrow__main">
                        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{p.label}</span>
                        <span className="u-muted" style={{ fontSize: 12, minWidth: 0 }}>
                          {p.src}
                        </span>
                        <span
                          className="u-nowrap"
                          style={{ fontSize: 11, fontWeight: 700, color: p.ok ? 'var(--ok)' : 'var(--warn)' }}
                        >
                          {p.tag}
                        </span>
                        <button
                          type="button"
                          className="linkbtn linkbtn--sm u-nowrap"
                          onClick={() =>
                            patch({
                              provEditKey: editing ? null : p.label,
                              provDraftSrc: edit?.src ?? '',
                              provDraftState: edit?.state ?? 'manual'
                            })
                          }
                        >
                          {edit ? t('prov_modify') : t('prov_correct')}
                        </button>
                      </div>

                      {/* La correction se superpose, elle ne remplace pas : la
                          ligne calculée reste au-dessus, et celle-ci s'annonce
                          avec l'état que l'utilisateur lui a donné. */}
                      {edit && !editing && (
                        <p className="provrow__edit">
                          <span
                            className="u-nowrap"
                            style={{ fontWeight: 700, color: stateMeta?.[2] ?? 'var(--brand)' }}
                          >
                            {stateMeta ? t(stateMeta[1]) : ''}
                          </span>{' '}
                          — {edit.src}
                        </p>
                      )}

                      {editing && (
                        <div className="provrow__form">
                          <textarea
                            className="field"
                            rows={3}
                            value={state.provDraftSrc}
                            aria-label={t('prov_correct')}
                            onChange={(e) => patch({ provDraftSrc: e.target.value })}
                          />
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {PROV_STATES.map(([key, labelKey]) => (
                              <button
                                key={key}
                                type="button"
                                className={`chip${state.provDraftState === key ? ' chip--on' : ''}`}
                                style={{ fontSize: 12 }}
                                onClick={() => patch({ provDraftState: key })}
                              >
                                {t(labelKey)}
                              </button>
                            ))}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                            <button
                              type="button"
                              className="btn btn--primary btn--small"
                              onClick={() => saveProvEdit(p.label)}
                            >
                              {t('settings_save')}
                            </button>
                            <button
                              type="button"
                              className="linkbtn"
                              onClick={() => patch({ provEditKey: null })}
                            >
                              {t('cancel')}
                            </button>
                            {edit && (
                              <button
                                type="button"
                                className="linkbtn"
                                onClick={() => clearProvEdit(p.label)}
                              >
                                {t('prov_restore')}
                              </button>
                            )}
                          </div>
                          <p className="settings__help">{t('prov_empty_note')}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="provrow">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t('settings_file_loaded')}</span>
                  <span className="u-muted" style={{ fontSize: 12, minWidth: 0 }}>
                    {ref.domaines.length} domaine(s), {Object.keys(ref.forfaits).length} grille(s) de forfaits ·{' '}
                    {refOrigin}
                  </span>
                  <button type="button" className="linkbtn linkbtn--sm u-nowrap" onClick={() => exportReferential(ref)}>
                    exporter
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                <button type="button" className="btn" onClick={() => patch({ tab: 'import-referentiel' })}>
                  {t('referential_manage')}
                </button>
              </div>
              <p
                className="settings__help"
                style={{ color: coverage.done ? 'var(--muted)' : 'var(--warn)' }}
              >
                {coverage.done === 0
                  ? 'Aucun itinéraire calculé : les durées affichées sont des estimations'
                  : coverage.done >= coverage.total
                    ? `Les ${coverage.total} itinéraires sont calculés`
                    : `${coverage.done} itinéraire(s) sur ${coverage.total} calculés — les autres restent estimés`}
              </p>
            </section>

            <section id="set-sources" className="panel panel--flat settings__section">
              <h2>{t('settings_sources')}</h2>
              <table className="table">
                <tbody>
                  {providers
                    ? providers.map((p) => (
                        <tr key={`${p.kind}:${p.name}`}>
                          <td style={{ width: 110 }}>
                            <span className={`pill${p.configured ? ' pill--ok' : ''}`}>{p.kind}</span>
                          </td>
                          <td>
                            <strong>{p.label}</strong>
                            {p.reason && <p className="settings__help">{p.reason}</p>}
                          </td>
                          <td style={{ width: 40 }}>
                            {p.docs_url && (
                              <button
                                type="button"
                                className="linkbtn"
                                aria-label="Ouvrir dans le navigateur"
                                onClick={() => void window.skitrack.openExternal(p.docs_url!)}
                              >
                                <ExternalIcon />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    : STATIC_SOURCES.map((s) => (
                        <tr key={`${s.kind}:${s.label}`}>
                          <td style={{ width: 110 }}>
                            <span className="pill">{s.kind}</span>
                          </td>
                          <td>
                            <strong>{s.label}</strong>
                            {s.reason && <p className="settings__help">{s.reason}</p>}
                          </td>
                          <td style={{ width: 40 }} />
                        </tr>
                      ))}
                </tbody>
              </table>
              <p className="settings__help">
                © contributeurs OpenStreetMap · OpenSkiMap.org — Open Database License (ODbL) 1.0
              </p>
            </section>

            {/* Connecteurs de logement du processus principal — Booking,
                Expedia, Gîtes de France, LiteAPI, scrapers Playwright. Distincts
                des sources du sidecar juste au-dessus, qui couvrent itinéraires,
                altimétrie et météo. Leur diagnostic dit ce qui manque, clé
                comprise, et où l'obtenir. */}
            <section id="set-lodgsources" className="panel panel--flat settings__section">
              <h2>{t('settings_lodging_sources')}</h2>
              {lodgingHealth === null ? (
                <p className="settings__help">{t('settings_lodging_sources_none')}</p>
              ) : (
                <table className="table">
                  <tbody>
                    {lodgingHealth.map((p) => (
                      <tr key={p.name}>
                        <td style={{ width: 110 }}>
                          <span className={`pill${p.reachable ? ' pill--ok' : ''}`}>
                            {p.reachable ? t('settings_src_ready') : t('settings_src_blocked')}
                          </span>
                        </td>
                        <td>
                          <strong>{p.name}</strong>
                          <p className="settings__help">{p.detail}</p>
                        </td>
                        <td style={{ width: 40 }} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="settings__help">{t('settings_lodging_sources_help')}</p>

            <section id="set-metrics" className="panel panel--flat settings__section">
              <h2>{t('metrics_title')}</h2>
              <p className="settings__help">{t('metrics_help')}</p>
              {metrics && metrics.length > 0 ? (
                <div className="settings__metrics">
                  <table className="settings__table">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Appels</th>
                        <th>Latence</th>
                        <th>Prix</th>
                        <th>Erreurs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((m) => (
                        <tr key={m.provider}>
                          <td>{m.provider}</td>
                          <td>{m.calls}</td>
                          <td>{m.avgMs != null ? `${m.avgMs} ms` : '—'}</td>
                          <td>{m.priceRate != null ? `${m.priceRate} %` : '—'}</td>
                          <td style={{ color: m.errors ? 'var(--warn)' : undefined }}>
                            {m.errors}
                            {m.lastError ? ` · ${m.lastError.slice(0, 60)}` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    type="button"
                    className="btn"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      void window.skitrack.providers.metricsReset().then(() => setMetrics([]))
                    }}
                  >
                    {t('metrics_reset')}
                  </button>
                </div>
              ) : (
                <p className="settings__help">{t('metrics_none')}</p>
              )}
            </section>

            </section>
          </>
            )}

            {state.admSub === 'engine' && (
          <>
            <section id="set-engine" className="panel panel--flat settings__section">
              <h2>Moteur local</h2>
              <p className="settings__help">
                Le moteur tourne sur votre machine : il héberge la base des domaines importée depuis OpenSkiMap et
                exécute les calculs d’itinéraires et d’altimétrie. Rien ne transite par un serveur SKITRACK.
              </p>

              <div className="enginebar">
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    flex: '0 0 auto',
                    background: sidecar.status === 'ready' ? 'var(--ok)' : 'var(--warn)'
                  }}
                />
                <strong style={{ fontSize: 15 }}>
                  {sidecar.status === 'ready' ? 'Prêt' : sidecar.status === 'starting' ? 'Démarrage…' : 'Arrêté'}
                </strong>
                <span className="u-muted" style={{ fontSize: 13 }}>
                  {sidecar.status === 'ready'
                    ? `version ${sidecar.version} · aucune erreur`
                    : sidecar.status === 'error'
                      ? sidecar.message
                      : ''}
                </span>
                <span className="u-spacer" />
                <button type="button" className="btn btn--small" onClick={restart}>
                  {t('engine_restart')}
                </button>
              </div>

              {/* Import OpenSkiMap : la base SQLite du moteur alimente
                  l'altimétrie et les itinéraires réels. Elle est indépendante
                  du référentiel JSON embarqué, qui porte les forfaits. */}
              <div className="enginebar" style={{ marginTop: 12 }}>
                <span style={{ fontSize: 13, flex: 1, minWidth: 0 }}>
                  {t('engine_ref_openskimap')}
                  <span className="u-muted" style={{ display: 'block', fontSize: 11 }}>
                    {importJob
                      ? `${importJob.state} · ${importJob.message || `${Math.round(importJob.progress * 100)} %`}`
                      : 'domaines et remontées, ~130 Mo au premier import'}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn--small"
                  disabled={sidecar.status !== 'ready' || importJob?.state === 'running' || importJob?.state === 'pending'}
                  onClick={() => {
                    void api
                      .importReferential({ countries: ['FR'], with_lifts: true, detect_glaciers: true })
                      .then((job) => setImportJobId(job.id))
                      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                  }}
                >
                  {t('engine_update')}
                </button>
              </div>
              {importError && <p className="notice notice--warn">{importError}</p>}

              <dl className="enginedl">
                <div>
                  <dt>Adresse</dt>
                  <dd className="u-num">{sidecar.status === 'ready' ? sidecar.baseUrl : '—'}</dd>
                </div>
                <div>
                  <dt>Processus</dt>
                  <dd className="u-num">{sidecar.status === 'ready' ? `pid ${sidecar.pid}` : '—'}</dd>
                </div>
                <div>
                  <dt>{t('settings_database')}</dt>
                  <dd className="u-num">
                    {dbStatus
                      ? `${fmt(dbStatus.domains_total)} domaines · ${fmt(dbStatus.domains_with_altitude)} avec altitude`
                      : 'non interrogée'}
                  </dd>
                </div>
                <div>
                  <dt>{t('settings_ref_embedded')}</dt>
                  <dd>
                    {ref.domaines.length} domaine(s) · {refOrigin}
                  </dd>
                </div>
                <div>
                  <dt>{t('settings_data_path')}</dt>
                  <dd style={{ fontSize: 13, wordBreak: 'break-all' }}>{appInfo?.userDataPath ?? '—'}</dd>
                </div>
              </dl>
            </section>

            <section id="set-about" className="panel panel--flat settings__section">
              <h2>{t('settings_about')}</h2>
              <dl className="enginedl">
                <div>
                  <dt>SKITRACK</dt>
                  <dd>{appInfo?.version ?? '—'}</dd>
                </div>
                <div>
                  <dt>Electron / Chrome / Node</dt>
                  <dd>
                    {appInfo ? `${appInfo.electron} / ${appInfo.chrome} / ${appInfo.node}` : '—'}
                  </dd>
                </div>
              </dl>
            </section>
          </>
            )}
          </>
        )}

        {state.settingsTab === 'legal' && <LegalSection />}
          </div>
        </div>
      </div>
    </div>
  )
}
