/**
 * StationCard — carte produit 21st-inspired pour une station.
 * Données réelles du référentiel uniquement ; l'enneigement n'apparaît que
 * s'il est relevé, le forfait dit s'il est estimé.
 */

import { Link } from 'react-router-dom'
import { massifPhoto, stationPhoto } from '@/components/photos'
import type { Domain } from '@/data/referentiel'
import { creditPhoto } from '@/data/stationPhotos'
import { snowDepths } from '@/data/weather'
import { massifColor } from '@/domain/massif'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useWeather } from '@/state/weather'
import { PATHS } from '../router'

export function stationPhotoOf(d: Domain): { src: string | null; credit: string | null } {
  const credit = creditPhoto(d.name)
  const own = credit ? stationPhoto(d.slug) : null
  if (own && credit) return { src: own, credit: `${credit.licence}${credit.auteur ? ` · ${credit.auteur}` : ''}` }
  return { src: massifPhoto(d.massif), credit: null }
}

interface Props {
  d: Domain
  onLodgings?: (d: Domain) => void
}

export function StationCard({ d, onLodgings }: Props): JSX.Element {
  const { state, patch } = useApp()
  const derived = useDerived()
  const { weatherOf } = useWeather()
  const { fmt, eur } = useFormat()
  const { t } = useI18n()

  const photo = stationPhotoOf(d)
  const snow = snowDepths(weatherOf(d.id))
  const forfait = derived.forfaitOf(d)
  const checked = state.stationCompareIds.includes(d.id)
  const saved = state.selDomains.includes(d.id)

  const toggleCompare = (): void =>
    patch({ stationCompareIds: checked ? state.stationCompareIds.filter((id) => id !== d.id) : [...state.stationCompareIds, d.id] })

  return (
    <article className={`rc-stcard${checked ? ' rc-stcard--checked' : ''}`} data-testid={`station-card-${d.id}`}>
      <Link
        to={PATHS.station(d.id)}
        className="rc-stcard__media"
        aria-label={t('rc_station_open').replace('{d}', d.name)}
        data-testid={`station-card-open-${d.id}`}
        style={photo.src ? { backgroundImage: `url(${photo.src})` } : { background: massifColor(d.massif).soft }}
      >
        {photo.credit && <span className="rc-stcard__credit">{photo.credit}</span>}
        {snow.releve && snow.bas != null && snow.haut != null && (snow.bas > 0 || snow.haut > 0) && (
          <span className="rc-stcard__snow crn-releve" data-testid={`station-card-snow-${d.id}`}>
            {fmt(snow.bas)} / {fmt(snow.haut)} cm
          </span>
        )}
      </Link>
      <div className="rc-stcard__body">
        <div className="rc-stcard__head">
          <strong className="rc-stcard__name" title={d.name}>{d.name}</strong>
          <span className="rc-stcard__sub" title={`${d.massif}${d.pass ? ` · ${d.pass}` : ''}`}>
            {d.massif}
            {d.pass ? ` · ${d.pass}` : ''}
          </span>
        </div>
        <dl className="rc-facts">
          <div>
            <dt>{t('rc_fact_km')}</dt>
            <dd className="crn-releve">{fmt(d.km)} km</dd>
          </div>
          <div>
            <dt>{t('rc_fact_alt')}</dt>
            <dd className="crn-releve">{fmt(d.min)}–{fmt(d.max)} m</dd>
          </div>
          <div>
            <dt>{t('rc_fact_pass')}</dt>
            <dd className={forfait.estimated ? '' : 'crn-releve'}>
              {forfait.j6 != null ? eur(forfait.j6) : '—'}
              {forfait.j6 != null && forfait.estimated && <small className="rc-est"> {t('estimated')}</small>}
            </dd>
          </div>
        </dl>
        <div className="rc-stcard__foot">
          <label className="rc-check" data-testid={`station-card-compare-${d.id}`}>
            <input type="checkbox" checked={checked} onChange={toggleCompare} />
            <span>{checked ? t('home_popular_comparing') : t('home_popular_compare')}</span>
          </label>
          {saved && <span className="rc-badge">{t('rc_saved')}</span>}
          {onLodgings && (
            <button type="button" className="rc-link" data-testid={`station-card-lodgings-${d.id}`} onClick={() => onLodgings(d)}>
              {t('nav_lodgings')} →
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
