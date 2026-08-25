/**
 * Réglages — ce qu'un utilisateur règle vraiment.
 *
 * L'écran portait un onglet Administration et ses quatre volets : sources de
 * données, provenance, moteur local, métriques des connecteurs, itinéraires,
 * clés d'API. Autant de réglages qu'il fallait comprendre pour ne pas casser
 * l'application, offerts à quelqu'un qui cherche une semaine au ski.
 *
 * Ils ont quitté l'interface, pas le programme : la logique est intacte et les
 * valeurs sont déclarées dans `config/app-config.ts`, les clés dans le
 * stockage chiffré. Voir `docs/config.md`.
 *
 * **Une exception, délibérée.** Le bouton « Relancer le moteur » reste, réduit
 * à une ligne d'état. Il était le seul de toute l'application une fois celle-ci
 * ouverte : l'écran d'amorçage en propose un, mais qui a choisi « continuer
 * sans le moteur » ne le revoit plus. Le retirer aurait supprimé la seule voie
 * de retour, ce qui n'est pas de la simplification.
 */

import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/ipc-contract'
import { useSidecar } from '@/hooks/useSidecar'
import { LANGUAGES, LANGUAGE_LABELS, useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useUserData } from '@/state/userData'
import { LegalSection } from './LegalSection'


const SHORTCUTS: [string, string][] = [
  ['Parcourir les domaines', '↑ ↓'],
  ['Ouvrir les logements', 'Entrée'],
  ['Afficher / masquer les filtres', 'F'],
  ['Afficher / masquer la carte', 'M'],
  ['Fermer fiche / comparateur', 'Échap']
]

export function SettingsPage(): JSX.Element {
  const { state, patch } = useApp()
  const { setOnboarded } = useUserData()
  const { t, lang, setLang } = useI18n()
  const { state: sidecar, restart } = useSidecar()

  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    void window.skitrack.appInfo().then(setAppInfo)
  }, [])

  const tab = (name: typeof state.settingsTab): string =>
    `chip${state.settingsTab === name ? ' chip--on' : ''}`

  /**
   * Sommaire de l'onglet ouvert.
   *
   * Il liste les sections **réellement rendues** : un sommaire qui annonce des
   * sections absentes de l'écran est pire que pas de sommaire.
   */
  const toc: { id: string; label: string }[] =
    state.settingsTab === 'app'
      ? [
          { id: 'set-appearance', label: t('appearance') },
          { id: 'set-shortcuts', label: 'Raccourcis clavier' },
          { id: 'set-density', label: t('density') },
          { id: 'set-language', label: t('settings_language') },
          { id: 'set-engine', label: t('settings_engine') },
          { id: 'set-about', label: t('settings_about') }
        ]
      : []

  /** Défilement interne : pas de `href="#id"`, qui écrirait un fragment dans
   *  l'URL du renderer sans qu'aucune route ne le lise. */
  const goTo = (id: string): void => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="page">
      <div className="page__inner settings" style={{ maxWidth: 1120 }}>
        {/* Deux onglets : ce qu'on règle en usage, et les mentions.
            Administration en faisait un troisième, qui rangeait sous un même
            titre les sources de données, les métriques des connecteurs et les
            clés d'API — rien qu'un utilisateur ait à décider. */}
        <nav className="settings__tabs">
          <button type="button" className={tab('app')} onClick={() => patch({ settingsTab: 'app' })}>
            {t('settings_app')}
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

              {/* Rejouer le parcours d'accueil. Il pré-remplit des filtres et
                  n'efface rien : le proposer ici évite d'avoir à purger ses
                  données pour le revoir, ce qui était le seul moyen avant que
                  le drapeau ne quitte les préférences. */}
              <div className="setrow">
                <span className="setrow__label" id="set-onboard-label">
                  {t('onb_replay')}
                  <span className="u-muted" style={{ display: 'block', fontSize: 11, fontWeight: 400 }}>
                    {t('onb_replay_help')}
                  </span>
                </span>
                <span className="setrow__ctl">
                  <button
                    type="button"
                    className="btn btn--small"
                    aria-labelledby="set-onboard-label"
                    onClick={() => {
                      void setOnboarded(false)
                      patch({ onboard: true })
                    }}
                  >
                    {t('onb_replay')}
                  </button>
                </span>
              </div>
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


            {/* Réduit à ce qu'on peut faire : voir si le moteur tourne, et le
                relancer. Les chemins de données, les versions de la base et les
                métriques ne servaient qu'au diagnostic — ils sont partis avec
                l'onglet Administration. Ce bouton reste parce qu'il est le seul
                de l'application une fois celle-ci ouverte. */}
            <section id="set-engine" className="panel panel--flat settings__section">
              <h2>{t('settings_engine')}</h2>
              <div className="setrow">
                <span className="setrow__label">
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      marginRight: 8,
                      background: sidecar.status === 'ready' ? 'var(--ok)' : 'var(--warn)'
                    }}
                  />
                  {sidecar.status === 'ready' ? t('engine_ready') : t('engine_stopped')}
                </span>
                <span className="setrow__ctl">
                  <button type="button" className="btn btn--small" onClick={restart}>
                    {t('engine_restart')}
                  </button>
                </span>
              </div>
              {sidecar.status !== 'ready' && <p className="settings__help">{t('engine_stopped_help')}</p>}
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

        {state.settingsTab === 'legal' && <LegalSection />}
          </div>
        </div>
      </div>
    </div>
  )
}
