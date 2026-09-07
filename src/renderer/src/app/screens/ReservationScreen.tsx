/**
 * E5 — Demande de réservation. Récapitulatif + formulaire court + source OTA.
 * Le logement vient de `state.imported` (relevé collecteur) ; la station du
 * store. Aucun envoi serveur (voir CheckoutPanel).
 */

import { Link, Navigate, useParams } from 'react-router-dom'
import { listingUrlWithStay } from '@/data/deeplinks'
import { availabilityOf } from '@/data/lodgingAvailability'
import { srcOf } from '@/data/lodgings'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { PATHS } from '../router'
import { CheckoutPanel } from '../ui/CheckoutPanel'
import { EmptyHonest } from '../ui/EmptyHonest'

export function ReservationScreen(): JSX.Element {
  const { id } = useParams()
  const { state } = useApp()
  const derived = useDerived()
  const { t } = useI18n()

  const d = derived.lodgDomain
  const lg = derived.lodgAll.find((x) => String(x.id) === id) ?? state.imported.find((x) => String(x.id) === id) ?? null
  if (!d) return <Navigate to={PATHS.compare} replace />
  if (!lg) {
    return (
      <div className="rc-page">
        <EmptyHonest testid="reservation-missing" title={t('rc_res_missing_title')} hint={t('rc_res_missing_hint')} />
        <p className="rc-center"><Link to={PATHS.lodgings} className="rc-link">← {t('nav_lodgings')}</Link></p>
      </div>
    )
  }

  const verdict = availabilityOf(lg, { checkIn: state.arrDate, checkOut: state.depDate })
  const firm = verdict.status === 'confirmed' && lg.total > 0
  const cost = derived.sejourCost(lg, d)
  const url = lg.url ? listingUrlWithStay(lg.url, srcOf(lg), { domainName: d.name, arrDate: state.arrDate, depDate: state.depDate, travelers: state.travelers, rooms: state.rooms }) : null

  return (
    <div className="rc-page" data-testid="reservation-screen">
      <nav className="rc-crumbs" aria-label={t('rc_crumbs')}>
        <Link to={PATHS.lodgings} data-testid="reservation-back">← {t('nav_lodgings')}</Link>
      </nav>
      <header className="rc-page__head">
        <div>
          <span className="rc-eyebrow">{t('rc_step_3')}</span>
          <h1 className="rc-h1" data-testid="reservation-title">{t('rc_ck_title')}</h1>
          <p className="rc-muted">{t('rc_ck_lead')}</p>
        </div>
      </header>
      <CheckoutPanel lg={lg} d={d} cost={cost} nights={derived.nights} url={url} firm={firm} />
    </div>
  )
}
