import { useI18n } from '@/i18n'
import {
  alpineClassicTotal,
  extraPisteTotal,
  formatPisteKm,
  PISTE_BUCKETS,
  PISTE_EXTRA,
  PISTE_HEX_DARK,
  PISTE_HEX_LIGHT,
  scaleKmToAnnounced,
  type DomainSlopes,
  type PisteBucket,
  type PisteMixMode
} from '@/data/pistes'
import { useApp } from '@/state/appState'

const INITIALS: Record<PisteBucket, string> = { green: 'V', blue: 'B', red: 'R', black: 'N', other: 'A' }
const OSM_URL = 'https://openskimap.org/'

export function PisteMixBar({
  slopes,
  announcedKm,
  mode = 'count',
  compact = false,
  onMode,
  table = false
}: {
  slopes: DomainSlopes
  announcedKm?: number
  mode?: PisteMixMode
  compact?: boolean
  onMode?: (m: PisteMixMode) => void
  table?: boolean
}): JSX.Element {
  const { t, locale } = useI18n()
  const { state } = useApp()
  const dark = state.theme === 'dark'
  const hex = dark ? PISTE_HEX_DARK : PISTE_HEX_LIGHT
  const counts = slopes.slopes_count_by_color
  const classic = alpineClassicTotal(counts)
  const extra = extraPisteTotal(counts)
  const empty = slopes.slopes_quality === 'empty' || (classic <= 0 && extra <= 0)
  const split = scaleKmToAnnounced(slopes, announcedKm)
  const kmFmt = (n: number): string => formatPisteKm(n, locale)

  if (empty) {
    return (
      <div className={`rc-pistemix${compact ? ' rc-pistemix--compact' : ''} rc-pistemix--empty`} data-testid="piste-mix-empty">
        <div className="rc-pistemix__bar" aria-hidden />
        <p className="rc-pistemix__empty">
          {t('piste_unmapped')}{' '}
          <a href={OSM_URL} target="_blank" rel="noreferrer">
            {t('piste_osm_link')}
          </a>
        </p>
      </div>
    )
  }

  const countOf = (b: PisteBucket): number => (b === 'other' ? extra : (counts[b] ?? 0))
  const values = PISTE_BUCKETS.map((color) => {
    const count = countOf(color)
    const km = split[color]
    const weight = mode === 'count' ? count : km
    return { color, count, km, weight }
  })
  const denom = values.reduce((n, v) => n + v.weight, 0) || 1
  const totalCount = slopes.slopes_count_total || classic + extra
  const badge =
    slopes.slopes_quality === 'curated'
      ? t('piste_badge_curated')
      : slopes.slopes_quality === 'partial'
        ? t('piste_badge_partial')
        : t('piste_badge_osm')
  const badgeTitle =
    split.basis === 'brochure_scaled'
      ? t('piste_km_scaled_hint')
          .replace('{announced}', kmFmt(split.total))
          .replace('{osm}', kmFmt(split.osmKm))
      : slopes.slopes_quality === 'curated' && slopes.slopes_osm_total != null
        ? t('piste_osm_tooltip').replace('{n}', String(slopes.slopes_osm_total))
        : t('piste_osm_attr')

  const totalLabel =
    mode === 'km' && split.total > 0
      ? `${kmFmt(split.total)} km`
      : mode === 'pct' && split.total > 0
        ? '100 %'
        : `${totalCount} ${t('piste_runs')}`

  return (
    <div className={`rc-pistemix${compact ? ' rc-pistemix--compact' : ''}`} data-testid="piste-mix">
      <div
        className="rc-pistemix__bar"
        role="img"
        aria-label={t('piste_bar_aria')
          .replace('{v}', String(counts.green ?? 0))
          .replace('{b}', String(counts.blue ?? 0))
          .replace('{r}', String(counts.red ?? 0))
          .replace('{n}', String(counts.black ?? 0))}
      >
        {values.map((v) => {
          if (v.weight <= 0) return null
          const pct = (100 * v.weight) / denom
          const label =
            mode === 'km'
              ? `${INITIALS[v.color]}${kmFmt(v.km)}`
              : mode === 'pct'
                ? `${INITIALS[v.color]}${Math.round(pct)}`
                : `${INITIALS[v.color]}${v.count}`
          const share = split.total > 0 ? Math.round((100 * v.km) / split.total) : classic ? Math.round((100 * v.count) / classic) : 0
          const title = t('piste_tooltip')
            .replace('{n}', String(v.count))
            .replace('{color}', t(v.color === 'other' ? 'piste_others' : (`piste_${v.color}` as 'piste_green')))
            .replace('{pct}', String(share))
            .replace('{km}', kmFmt(v.km))
          return (
            <span
              key={v.color}
              className={`rc-pistemix__seg rc-pistemix__seg--${v.color}`}
              style={{
                flexGrow: v.weight,
                background: hex[v.color],
                color: v.color === 'black' && !dark ? '#fff' : undefined
              }}
              title={title}
            >
              {pct >= 12 ? label : ''}
            </span>
          )
        })}
      </div>
      <div className="rc-pistemix__meta">
        <span className="rc-pistemix__legend">
          {PISTE_BUCKETS.filter((c) => countOf(c) > 0 || split[c] > 0).map((c) => (
            <span key={c}>
              {INITIALS[c]}
              {mode === 'km'
                ? kmFmt(split[c])
                : mode === 'pct'
                  ? `${split.total ? Math.round((100 * split[c]) / split.total) : 0} %`
                  : countOf(c)}
            </span>
          ))}
        </span>
        <span className="rc-pistemix__total" data-testid="piste-mix-total">
          {totalLabel}
          {slopes.slopes_quality === 'partial' ? ` · ${t('piste_badge_partial')}` : ''}
        </span>
        <span className="rc-pistemix__src" title={badgeTitle}>
          {split.basis === 'brochure_scaled' ? t('piste_badge_announced') : badge}
        </span>
        {onMode && (
          <span className="rc-pistemix__mode">
            {(['count', 'km', 'pct'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={mode === m ? 'rc-link' : 'rc-link rc-link--muted'}
                onClick={() => onMode(m)}
                data-testid={`piste-mode-${m}`}
              >
                {t(`piste_mode_${m}` as 'piste_mode_count')}
              </button>
            ))}
          </span>
        )}
      </div>
      {split.basis === 'brochure_scaled' && !compact && (
        <p className="rc-pistemix__hint">
          {t('piste_km_scaled_hint').replace('{announced}', kmFmt(split.total)).replace('{osm}', kmFmt(split.osmKm))}
        </p>
      )}
      {!compact && extra > 0 && (
        <details className="rc-pistemix__extra">
          <summary>
            {t('piste_others')} · {extra}
            {split.other > 0 ? ` · ${kmFmt(split.other)} km` : ''}
          </summary>
          <ul>
            {PISTE_EXTRA.map((c) =>
              (counts[c] ?? 0) > 0 ? (
                <li key={c}>
                  {t(`piste_${c}` as 'piste_expert')} · {counts[c]}
                </li>
              ) : null
            )}
          </ul>
        </details>
      )}
      {table && !compact && (
        <table className="rc-pistemix__table">
          <thead>
            <tr>
              <th>{t('piste_table_color')}</th>
              <th>{t('piste_table_count')}</th>
              <th>{t('piste_table_km')}</th>
              <th>{t('piste_table_share')}</th>
            </tr>
          </thead>
          <tbody>
            {PISTE_BUCKETS.map((c) => {
              const n = countOf(c)
              const km = split[c]
              if (n <= 0 && km <= 0) return null
              const share = split.total > 0 ? Math.round((100 * km) / split.total) : classic ? Math.round((100 * n) / classic) : 0
              return (
                <tr key={c}>
                  <td>{t(c === 'other' ? 'piste_others' : (`piste_${c}` as 'piste_green'))}</td>
                  <td className="u-num">{n}</td>
                  <td className="u-num">{kmFmt(km)}</td>
                  <td className="u-num">{`${share} %`}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th>{t('piste_table_total')}</th>
              <td className="u-num">{totalCount}</td>
              <td className="u-num crn-releve" data-testid="piste-km-sum">
                {kmFmt(split.total)}
              </td>
              <td className="u-num">100 %</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}
