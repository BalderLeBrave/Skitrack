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
    ? 'Relevé en cours…'
    : state.lastScan != null
      ? `${t('scan_recorded')} ${agoTxt(Math.max(0, Math.round((Date.now() - state.lastScan) / 60000)), lang)}`
      : 'Relevé automatique à l’ouverture de l’écran'

  return (
    <div className="geopanel">
      {/* --- Santé des sources ------------------------------------------- */}
      <p className="geopanel__title">
        {health.down.length > 0 || health.late.length > 0
          ? `${health.ok} source(s) sur ${health.total} à jour`
          : `Les ${health.total} sources sont à jour`}
      </p>
      {health.down.length > 0 && (
        <p className="geopanel__line geopanel__line--bad">injoignable : {health.down.join(', ')}</p>
      )}
      {health.late.length > 0 && (
        <p className="geopanel__line">relevé de plus de 48 h : {health.late.join(', ')}</p>
      )}
      <p className="geopanel__line">
        {median > 0 ? `médiane du domaine ${eur(median)} · ` : ''}
        {scanTxt}
      </p>
      <div className="geopanel__actions">
        <label className="check check--inline">
          <input
            type="checkbox"
            checked={state.mergeDupes}
            onChange={(e) => patch({ mergeDupes: e.target.checked })}
          />
          Fusionner les doublons{' '}
          <span className="u-muted">
            · {dupMerged > 0 ? `${dupMerged} doublon(s) fusionné(s)` : 'aucun doublon'}
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
        {summary.total} position(s) · {verified} publiée(s) par la source, {summary.est} déduite(s)
      </p>

      {summary.bad > 0 && (
        <p className="geopanel__line geopanel__line--bad">
          ⚠ {summary.bad} position(s) invraisemblable(s) — plan d’eau, pleine montagne ou hors périmètre
        </p>
      )}
      {summary.warn > 0 && (
        <p className="geopanel__line">
          {summary.warn} position(s) douteuse(s) — fond de vallée, ou aucun bâtiment cartographié à proximité
        </p>
      )}
      {summary.waiting > 0 && (
        <p className="geopanel__line">
          {summary.waiting} position(s) en cours de vérification…
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
          Masquer les positions invraisemblables
        </label>
        <button type="button" className="linkbtn linkbtn--sm" onClick={onRecheck} disabled={busy}>
          {busy ? 'Vérification…' : 'Revérifier les positions'}
        </button>
      </div>

      <p className="geopanel__note">
        Altitudes issues du modèle d’élévation Open-Meteo ; plan d’eau et bâti d’OpenStreetMap. Une position
        déduite est placée autour du front de neige, jamais à l’adresse réelle du bien — elle sert à situer, pas
        à s’y rendre.
      </p>
    </div>
  )
}
