/**
 * Fiche logement — grande fenêtre en overlay.
 * Prix, accès et dates seulement s’ils ont été relevés. Rien n’est inventé.
 */

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloseIcon, ExternalIcon } from '@/components/Icons'
import { accessTimeOf } from '@/data/accessTime'
import { isClientReady } from '@/api/client'
import { availabilityOf } from '@/data/lodgingAvailability'
import { listingUrlWithStay, searchUrlFor } from '@/data/deeplinks'
import { sizeLabel, srcOf, trackKey } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import { enfantPrice } from '@/data/referentiel'
import { lessonsCount } from '@/domain/costs'
import { useFormat } from '@/hooks/useFormat'
import { useFocusTrap } from '@/hooks/useShortcuts'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { PATHS } from '../router'
import { PriceFirm } from './PriceFirm'

export function LodgeSheet({ domain: d }: { domain: Domain }): JSX.Element | null {
  const { dur, eur, fmt } = useFormat()
  const { t } = useI18n()
  const { state, patch } = useApp()
  const derived = useDerived()
  const navigate = useNavigate()
  const ref = useRef<HTMLElement>(null)
  useFocusTrap(ref, state.ficheId != null)

  const lodging = derived.lodgAll.find((l) => l.id === state.ficheId) ?? null

  useEffect(() => {
    if (!lodging) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [lodging])

  if (!lodging) return null

  const nights = derived.nights
  const forfait = derived.forfaitOf(d)
  const cost = derived.sejourCost(lodging, d)
  const trip = derived.sejourInputs(d).trip
  const stay = { checkIn: state.arrDate, checkOut: state.depDate }
  const verdict = availabilityOf(lodging, stay)
  const src = srcOf(lodging)
  const size = sizeLabel(lodging, t)
  const inCompare = state.compareIds.includes(lodging.id)
  const tracked = state.tracked.some((tr) => tr.key === trackKey(lodging))
  const kept = state.selLodgings[d.id] === lodging.id
  const measured = lodging.accessComputed === true
  const hasAccess = measured && (lodging.dist > 0 || lodging.den !== 0 || lodging.liftDist > 0 || lodging.skiIn)

  const criteria = {
    domainName: d.name,
    arrDate: state.arrDate,
    depDate: state.depDate,
    travelers: state.travelers,
    rooms: state.rooms
  }
  const searchUrl = searchUrlFor(src, criteria)
  const target = lodging.url
    ? listingUrlWithStay(lodging.url, lodging.srcConnector ?? src, criteria)
    : searchUrl

  const close = (): void => patch({ ficheId: null })

  const print = (): void => {
    document.documentElement.setAttribute('data-print', 'fiche')
    const off = (): void => {
      document.documentElement.removeAttribute('data-print')
      window.removeEventListener('afterprint', off)
    }
    window.addEventListener('afterprint', off)
    setTimeout(() => window.print(), 60)
  }

  const reserve = (): void => {
    patch({ selLodgings: { ...state.selLodgings, [d.id]: lodging.id }, ficheId: null })
    navigate(PATHS.reservation(lodging.id))
  }

  const access = accessTimeOf(lodging.dist, lodging.accessType)
  const skiIn = access?.mode === 'skis_aux_pieds' || lodging.skiIn
  const duration =
    access?.minutes == null
      ? null
      : access.mode === 'voiture'
        ? t('access_drive_time').replace('{n}', String(access.minutes))
        : access.mode === 'navette'
          ? t('access_shuttle_time').replace('{n}', String(access.minutes))
          : t('access_walk_time').replace('{n}', String(access.minutes))

  return (
    <div className="rc-fiche" data-testid="lodge-sheet">
      <button type="button" className="rc-fiche__scrim" aria-label="Fermer" onClick={close} />
      <aside
        ref={ref}
        className="rc-fiche__win"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lodge-sheet-title"
      >
        <header className="rc-fiche__head">
          <div className="rc-fiche__kicker">
            <span className="rc-badge">{src}</span>
            <span className="rc-muted">{lodging.type}{size ? ` · ${size}` : ''} · {t('rc_lodge_cap').replace('{n}', String(lodging.pers || state.travelers))}</span>
            {lodging.accessComputed === true && lodging.skiIn && <span className="rc-badge rc-badge--ok">{t('badge_ski_in')}</span>}
            {kept && <span className="rc-badge rc-badge--ok">{t('rc_stay_kept')}</span>}
          </div>
          <h2 id="lodge-sheet-title" className="rc-fiche__title">{lodging.name}</h2>
          {lodging.note && lodging.note !== '—' && (
            <p className="rc-muted">
              ★ {lodging.note}
              {lodging.avis > 0 ? ` · ${lodging.avis} avis` : ''}
            </p>
          )}
          <button type="button" className="rc-fiche__close" onClick={close} aria-label="Fermer" data-testid="lodge-sheet-close">
            <CloseIcon />
          </button>
        </header>

        <div className="rc-fiche__body">
          <div className="rc-fiche__media">
            {lodging.image ? (
              <img src={lodging.image} alt="" className="rc-fiche__photo" />
            ) : (
              <div className="rc-fiche__nophoto">{t('rc_lodge_nophoto_src').replace('{s}', src)}</div>
            )}
            <div className="rc-fiche__price">
              <PriceFirm total={lodging.total} verdict={verdict} nights={nights} travelers={state.travelers} size="hero" testid="lodge-sheet-price" />
              <p className="rc-muted rc-small">
                {nights} nuits · {state.travelers} pers.
                {lodging.pp > 0 ? ` · ${eur(lodging.pp)} /pers/nuit` : ''}
              </p>
              <button type="button" className="rc-btn rc-btn--cta rc-btn--lg rc-btn--block" onClick={reserve} disabled={verdict.status !== 'confirmed'} data-testid="lodge-sheet-reserve">
                {t('rc_lodge_reserve')}
              </button>
              {target && (
                <button type="button" className="rc-link" onClick={() => void window.skitrack.openExternal(target)}>
                  {t('rc_lodge_open').replace('{s}', src)} <ExternalIcon />
                </button>
              )}
            </div>
          </div>

          <div className="rc-fiche__col">
            {lodging.priceOptions && lodging.priceOptions.length > 0 && (
              <section>
                <p className="rc-fiche__label">{t('lodg_rate_grid')}</p>
                <div className="rc-fiche__rows">
                  {lodging.priceOptions.map((option) => {
                    const yours = option.total === lodging.total
                    return (
                      <div key={`${option.guests}-${option.total}`} className={yours ? 'rc-fiche__row rc-fiche__row--on' : 'rc-fiche__row'}>
                        <span>
                          {t('lodg_rate_guests').replace('{n}', String(option.guests))}
                          {option.condition ? ` · ${option.condition}` : ''}
                          {option.policy ? ` · ${option.policy}` : ''}
                          {yours ? ` · ${t('lodg_rate_yours')}` : ''}
                        </span>
                        <b className="u-num">{eur(option.total)}</b>
                      </div>
                    )
                  })}
                </div>
                <p className="rc-muted rc-small">{t('lodg_rate_grid_note')}</p>
              </section>
            )}

            {lodging.annul && <p className="rc-notice rc-notice--ok">{t('rc_lodge_free_cancel')}</p>}

            <section>
              <p className="rc-fiche__label">{t('access_label')}</p>
              {hasAccess ? (
                <>
                  <dl className="rc-fiche__dl">
                    <div>
                      <dt>{t('access_to_runs')}</dt>
                      <dd>
                        {[
                          lodging.dist > 0 ? `${fmt(lodging.dist)} m` : null,
                          duration ?? (skiIn ? t('access_ski_in') : null),
                          lodging.den > 0
                            ? t('access_climb').replace('{n}', fmt(lodging.den))
                            : lodging.den < 0
                              ? t('access_descent').replace('{n}', fmt(Math.abs(lodging.den)))
                              : measured ? t('access_flat') : null
                        ].filter(Boolean).join(' · ')}
                      </dd>
                    </div>
                    {lodging.liftDist > 0 && (
                      <div>
                        <dt>{t('nearest_lift')}</dt>
                        <dd>{[lodging.lift || null, `${fmt(lodging.liftDist)} m`].filter(Boolean).join(' · ')}</dd>
                      </div>
                    )}
                    {lodging.alt > 0 && (
                      <div>
                        <dt>Altitude</dt>
                        <dd>{fmt(lodging.alt)} m</dd>
                      </div>
                    )}
                    <div>
                      <dt>{t('access_by_car')}</dt>
                      <dd>{derived.travelText(d)}</dd>
                    </div>
                  </dl>
                  <p className="rc-muted rc-small">{t('access_walk_note')}</p>
                </>
              ) : (
                <p className="rc-muted">
                  {!isClientReady()
                    ? t('access_no_engine')
                    : d.engineId == null
                      ? t('access_no_engine_domain')
                      : lodging.lat == null || lodging.lon == null
                        ? t('access_no_position').replace('{s}', src)
                        : t('rc_lodge_dist_unknown')}
                </p>
              )}
            </section>

            <section>
              <p className="rc-fiche__label">{t('full_stay_cost')}</p>
              <div className="rc-fiche__rows">
                <div className="rc-fiche__row">
                  <span>{t('rc_ck_lodging_cost')}</span>
                  <b className="u-num">{eur(cost.lodging)}</b>
                </div>
                <div className="rc-fiche__row">
                  <span>
                    {t('rc_ck_passes')} — {cost.adults} ad. × {forfait.j6 != null ? eur(forfait.j6) : '—'}
                    {cost.kids ? ` + ${cost.kids} enf. × ${eur(enfantPrice(forfait))}` : ''}
                  </span>
                  <b className="u-num">{cost.forfaits > 0 ? eur(cost.forfaits) : '—'}</b>
                </div>
                <div className="rc-fiche__row">
                  <span>
                    {t('rc_ck_route')} — {cost.cars} foyer(s) · {eur(trip.fuel)}
                    {trip.tolls ? ` · ${t('sheet_tolls').replace('{p}', eur(trip.tolls))}` : ` · ${t('sheet_no_tolls')}`}
                  </span>
                  <b className="u-num">{cost.route > 0 ? eur(cost.route) : '—'}</b>
                </div>
                {cost.rental > 0 && (
                  <div className="rc-fiche__row">
                    <span>{t('rental_6days')}</span>
                    <b className="u-num">{eur(cost.rental)}</b>
                  </div>
                )}
                {cost.lessons > 0 && (
                  <div className="rc-fiche__row">
                    <span>Cours ESF — {lessonsCount(state.people)} inscrit(s)</span>
                    <b className="u-num">{eur(cost.lessons)}</b>
                  </div>
                )}
                <div className="rc-fiche__row rc-fiche__row--total">
                  <strong>{t('rc_ck_total')}</strong>
                  <strong className="u-num">{eur(cost.total)}</strong>
                </div>
                <div className="rc-fiche__row">
                  <span className="rc-muted">{t('rc_stay_pp')}</span>
                  <span className="u-num">{eur(Math.round(cost.total / Math.max(1, state.travelers)))}</span>
                </div>
              </div>
              <div className="rc-fiche__opts">
                <label className="rc-fiche__check">
                  <input type="checkbox" checked={state.optRental} onChange={(e) => patch({ optRental: e.target.checked })} />
                  {t('rental_option')}
                </label>
                <label className="rc-fiche__check">
                  <input type="checkbox" checked={state.optLessons} onChange={(e) => patch({ optLessons: e.target.checked })} />
                  Cours de ski / snowboard (par voyageur)
                </label>
              </div>
              <p className="rc-muted rc-small">
                Forfaits 6 j, carburant 0,115 €/km par foyer, péages selon le réglage. Repas non comptés. Trajet {dur(derived.worstTravel(d))}.
              </p>
            </section>

            <section className="rc-fiche__verified">
              <p className="rc-fiche__label">{t('sheet_verified_title')}</p>
              <ul>
                <li>
                  <strong>{t('sheet_verified_dates')}</strong>
                  {' : '}
                  {lodging.priceCheckIn && lodging.priceCheckOut
                    ? `${lodging.priceCheckIn} → ${lodging.priceCheckOut}`
                    : `${state.arrDate} → ${state.depDate}`}
                  {lodging.priceCheckIn &&
                  (lodging.priceCheckIn !== state.arrDate || lodging.priceCheckOut !== state.depDate) ? (
                    <span className="rc-warn-text"> — {t('sheet_dates_differ')}</span>
                  ) : (
                    <span className="rc-ok-text"> — {t('sheet_dates_match')}</span>
                  )}
                </li>
                <li>
                  <strong>Prix</strong>
                  {' : '}
                  {lodging.total > 0 ? (
                    <>
                      {eur(lodging.total)}
                      {' · '}
                      {lodging.priceConfidence === 'total_confirmed'
                        ? t('sheet_price_confirmed_these')
                        : lodging.priceConfidence === 'partial'
                          ? t('sheet_price_teaser')
                          : t('sheet_price_to_confirm')}
                    </>
                  ) : (
                    t('sheet_price_unpublished')
                  )}
                </li>
                <li>
                  <strong>Source</strong>
                  {' : '}
                  {src}
                  {lodging.dups && lodging.dups.length > 0
                    ? ` · aussi ${lodging.dups.map((dup) => `${dup.src} ${eur(dup.total)}`).join(', ')}`
                    : ''}
                </li>
                {(lodging.dist > 0 || lodging.skiIn) && measured && (
                  <li>
                    <strong>{t('sheet_ski_access')}</strong>
                    {' : '}
                    {lodging.skiIn ? t('access_ski_in') : `${lodging.dist} m`}
                  </li>
                )}
              </ul>
            </section>
          </div>
        </div>

        <footer className="rc-fiche__foot">
          <button
            type="button"
            className="rc-btn rc-btn--ghost"
            onClick={() =>
              patch({
                compareIds: inCompare
                  ? state.compareIds.filter((i) => i !== lodging.id)
                  : [...state.compareIds, lodging.id].slice(-4)
              })
            }
          >
            {inCompare ? '✓ Comparateur' : '＋ Comparer'}
          </button>
          <button
            type="button"
            className="rc-btn rc-btn--ghost"
            onClick={() => {
              const key = trackKey(lodging)
              if (tracked) {
                patch({ tracked: state.tracked.filter((tr) => tr.key !== key) })
              } else {
                patch({
                  tracked: [
                    ...state.tracked,
                    { key, name: lodging.name, src: lodging.src, total: lodging.total, pp: lodging.pp, domain: d.name }
                  ],
                  trackedSel: state.tracked.length
                })
              }
            }}
          >
            {tracked ? '✓ Suivi' : 'Suivre le prix'}
          </button>
          <button type="button" className="rc-link" onClick={print}>Imprimer</button>
          <span className="u-spacer" />
          <button type="button" className="rc-btn rc-btn--cta" onClick={reserve} disabled={verdict.status !== 'confirmed'}>
            {t('rc_lodge_reserve')}
          </button>
        </footer>
      </aside>
    </div>
  )
}
