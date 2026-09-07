/**
 * StayBar — pied collant de l'écran Logements : logement retenu (sinon le
 * moins cher à prix ferme, annoncé comme tel), total séjour détaillé,
 * passage à la demande de réservation.
 */

import { useNavigate } from 'react-router-dom'
import { availabilityOf } from '@/data/lodgingAvailability'
import type { Lodging } from '@/data/lodgings'
import { srcOf } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { PATHS } from '../router'

export function StayBar({ d, list }: { d: Domain; list: Lodging[] }): JSX.Element | null {
  const { state, patch } = useApp()
  const derived = useDerived()
  const { eur } = useFormat()
  const { t } = useI18n()
  const navigate = useNavigate()

  const stay = { checkIn: state.arrDate, checkOut: state.depDate }
  const firm = list.filter((lg) => lg.total > 0 && availabilityOf(lg, stay).status === 'confirmed')
  const keptId = state.selLodgings[d.id]
  const kept = firm.find((lg) => lg.id === keptId) ?? null
  const pick = kept ?? [...firm].sort((a, b) => a.total - b.total)[0] ?? null
  if (!pick && firm.length === 0 && list.length === 0) return null

  const cost = pick ? derived.sejourCost(pick, d) : null
  const pp = cost && state.travelers > 0 ? Math.round(cost.total / state.travelers) : null

  return (
    <div className="rc-stay" data-testid="stay-bar">
      <div className="rc-stay__who">
        <span className="rc-eyebrow">{kept ? t('rc_stay_kept') : pick ? t('rc_stay_cheapest') : t('rc_stay_title')}</span>
        <strong className="rc-stay__name" data-testid="stay-bar-lodging">{pick ? `${pick.name} · ${srcOf(pick)}` : t('rc_stay_none')}</strong>
      </div>
      {cost && (
        <dl className="rc-stay__detail">
          <div><dt>{t('rc_ck_lodging_cost')}</dt><dd className="u-num">{eur(cost.lodging)}</dd></div>
          <div><dt>{t('rc_ck_passes')}</dt><dd className="u-num">{cost.forfaits > 0 ? eur(cost.forfaits) : '—'}</dd></div>
          <div><dt>{t('rc_ck_route')}</dt><dd className="u-num">{cost.route > 0 ? eur(cost.route) : '—'}</dd></div>
        </dl>
      )}
      <div className="rc-stay__total">
        <span className="rc-eyebrow">{t('rc_ck_total')}</span>
        <strong className="crn-calcul" data-testid="stay-bar-total">{cost ? eur(cost.total) : '—'}</strong>
        {pp != null && <span className="rc-muted rc-small">{eur(pp)} {t('rc_stay_pp')}</span>}
      </div>
      <button
        type="button"
        className="rc-btn rc-btn--cta rc-btn--lg"
        data-testid="stay-bar-go"
        disabled={!pick}
        onClick={() => {
          if (!pick) return
          patch({ selLodgings: { ...state.selLodgings, [d.id]: pick.id } })
          navigate(PATHS.reservation(pick.id))
        }}
      >
        {t('rc_stay_go')} →
      </button>
    </div>
  )
}
