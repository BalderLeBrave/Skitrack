import { CloseIcon, TrendIcon } from '@/components/Icons'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import type { PriceHistoryStore, TrackedItem } from '@/state/appState'

/**
 * Forme de la courbe simulée, en multiples du prix actuel.
 *
 * Elle n'est là que pour montrer **qu'une courbe existera** : elle descend, elle
 * hésite, elle finit sur le prix réel du jour. Aucune valeur intermédiaire n'est
 * une mesure, et c'est pour cela qu'elle se dessine en pointillés partout où
 * elle apparaît.
 */
const SIMULATED_SHAPE = [1.14, 1.1, 1.055, 1.085, 1.04, 1.0]

/** Deux points suffisent à tracer une vraie courbe ; un seul n'est pas une courbe. */
const MIN_REAL_POINTS = 2

interface Series {
  values: number[]
  /** Vrai quand les points viennent des relevés horaires enregistrés. */
  real: boolean
}

/**
 * Série d'un logement suivi.
 *
 * Une seule fonction pour la ligne-carte et pour le détail : deux calculs
 * séparés finiraient par dessiner deux courbes différentes du même prix, et la
 * distinction réel / simulé — la seule chose que cet écran doit garantir —
 * dépendrait de l'endroit où on la lit.
 */
function seriesOf(item: TrackedItem, history: PriceHistoryStore): Series {
  const stored = (history[item.key] ?? []).map((p) => p.v)
  if (stored.length >= MIN_REAL_POINTS) return { values: stored, real: true }
  return { values: SIMULATED_SHAPE.map((k) => Math.round((item.total * k) / 10) * 10), real: false }
}

