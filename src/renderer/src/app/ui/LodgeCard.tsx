/**
 * LodgeCard — carte produit d'un hébergement. Prix FERME ou tiret ; distance
 * aux pistes seulement quand le moteur l'a mesurée (GPS) ; source visible.
 */

import { useNavigate } from 'react-router-dom'
import { availabilityOf } from '@/data/lodgingAvailability'
import type { Lodging } from '@/data/lodgings'
import { sizeLabel, srcOf } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import { listingUrlWithStay } from '@/data/deeplinks'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { PATHS } from '../router'
import { PriceFirm } from './PriceFirm'

interface Props {
  lg: Lodging
  d: Domain
  nights: number
  /** Repères calculés sur la liste affichée (jamais inventés). */
  badges?: string[]
  /** Photo de la station, en fond atténué quand l'annonce n'a pas d'image. */
  fallback?: string | null
}

export function LodgeCard({ lg, d, nights, badges = [], fallback = null }: Props): JSX.Element {
  const { state, patch } = useApp()
  const { fmt } = useFormat()
  const { t } = useI18n()
  const navigate = useNavigate()

  const stay = { checkIn: state.arrDate, checkOut: state.depDate }
  const verdict = availabilityOf(lg, stay)
  const src = srcOf(lg)
  const size = sizeLabel(lg, t)
  const measured = lg.accessComputed === true
  const criteria = { domainName: d.name, arrDate: state.arrDate, depDate: state.depDate, travelers: state.travelers, rooms: state.rooms }
  const url = lg.url ? listingUrlWithStay(lg.url, src, criteria) : null
  const kept = state.selLodgings[d.id] === lg.id
  const picked = state.lodgPickId === lg.id || state.ficheId === lg.id

  const reserve = (): void => {
    patch({ selLodgings: { ...state.selLodgings, [d.id]: lg.id } })
    navigate(PATHS.reservation(lg.id))
  }

  const openSheet = (): void => patch({ ficheId: lg.id })

  return (
    <article
      className={`rc-lodge${kept ? ' rc-lodge--kept' : ''}${picked ? ' rc-lodge--pick' : ''}`}
      data-testid={`lodge-card-${lg.id}`}
      onClick={openSheet}
    >
      <div className={`rc-lodge__media${!lg.image && fallback ? ' rc-lodge__media--fallback' : ''}`} style={lg.image ? { backgroundImage: `url(${lg.image})` } : fallback ? { backgroundImage: `url(${fallback})` } : undefined}>
        {!lg.image && <span className="rc-lodge__nophoto">{t('rc_lodge_nophoto_src').replace('{s}', src)}</span>}
        <span className="rc-lodge__src" data-testid={`lodge-src-${lg.id}`}>{src}</span>
        {verdict.status === 'confirmed' && <span className="rc-badge rc-badge--ok rc-lodge__avail">{t('rc_lodge_available')}</span>}
        {badges.length > 0 && (
          <div className="rc-lodge__badges" data-testid={`lodge-badges-${lg.id}`}>
            {badges.map((b) => <span key={b} className="rc-lodge__best">{b}</span>)}
          </div>
        )}
      </div>
      <div className="rc-lodge__body">
        <div className="rc-lodge__head">
          <strong className="rc-lodge__name" title={lg.name}>{lg.name}</strong>
          <span className="rc-lodge__sub">
            {lg.type}
            {size ? ` · ${size}` : ''}
            {` · ${t('rc_lodge_cap').replace('{n}', String(lg.pers))}`}
          </span>
        </div>
        <ul className="rc-lodge__facts">
          {measured && lg.skiIn && <li>{t('badge_ski_in')}</li>}
          {measured && !lg.skiIn && lg.dist > 0 && <li className="crn-releve">{t('rc_lodge_dist').replace('{m}', fmt(lg.dist))}</li>}
          {!measured && <li className="rc-muted">{t('rc_lodge_dist_unknown')}</li>}
          {lg.priceIsFrom && <li className="rc-muted">{t('import_call_price')}</li>}
          {!lg.priceIsFrom &&
            Boolean(lg.priceFlags?.some((f) => f === 'incomplete_fees' || f === 'unit_mismatch' || f === 'unit_unknown')) && (
              <li className="rc-muted">{t('import_incomplete_price')}</li>
            )}
        </ul>
        <div className="rc-lodge__foot">
          <PriceFirm total={lg.total} verdict={verdict} nights={nights} travelers={state.travelers} testid={`lodge-price-${lg.id}`} />
          <div className="rc-lodge__acts">
            <button type="button" className="rc-btn rc-btn--cta rc-btn--sm" data-testid={`lodge-reserve-${lg.id}`} onClick={(e) => { e.stopPropagation(); reserve() }} disabled={verdict.status !== 'confirmed'}>
              {t('rc_lodge_reserve')}
            </button>
            {url && (
              <button type="button" className="rc-link" data-testid={`lodge-open-${lg.id}`} onClick={(e) => { e.stopPropagation(); void window.skitrack.openExternal(url) }}>
                {t('rc_lodge_open').replace('{s}', src)} ↗
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
