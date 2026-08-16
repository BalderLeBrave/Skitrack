import { CloseIcon, TrendIcon } from '@/components/Icons'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'

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
  const stored = selected ? (history[selected.key] ?? []).map((p) => p.v) : []
  const real = stored.length >= 2
  const values = selected
    ? real
      ? stored
      : [1.14, 1.1, 1.055, 1.085, 1.04, 1.0].map((k) => Math.round((selected.total * k) / 10) * 10)
    : []

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
    (state.quietHours ? ' · pas de notification entre 22 h et 8 h' : '') +
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
                Ne pas notifier entre 22 h et 8 h
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
            <div style={{ display: 'grid', gap: 12 }}>
              {state.tracked.map((t, i) => (
                <article
                  key={t.key}
                  className={`panel trackcard${i === state.trackedSel ? ' trackcard--on' : ''}`}
                  onClick={() => patch({ trackedSel: i })}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <strong style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{t.name}</strong>
                    <button
                      type="button"
                      className="iconbtn iconbtn--bare"
                      title="Ne plus suivre"
                      aria-label="Ne plus suivre"
                      onClick={(e) => {
                        e.stopPropagation()
                        patch({ tracked: state.tracked.filter((_, j) => j !== i), trackedSel: 0 })
                      }}
                    >
                      <CloseIcon />
                    </button>
                  </div>
                  <p className="u-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                    {t.domain} · {t.src}
                  </p>
                  <p
                    style={{
                      margin: '8px 0 0',
                      fontSize: 16,
                      fontWeight: 800,
                      letterSpacing: '-0.02em',
                      color: 'var(--accent)'
                    }}
                  >
                    {eur(t.total)}
                  </p>
                </article>
              ))}
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
                <polyline
                  points={points}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.5"
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