/** Chemin d'une sparkline, dans un repère de `w` sur `h`. */
function sparkPath(values: number[], w: number, h: number): string {
  if (values.length === 0) return ''
  const min = Math.min(...values)
  const span = Math.max(Math.max(...values) - min, 1)
  return values
    .map((v, i) => {
      const x = 1 + (i * (w - 2)) / Math.max(values.length - 1, 1)
      const y = 1 + (1 - (v - min) / span) * (h - 2)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

/**
 * Suivi de prix.
 *
 * Les relevés horaires sont enregistrés localement dès qu'un logement est
 * suivi. Tant qu'il n'y a pas assez de points, la courbe affichée est une
 * simulation clairement annoncée comme telle : montrer une ligne plate
 * laisserait croire que le prix ne bouge pas, ce qui est une information
 * fausse plutôt qu'une information absente.
 */
export function TrackingPage(): JSX.Element {
  const { eur, fmt } = useFormat()
  const { t } = useI18n()
  const { state, patch, history } = useApp()

  const selected = state.tracked[state.trackedSel]
  const { values, real } = selected ? seriesOf(selected, history) : { values: [], real: false }

  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  const span = Math.max(max - min, 1)
  const points = values
    .map((v, i) => {
      const x = 12 + i * (616 / Math.max(values.length - 1, 1))
      const y = 18 + (1 - (v - min) / span) * 114
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const delta = values.length >= 2 ? values[values.length - 1] - values[values.length - 2] : 0

  const alertSummary =
    (state.alertMode === 'pct'
      ? `Baisse d’au moins ${state.alertPct} %`
      : `Baisse d’au moins ${fmt(state.alertEur)} €`) +
    (state.quietHours ? ` · ${t('tracking_quiet_hours_short')}` : '') +
    (state.digest ? ` · ${t('digest_short')}` : '')

  return (
    <div className="page">
      <div className="page__inner" style={{ maxWidth: 1100 }}>
        <header className="page-head" style={{ marginBottom: 18 }}>
          <h2>Suivi de prix</h2>
          <span className="u-muted" style={{ fontSize: 13 }}>
            {t('tracking_sub')}
          </span>
        </header>

        {state.tracked.length === 0 && (
          <div className="panel panel--empty">
            <TrendIcon />
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t('tracking_empty')}</p>
            <p className="u-muted" style={{ margin: 0, fontSize: 14, maxWidth: '44ch' }}>
              Depuis une carte logement ou sa fiche, cliquez « Suivre le prix » : l’historique et les alertes de baisse
              apparaîtront ici.
            </p>
            <button
              type="button"
              className="btn btn--primary btn--round"
              style={{ marginTop: 6 }}
              onClick={() => patch({ tab: 'recherche' })}
            >
              Chercher un domaine
            </button>
          </div>
        )}

        <div className="panel" style={{ padding: '18px 20px', margin: '18px 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Alertes</h3>
            <span className="u-muted" style={{ fontSize: 12 }}>
              {alertSummary}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(260px,100%),1fr))', gap: 18 }}>
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>{t('alert_threshold')}</p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <button
                  type="button"
                  className={`chip${state.alertMode === 'pct' ? ' chip--on' : ''}`}
                  onClick={() => patch({ alertMode: 'pct' })}
                >
                  En pourcentage
                </button>
                <button
                  type="button"
                  className={`chip${state.alertMode === 'eur' ? ' chip--on' : ''}`}
                  onClick={() => patch({ alertMode: 'eur' })}
                >
                  En euros
                </button>
              </div>

              {state.alertMode === 'pct' ? (
                <>
                  <label className="field-label">
                    Baisse minimum<strong>{state.alertPct} %</strong>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={25}
                    step={1}
                    value={state.alertPct}
                    onChange={(e) => patch({ alertPct: +e.target.value })}
                  />
                </>
              ) : (
                <>
                  <label className="field-label">
                    Baisse minimum<strong>{eur(state.alertEur)}</strong>
                  </label>
                  <input
                    type="range"
                    min={25}
                    max={800}
                    step={25}
                    value={state.alertEur}
                    onChange={(e) => patch({ alertEur: +e.target.value })}
                  />
                  <p className="filters__help filters__help--tight">
                    Un seuil en euros évite les fausses alertes sur les petits séjours et les alertes manquées sur les
                    gros.
                  </p>
                </>
              )}
            </div>

            <div>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>Quand notifier</p>
              <label className="check" style={{ margin: '0 0 10px', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={state.quietHours}
                  onChange={(e) => patch({ quietHours: e.target.checked })}
                />
                {t('tracking_quiet_hours')}
              </label>
              <label className="check" style={{ margin: 0, gap: 10 }}>
                <input type="checkbox" checked={state.digest} onChange={(e) => patch({ digest: e.target.checked })} />
                {t('digest_option')}
              </label>
              <p className="filters__help filters__help--tight">
                {t('tracking_note')}
              </p>
            </div>
          </div>
        </div>

        {state.tracked.length > 0 && selected && (
          <div className="tracking__grid">
            {/* Lignes-cartes : logement, prix actuel, plus bas / plus haut,
                tendance, courbe. Tout ce qui départage deux suivis se lit sur une
                ligne, et le clic ouvre le détail à droite — le même geste
                qu'avant. */}
            <div className="trackrows">
              {state.tracked.map((item, i) => {
                const s = seriesOf(item, history)
                const last = s.values[s.values.length - 1] ?? item.total
                const prev = s.values[s.values.length - 2] ?? last
                const step = last - prev
                const lo = s.values.length ? Math.min(...s.values) : item.total
                const hi = s.values.length ? Math.max(...s.values) : item.total
                return (
                  <article
                    key={item.key}
                    className={`trackrow${i === state.trackedSel ? ' trackrow--on' : ''}`}
                    onClick={() => patch({ trackedSel: i })}
                  >
                    <div className="trackrow__main">
                      <strong className="trackrow__name">{item.name}</strong>
                      <span className="trackrow__sub">
                        {item.domain} · {item.src}
                      </span>
                    </div>

                    <div className="trackrow__price">
                      <strong className="u-num">{eur(last)}</strong>
                      <span className="trackrow__sub u-num">
                        {fmt(lo)} – {fmt(hi)} €
                      </span>
                    </div>

                    {/* ▾ en baisse, → stable, ▴ en hausse : le signe et la
                        couleur disent la même chose, pour que la couleur ne soit
                        pas le seul porteur de l'information. */}
                    <span
                      className="trackrow__trend"
                      style={{ color: step < 0 ? 'var(--ok)' : step > 0 ? 'var(--warn)' : 'var(--muted)' }}
                    >
                      {step < 0 ? '▾' : step > 0 ? '▴' : '→'} {step === 0 ? '' : `${fmt(Math.abs(step))} €`}
                    </span>

                    <svg
                      className="trackrow__spark"
                      viewBox="0 0 96 30"
                      preserveAspectRatio="none"
                      role="img"
                      aria-label={s.real ? t('track_real_curve') : t('track_simulated_curve')}
                    >
                      <path
                        d={sparkPath(s.values, 96, 30)}
                        fill="none"
                        stroke={s.real ? 'var(--accent)' : 'var(--dim)'}
                        strokeWidth="2"
                        strokeDasharray={s.real ? undefined : '4 5'}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>

                    {/* La mention de simulation suit la courbe partout où elle
                        est dessinée : une ligne en pointillés sans légende
                        redevient une mesure aux yeux de qui la lit vite. */}
                    {!s.real && <span className="trackrow__sim">{t('track_simulated_short')}</span>}

                    <button
                      type="button"
                      className="iconbtn iconbtn--bare trackrow__close"
                      title="Ne plus suivre"
                      aria-label="Ne plus suivre"
                      onClick={(e) => {
                        e.stopPropagation()
                        patch({ tracked: state.tracked.filter((_, j) => j !== i), trackedSel: 0 })
                      }}
                    >
                      <CloseIcon />
                    </button>
                  </article>
                )
              })}
            </div>

            <div className="panel" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 16, flex: 1, minWidth: 0 }}>{selected.name}</h3>
                <span className="u-muted" style={{ fontSize: 12 }}>
                  {selected.src} · {selected.domain}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '10px 0 4px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {eur(values[values.length - 1])}
                </span>
                <span
                  style={{ color: delta <= 0 ? 'var(--ok)' : 'var(--warn)', fontWeight: 600, fontSize: 13 }}
                >
                  {delta <= 0 ? '▼ ' : '▲ +'}
                  {fmt(Math.abs(delta))} € depuis le dernier relevé
                </span>
                <span className="u-spacer" />
                <span className="u-muted" style={{ fontSize: 12 }}>
                  plus bas {fmt(min)} € · plus haut {fmt(max)} €
                </span>
              </div>

              <svg
                width="100%"
                height="150"
                viewBox="0 0 640 150"
                preserveAspectRatio="none"
                role="img"
                aria-label="Historique de prix"
              >
                <line x1="0" y1="40" x2="640" y2="40" stroke="var(--border-soft)" strokeWidth="1" />
                <line x1="0" y1="90" x2="640" y2="90" stroke="var(--border-soft)" strokeWidth="1" />
                {/* Même règle que sur les lignes : trait plein bleu pour des
                    relevés, pointillés gris pour une simulation. */}
                <polyline
                  points={points}
                  fill="none"
                  stroke={real ? 'var(--accent)' : 'var(--dim)'}
                  strokeWidth="2.5"
                  strokeDasharray={real ? undefined : '5 6'}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>

              <div
                className="u-muted"
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 6 }}
              >
                <span>{real ? t('track_first_reading') : t('track_six_weeks')}</span>
                <span>{t('today_lower')}</span>
              </div>
              <p className="u-muted" style={{ margin: '8px 0 0', fontSize: 11 }}>
                {real
                  ? `Historique réel — un relevé par heure, conservé localement (${values.length} points).`
                  : 'Courbe simulée en attendant les premiers relevés horaires — chaque relevé réel s’enregistre localement.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
