/**
 * État des positions du lot de logements affiché.
 *
 * Ce panneau existe pour une raison précise : une épingle sur une carte a
 * l'air d'une mesure alors qu'aucune plateforme ne publie l'adresse exacte
 * d'un bien. Il rend visible ce que l'application sait — combien de positions
 * sont déduites, combien sont démenties par le relief — au lieu de laisser la
 * carte affirmer ce qu'elle ignore.
 */

import type { GeoSummary } from '@/data/lodgingGeo'
import type { SourceHealth } from '@/data/lodgings'
import { agoTxt } from '@/data/lodgings'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'

interface Props {
  summary: GeoSummary
  busy: boolean
  error: string | null
  osmError: boolean
  onRecheck: () => void
  /** Santé des sources d'offres. */
  health: SourceHealth
  /** Médiane des prix tout compris du domaine, `0` si rien à médianiser. */
  median: number
  /** Doublons fusionnés par le rapprochement multi-sources. */
  dupMerged: number
  onRescan: () => void
}

export function LodgingGeoPanel({
  summary,
  busy,
  error,
  osmError,
  onRecheck,
  health,
  median,
  dupMerged,
  onRescan
}: Props): JSX.Element {
  const { state, patch } = useApp()
  const { eur } = useFormat()
  const { t, lang } = useI18n()
  const verified = summary.total - summary.est

  const scanTxt = state.lodgPhase === 'searching'
    ? t('scan_running')
    : state.lastScan != null
      ? `${t('scan_recorded')} ${agoTxt(Math.max(0, Math.round((Date.now() - state.lastScan) / 60000)), lang)}`
      : t('scan_auto_on_open')

  return (
    <div className="geopanel">
      {/* --- Santé des sources ------------------------------------------- */}
      <p className="geopanel__title">
        {health.down.length > 0 || health.late.length > 0
          ? t('scan_sources_partial')
              .replace('{ok}', String(health.ok))
              .replace('{n}', String(health.total))
          : t('scan_sources_uptodate').replace('{n}', String(health.total))}
      </p>
      {health.down.length > 0 && (
        <p className="geopanel__line geopanel__line--bad">
          {t('scan_unreachable')} {health.down.join(', ')}
        </p>
      )}
      {/* Panne réelle du dernier relevé, par opposition à l'âge simulé du
          catalogue : une source sans clé et une source sans offre donnent le
          même écran vide, et seule cette ligne les distingue. */}
      {state.lodgFailed.length > 0 && (
        <p className="geopanel__line geopanel__line--bad">
          {t('scan_sources_failed').replace('{s}', state.lodgFailed.join(', '))}
        </p>
      )}
      {state.lodgEmpty.length > 0 && (
        <p className="geopanel__line">
          {t('scan_sources_empty').replace('{s}', state.lodgEmpty.join(', '))}
        </p>
      )}
      {health.late.length > 0 && (
        <p className="geopanel__line">
          {t('scan_over_48h')} {health.late.join(', ')}
        </p>
      )}
      <p className="geopanel__line">
        {median > 0 ? `${t('scan_median')} ${eur(median)} · ` : ''}
        {scanTxt}
      </p>
      <div className="geopanel__actions">
        <label className="check check--inline">
          <input
            type="checkbox"
            checked={state.mergeDupes}
            onChange={(e) => patch({ mergeDupes: e.target.checked })}
          />
          {t('scan_merge_dupes')}{' '}
          <span className="u-muted">
            ·{' '}
            {dupMerged > 0
              ? t('scan_dupes_merged').replace('{n}', String(dupMerged))
              : t('scan_no_dupes')}
          </span>
        </label>
        <button
          type="button"
          className="linkbtn linkbtn--sm"
          onClick={onRescan}
          disabled={state.lodgPhase === 'searching'}
        >
          {t('lodg_rescan')}
        </button>
      </div>

      {/* --- Positions ---------------------------------------------------- */}
      <p className="geopanel__title geopanel__title--section">
        {t('geo_positions_tally')
          .replace('{n}', String(summary.total))
          .replace('{v}', String(verified))
          .replace('{e}', String(summary.est))}
      </p>

      {summary.bad > 0 && (
        <p className="geopanel__line geopanel__line--bad">
          {t('geo_bad_tally').replace('{n}', String(summary.bad))}
        </p>
      )}
      {summary.warn > 0 && (
        <p className="geopanel__line">
          {t('geo_warn_tally').replace('{n}', String(summary.warn))}
        </p>
      )}
      {summary.waiting > 0 && (
        <p className="geopanel__line">
          {t('geo_waiting_tally').replace('{n}', String(summary.waiting))}
        </p>
      )}
      {summary.bad === 0 && summary.warn === 0 && summary.waiting === 0 && (
        <p className="geopanel__line">{t('geo_all_consistent')}</p>
      )}

      {error && <p className="geopanel__line geopanel__line--bad">{error}</p>}
      {osmError && (
        <p className="geopanel__line">
          {t('geo_osm_unavailable')}
        </p>
      )}

      <div className="geopanel__actions">
        <label className="check check--inline">
          <input
            type="checkbox"
            checked={state.hideBadGeo}
            onChange={(e) => patch({ hideBadGeo: e.target.checked })}
          />
          {t('geo_hide_bad')}
        </label>
        <button type="button" className="linkbtn linkbtn--sm" onClick={onRecheck} disabled={busy}>
          {busy ? t('geo_rechecking') : t('geo_recheck')}
        </button>
      </div>

      <p className="geopanel__note">{t('geo_panel_note')}</p>
    </div>
  )
}
