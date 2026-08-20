/**
 * Fiche détaillée d'une offre de logement.
 *
 * ⚠ **Fichier reconstruit le 15 août 2026.** Une expression régulière trop
 * gourmande, passée pour retirer les URLs de réservation en dur, a tronqué ce
 * fichier. Le comportement a été restitué à l'identique depuis le paquet de
 * `out/renderer` (build du même jour, non minifié) : structure, classes,
 * libellés et calculs sont ceux d'origine. Les commentaires de bloc, eux, ne
 * survivent pas à la compilation — ceux d'ici ont été réécrits, et sont donc à
 * relire.
 *
 */

import { useRef } from 'react'
import { CloseIcon, ExternalIcon } from './Icons'
import { srcOf, trackKey } from '@/data/lodgings'
import { listingUrlWithStay, searchUrlFor } from '@/data/deeplinks'
import { availabilityOf } from '@/data/lodgingAvailability'
import type { Domain } from '@/data/referentiel'
import { enfantPrice } from '@/data/referentiel'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { lessonsCount } from '@/domain/costs'
import { useFocusTrap } from '@/hooks/useShortcuts'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'

/** Frais de ménage forfaitaires observés sur les locations de semaine. */
const CLEANING_FEE = 90
/** Taxe de séjour moyenne en station, par personne et par nuit. */
const STAY_TAX_PER_NIGHT = 1.55

