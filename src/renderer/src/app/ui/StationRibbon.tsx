/**
 * StationRibbon — rappel compact de la station au-dessus des logements :
 * photo, altitudes, km de pistes, neige relevée (« — » sinon), lien fiche.
 */

import { Link } from 'react-router-dom'
import type { Domain } from '@/data/referentiel'
import { snowDepths } from '@/data/weather'
import { massifColor } from '@/domain/massif'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useDerived } from '@/state/selectors'
import { useWeather } from '@/state/weather'
import { PATHS } from '../router'
import { stationPhotoOf } from './StationCard'

export function StationRibbon({ d }: { d: Domain }): JSX.Element {
  const derived = useDerived()
  const { weatherOf } = useWeather()
  const { fmt, eur } = useFormat()
  const { t } = useI18n()
  const photo = stationPhotoOf(d)
  const snow = snowDepths(weatherOf(d.id))
  const forfait = derived.forfaitOf(d)
  const cm = (v: number | null): string => (snow.releve && v != null ? `${fmt(v)} cm` : '—')

  return (
    <section className="rc-ribbon" data-testid="lodgings-ribbon">
      <Link to={PATHS.station(d.id)} className="rc-ribbon__photo" aria-label={d.name} style={photo.src ? { backgroundImage: `url(${photo.src})` } : { background: massifColor(d.massif).soft }} />
      <div className="rc-ribbon__body">
        <span className="rc-ribbon__sub">{[d.massif, d.region, d.pass].filter(Boolean).join(' · ')}</span>
        <dl className="rc-facts rc-facts--ribbon">
          <div><dt>{t('rc_fact_alt')}</dt><dd className="crn-releve">{fmt(d.min)}–{fmt(d.max)} m</dd></div>
          <div><dt>{t('rc_fact_km')}</dt><dd className="crn-releve">{fmt(d.km)} km</dd></div>
          <div><dt>{t('rc_lodg_ribbon_snow')}</dt><dd className="crn-releve" data-testid="lodgings-ribbon-snow">{cm(snow.bas)} / {cm(snow.haut)}</dd></div>
          <div><dt>{t('rc_fact_pass')}</dt><dd className={forfait.estimated ? '' : 'crn-releve'}>{forfait.j6 != null ? eur(forfait.j6) : '—'}{forfait.j6 != null && forfait.estimated && <small className="rc-est"> {t('estimated')}</small>}</dd></div>
        </dl>
      </div>
      <Link to={PATHS.station(d.id)} className="rc-link rc-link--strong rc-ribbon__go" data-testid="lodgings-ribbon-sheet">{t('rc_lodg_ribbon_sheet')}</Link>
    </section>
  )
}