export function LodgingSheet({ domain: d }: { domain: Domain }): JSX.Element | null {
  const { dur, eur, fmt } = useFormat()
  const { t } = useI18n()
  const { state, patch } = useApp()
  const derived = useDerived()
  const ref = useRef<HTMLElement>(null)
  useFocusTrap(ref)

  const lodging = derived.lodgAll.find((l) => l.id === state.ficheId)
  if (!lodging) return null

  const nights = derived.nights
  const forfait = derived.forfaitOf(d)
  const cost = derived.sejourCost(lodging, d)
  const trip = derived.sejourInputs(d).trip

  // Décomposition du prix affiché par les sources : le loyer est la part
  // restante une fois les frais obligatoires isolés, pas l'inverse.
  const base = Math.round(lodging.total * 0.8)
  const taxe = Math.round(state.travelers * nights * STAY_TAX_PER_NIGHT)
  const service = lodging.total - base - taxe - CLEANING_FEE

  const inCompare = state.compareIds.includes(lodging.id)
  const tracked = state.tracked.some((tr) => tr.key === trackKey(lodging))

  const criteria = {
    domainName: d.name,
    arrDate: state.arrDate,
    depDate: state.depDate,
    travelers: state.travelers,
    rooms: state.rooms
  }
  const searchUrl = searchUrlFor(srcOf(lodging), criteria)
  // L'annonce s'ouvre aux dates et au groupe déjà saisis : les extracteurs
  // coupent la chaîne de requête, elle serait sinon vide. Voir
  // `listingUrlWithStay`.
  const target = lodging.url
    ? listingUrlWithStay(lodging.url, srcOf(lodging), criteria)
    : searchUrl

  const close = (): void => patch({ ficheId: null })

  /** L'impression isole la fiche : le reste de l'écran n'a rien à faire sur
   *  une feuille qu'on emporte en réunion de famille. */
  const print = (): void => {
    document.documentElement.setAttribute('data-print', 'fiche')
    const off = (): void => {
      document.documentElement.removeAttribute('data-print')
      window.removeEventListener('afterprint', off)
    }
    window.addEventListener('afterprint', off)
    setTimeout(() => window.print(), 60)
  }

  return (
    <>
      <div className="scrim scrim--local" style={{ zIndex: 5 }} onClick={close} />
      <aside
        ref={ref}
        className="drawer lodging-sheet"
        style={{
          position: 'absolute',
          width: 'min(480px, 94%)',
          zIndex: 6,
          display: 'flex',
          flexDirection: 'column'
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Fiche logement"
      >
        <div className="drawer__head">
          <h3>{lodging.name}</h3>
          {lodging.skiIn && (
            <span className="lodgcard__badge lodgcard__badge--ski lodgcard__badge--inline">
              {t('badge_ski_in')}
            </span>
          )}
          <button type="button" className="iconbtn" onClick={close} aria-label="Fermer">
            <CloseIcon />
          </button>
        </div>

        <div style={{ padding: 20, display: 'grid', gap: 18 }}>
          {lodging.image ? (
            <img className="sheet__photo" src={lodging.image} alt={lodging.name} loading="lazy" decoding="async" />
          ) : (
            <div className="photogrid">
              <div className="photogrid__main">
                <span className="lodgcard__noimg">{t('lodg_no_photo')}</span>
              </div>
              <div className="photogrid__cell" />
              <div className="photogrid__cell" />
            </div>
          )}

          <p className="u-muted" style={{ margin: 0, fontSize: 13 }}>
            {[
              lodging.type,
              // 0 = non annoncé par la source (annonce Airbnb) : on l'omet.
              lodging.pers ? `${lodging.pers} pers` : null,
              lodging.ch ? `${lodging.ch} ch` : null,
              lodging.m2 ? `${lodging.m2} m²` : null,
              `${lodging.note}/5 (${lodging.avis} avis)`
            ]
              .filter(Boolean)
              .join(' · ')}{' '}
            · {lodging.src}
          </p>

          <div className="inset">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color:
                    lodging.priceConfidence === 'total_confirmed'
                      ? 'var(--ok)'
                      : lodging.priceConfidence === 'partial'
                        ? 'var(--warn)'
                        : undefined
                }}
              >
                {lodging.priceConfidence === 'partial' ? `À partir de ${eur(lodging.total)}` : eur(lodging.total)}
              </span>
              <span className="u-muted" style={{ fontSize: 12 }}>
                {lodging.priceConfidence === 'total_confirmed'
                  ? 'confirmé pour vos dates'
                  : lodging.priceConfidence === 'partial'
                    ? 'tarif d’appel'
                    : 'tout compris'}{' '}
                · {nights} nuits · {state.travelers} pers.
              </span>
              <span className="u-spacer" />
              <span style={{ fontSize: 14 }}>
                {eur(lodging.pp)}{' '}
                <span className="u-muted" style={{ fontSize: 11 }}>
                  /pers/nuit
                </span>
              </span>
            </div>

            <div className="breakdown">
              <div>
                <span className="u-muted">
                  {nights} nuits × {fmt(Math.round(base / nights))} €
                </span>
                <span className="u-num">{eur(base)}</span>
              </div>
              <div>
                <span className="u-muted">{t('fee_cleaning')}</span>
                <span className="u-num">{eur(CLEANING_FEE)}</span>
              </div>
              <div>
                <span className="u-muted">{t('fee_stay_tax')}</span>
                <span className="u-num">{eur(taxe)}</span>
              </div>
              <div>
                <span className="u-muted">Frais de service</span>
                <span className="u-num">{eur(service)}</span>
              </div>
            </div>

            {lodging.annul && (
              <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--ok)' }}>
                {t('free_cancel_fresh')}
              </p>
            )}
          </div>

          <div>
            <p className="sheet__label">{t('access_label')}</p>
            {/* Les métriques d'accès viennent du moteur local. Une annonce
                importée arrive sans : afficher « 0 m » ferait croire à un
                logement au bord des pistes. */}
            {lodging.dist > 0 || lodging.den > 0 || lodging.liftDist > 0 || lodging.skiIn ? (
              <dl className="sheet__dl">
                <div>
                  <dt>{t('runs_on_foot')}</dt>
                  <dd style={{ fontWeight: 700 }}>
                    {lodging.dist} m · {lodging.walk} min ·{' '}
                    {lodging.den > 0 ? `+${lodging.den}` : lodging.den < 0 ? `${lodging.den}` : '±0'} m
                  </dd>
                </div>
                <div>
                  <dt>{t('nearest_lift')}</dt>
                  <dd>
                    {lodging.lift} · {lodging.liftDist} m
                  </dd>
                </div>
                <div>
                  <dt>Altitude du logement</dt>
                  <dd>{fmt(lodging.alt)} m (IGN, calculée)</dd>
                </div>
                <div>
                  <dt>Voiture depuis {derived.hh[0]?.short ?? 'le départ'}</dt>
                  <dd>{derived.travelText(d)}</dd>
                </div>
              </dl>
            ) : (
              <p className="u-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                Distance aux pistes, dénivelé et altitude non calculés pour cette annonce importée. Le
                moteur local les déduit des tracés OpenSkiMap dès qu’il est actif ; en attendant, ouvrez
                l’annonce sur {lodging.src} pour sa localisation exacte.
              </p>
            )}
          </div>

          <div className="inset">
            <p className="sheet__label">{t('full_stay_cost')}</p>
            <div className="breakdown breakdown--flush">
              <div>
                <span className="u-muted">Logement (tout compris)</span>
                <span className="u-num">{eur(cost.lodging)}</span>
              </div>
              <div>
                <span className="u-muted">
                  Forfaits — {cost.adults} adulte(s) × {forfait.j6 != null ? eur(forfait.j6) : '—'}
                  {cost.kids ? ` + ${cost.kids} enfant(s) × ${eur(enfantPrice(forfait))}` : ''}
                </span>
                <span className="u-num">{eur(cost.forfaits)}</span>
              </div>
              <div>
                <span className="u-muted">
                  Route — {cost.cars} foyer(s) · carburant {eur(trip.fuel)}
                  {trip.tolls ? ` · péages ${eur(trip.tolls)}` : ' · sans péage'}
                </span>
                <span className="u-num">{eur(cost.route)}</span>
              </div>
              {cost.rental > 0 && (
                <div>
                  <span className="u-muted">{t('rental_6days')}</span>
                  <span className="u-num">{eur(cost.rental)}</span>
                </div>
              )}
              {cost.lessons > 0 && (
                <div>
                  <span className="u-muted">
                    Cours ESF — {lessonsCount(state.people)} inscrit(s), tarifs {d.name}
                  </span>
                  <span className="u-num">{eur(cost.lessons)}</span>
                </div>
              )}
              <div className="breakdown__total">
                <strong>Total</strong>
                <strong className="u-num">{eur(cost.total)}</strong>
              </div>
              <div>
                <span className="u-muted">soit par personne</span>
                <span className="u-num">{eur(Math.round(cost.total / state.travelers))}</span>
              </div>
            </div>

            <div className="sheet__options">
              <label className="check" style={{ margin: 0, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={state.optRental}
                  onChange={(e) => patch({ optRental: e.target.checked })}
                />
                {t('rental_option')}
              </label>
              <label className="check" style={{ margin: 0, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={state.optLessons}
                  onChange={(e) => patch({ optLessons: e.target.checked })}
                />
                Ajouter les cours de ski et de snowboard choisis par voyageurs
              </label>
            </div>

            <p className="domcard__drawer-note">
              Estimation : forfaits 6 j adultes et enfants (moins de 13 ans), carburant 0,115 €/km par
              foyer, péages selon le réglage « éviter les péages ». Repas non comptés. Trajet{' '}
              {dur(derived.worstTravel(d))}.
            </p>
          </div>
        </div>

        <div className="sheet__verified">
          <p className="sheet__label">Ce que Skitrack a vérifié</p>
          <ul className="sheet__verified-list">
            <li>
              <strong>Dates du relevé</strong>
              {' : '}
              {lodging.priceCheckIn && lodging.priceCheckOut
                ? `${lodging.priceCheckIn} → ${lodging.priceCheckOut}`
                : `${state.arrDate} → ${state.depDate}`}
              {lodging.priceCheckIn &&
              (lodging.priceCheckIn !== state.arrDate || lodging.priceCheckOut !== state.depDate) ? (
                <span style={{ color: 'var(--warn)' }}> — dates de recherche différentes</span>
              ) : (
                <span style={{ color: 'var(--ok)' }}> — alignées sur votre séjour</span>
              )}
            </li>
            <li>
              <strong>Prix</strong>
              {' : '}
              {lodging.total > 0 ? (
                <>
                  {eur(lodging.total)}
                  {lodging.priceConfidence === 'total_confirmed'
                    ? ' · confirmé pour ces dates'
                    : lodging.priceConfidence === 'partial'
                      ? ' · à partir de (tarif d’appel)'
                      : ' · à confirmer sur le site'}
                </>
              ) : (
                'non publié — ouverture de la source pour le tarif'
              )}
            </li>
            <li>
              <strong>Source</strong>
              {' : '}
              {lodging.src}
              {lodging.dups && lodging.dups.length > 0
                ? ` · aussi ${lodging.dups.map((d) => `${d.src} ${eur(d.total)}`).join(', ')}`
                : ''}
            </li>
            {(lodging.dist > 0 || lodging.skiIn) && (
              <li>
                <strong>Accès pistes</strong>
                {' : '}
                {lodging.skiIn
                  ? 'ski aux pieds'
                  : `${lodging.dist} m · ${lodging.walk} min (OpenSkiMap)`}
              </li>
            )}
            <li>
              <strong>Ouverture</strong>
              {' : '}
              l’annonce s’ouvre avec vos dates ({state.arrDate} → {state.depDate}) et {state.travelers}{' '}
              voyageur(s) préremplis quand la source le permet.
            </li>
          </ul>
        </div>

        <div className="sheet__footer">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!target}
            onClick={() => target && void window.skitrack.openExternal(target)}
          >
            {lodging.url
              ? `Ouvrir aux dates ${state.arrDate.slice(5)} → ${state.depDate.slice(5)}`
              : `Chercher sur ${srcOf(lodging)}`}
            <ExternalIcon />
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              patch({
                compareIds: inCompare
                  ? state.compareIds.filter((i) => i !== lodging.id)
                  : [...state.compareIds, lodging.id].slice(-4)
              })
            }
          >
            {inCompare ? '✓ Dans le comparateur' : '＋ Comparer'}
          </button>
          <button
            type="button"
            className="linkbtn"
            onClick={() => {
              const key = trackKey(lodging)
              if (tracked) {
                patch({ tracked: state.tracked.filter((tr) => tr.key !== key) })
              } else {
                patch({
                  tracked: [
                    ...state.tracked,
                    {
                      key,
                      name: lodging.name,
                      src: lodging.src,
                      total: lodging.total,
                      pp: lodging.pp,
                      domain: d.name
                    }
                  ],
                  trackedSel: state.tracked.length
                })
              }
            }}
          >
            {tracked ? '✓ Suivi' : 'Suivre le prix'}
          </button>
          <span className="u-spacer" />
          <button type="button" className="linkbtn" onClick={print}>
            Imprimer
          </button>
        </div>
      </aside>
    </>
  )
}
