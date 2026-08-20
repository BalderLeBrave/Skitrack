/**
 * Vignette d'une offre de logement.
 *
 * Hiérarchie (chantier 3) :
 *  1. photo + pastilles (prix / ski-in)
 *  2. nom + capacité
 *  3. une ligne « pistes · note · source »
 *  4. montant séjour (teinte ok/warn)
 *  5. actions secondaires au survol (comparer / suivre / annonce)
 *
 * La bande neige / remontées du domaine n'apparaît plus ici : elle appartient
 * au bandeau domaine, pas à chaque carte.
 */

import type { MouseEvent } from 'react'
import { ExternalIcon } from './Icons'
import { ResultCard } from './ResultCard'
import type { Lodging } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import { dealOf, freshnessOf, srcOf, trackKey } from '@/data/lodgings'
import { listingUrlWithStay, searchUrlFor } from '@/data/deeplinks'
import { availabilityOf } from '@/data/lodgingAvailability'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'

interface Props {
  lodging: Lodging
  median: number
  domain: Domain
  /** Rang dans la grille : les 6 premières photos partent en priorité. */
  index?: number
}

export function LodgingCard({ lodging: lg, median, domain, index = 99 }: Props): JSX.Element {
  const { t } = useI18n()
  const { eur, fmt, fmtDay } = useFormat()
  const { lang } = useI18n()
  const { state, patch } = useApp()

  const criteria = {
    domainName: domain.name,
    arrDate: state.arrDate,
    depDate: state.depDate,
    travelers: state.travelers,
    rooms: state.rooms,
    officialUrl: domain.booking ?? domain.website
  }
  const searchUrl = searchUrlFor(srcOf(lg), criteria)
  const target = lg.url ? listingUrlWithStay(lg.url, srcOf(lg), criteria) : searchUrl

  const redirect = lg.total <= 0
  const priceStale =
    !redirect &&
    lg.priceCheckIn != null &&
    (lg.priceCheckIn !== state.arrDate || lg.priceCheckOut !== state.depDate)

  const avail = availabilityOf(lg, { checkIn: state.arrDate, checkOut: state.depDate })
  const gone = avail.status === 'gone'
  const unconfirmed = avail.status === 'unconfirmed'

  const accessKnown =
    lg.accessComputed ?? (lg.dist > 0 || lg.den > 0 || lg.liftDist > 0 || lg.skiIn)

  const selected = lg.id === state.ficheId
  const inCompare = state.compareIds.includes(lg.id)
  const tracked = state.tracked.some((tr) => tr.key === trackKey(lg))
  const fresh = freshnessOf(lg, lang)
  const deal = dealOf(lg, median)
  const dups = lg.dups ?? []
  const dense = state.density === 'compact'

  const stop = (e: MouseEvent): void => e.stopPropagation()

  const toggleTrack = (): void => {
    const key = trackKey(lg)
    if (tracked) {
      patch({ tracked: state.tracked.filter((tr) => tr.key !== key) })
      return
    }
    patch({
      tracked: [
        ...state.tracked,
        { key, name: lg.name, src: lg.src, total: lg.total, pp: lg.pp, domain: domain.name }
      ],
      trackedSel: state.tracked.length
    })
  }

  const toggleCompare = (): void => {
    patch({
      compareIds: inCompare
        ? state.compareIds.filter((i) => i !== lg.id)
        : [...state.compareIds, lg.id].slice(-4)
    })
  }

  // Ligne 2 — capacité / type (pas le domaine, déjà connu sur l'écran).
  const place = [
    lg.type || null,
    lg.pers ? `${lg.pers} pers` : null,
    lg.ch ? `${lg.ch} ch` : null,
    lg.m2 ? `${lg.m2} m²` : null
  ]
    .filter(Boolean)
    .join(' · ')

  // Ligne 3 — différenciateurs : pistes · note · source.
  const factLeft = accessKnown
    ? lg.skiIn
      ? t('badge_ski_in')
      : `${fmt(lg.dist)} m des pistes`
    : t('dist_not_computed')

  const noteBits: string[] = []
  if (lg.note) {
    noteBits.push(`★ ${lg.note}`)
    if (lg.avis > 0) noteBits.push(`${lg.avis} avis`)
  }
  const factRight = [noteBits.length ? noteBits.join(' · ') : null, lg.src || null]
    .filter(Boolean)
    .join(' · ')

  const conf = lg.priceConfidence
  const partial = conf === 'partial'
  const price = redirect
    ? { amount: t('lodg_price_on_source').replace('{s}', srcOf(lg)), unit: '' }
    : {
        amount: partial ? `${t('price_from')} ${eur(lg.total)}` : eur(lg.total),
        unit: partial
          ? t('price_unit_partial').replace('{pp}', eur(lg.pp))
          : t('price_unit_confirmed').replace('{pp}', eur(lg.pp))
      }

  const priceTone: 'ok' | 'warn' | 'muted' | undefined = redirect
    ? 'muted'
    : priceStale || partial
      ? 'warn'
      : conf === 'total_confirmed'
        ? 'ok'
        : undefined

  const picked = lg.id === state.lodgPickId

  const card = (
    <ResultCard
      title={lg.name}
      place={place}
      factLeft={factLeft}
      factRight={factRight || undefined}
      price={price}
      priceTone={priceTone}
      image={lg.image ?? null}
      placeholder={domain.name}
      ratio={dense ? 'square' : 'wide'}
      imagePriority={index < 6}
      selected={selected}
      dimmed={fresh.stale || gone}
      onOpen={() => patch({ ficheId: lg.id })}
      ariaLabel={`${lg.name} — ${place || lg.src}${lg.note ? `, note ${lg.note}` : ''}${
        redirect
          ? ''
          : partial
            ? `, ${t('price_from')} ${eur(lg.total)}`
            : `, ${eur(lg.total)} ${t('price_all_in')}`
      }`}
      badges={
        <>
          {accessKnown && (
            <span
              className={`lodgcard__badge lodgcard__badge--dist${lg.skiIn ? ' lodgcard__badge--dist-ski' : ''}`}
              title={lg.skiIn ? t('badge_ski_in') : `${fmt(lg.dist)} m des pistes`}
            >
              {lg.skiIn ? t('badge_ski_in') : `${fmt(lg.dist)} m`}
            </span>
          )}
          {!redirect && conf === 'total_confirmed' && !priceStale && (
            <span
              className="lodgcard__badge lodgcard__badge--priceok"
              title={t('price_badge_confirmed_title')}
            >
              {t('price_badge_confirmed')}
            </span>
          )}
          {!redirect && (partial || priceStale) && (
            <span
              className="lodgcard__badge lodgcard__badge--pricewarn"
              title={
                priceStale ? 'Prix relevé pour d’autres dates' : t('price_badge_partial_title')
              }
            >
              {priceStale ? 'À vérifier' : t('price_badge_partial')}
            </span>
          )}
        </>
      }
    >
      <div className="lodgcard__extra">
        {priceStale && (
          <p className="lodgcard__flag lodgcard__flag--warn">
            Prix du {fmtDay(lg.priceCheckIn!)} → {fmtDay(lg.priceCheckOut!)} — plus valable pour
            vos dates.
          </p>
        )}

        {gone && <p className="lodgcard__flag lodgcard__flag--warn">{t('lodg_gone_notice')}</p>}

        {unconfirmed && avail.reason === 'unpriced' && (
          <p className="lodgcard__flag lodgcard__flag--warn">
            {t('avail_unconfirmed')} — {t('avail_reason_unpriced')}
          </p>
        )}
        {unconfirmed && avail.reason === 'other_dates' && !priceStale && (
          <p className="lodgcard__flag lodgcard__flag--warn">
            {t('avail_unconfirmed')} — {t('avail_reason_other_dates')}
          </p>
        )}

        {!redirect && !priceStale && deal && (
          <p className="lodgcard__flag" style={{ color: deal.color, fontWeight: 700 }}>
            {deal.txt}
          </p>
        )}
        {!redirect && lg.stock > 0 && lg.stock <= 2 && (
          <p className="lodgcard__flag lodgcard__flag--warn">
            Plus que {lg.stock} logement(s) à ce tarif
          </p>
        )}
        {lg.annul && (
          <p className="lodgcard__flag" style={{ color: 'var(--ok)' }}>
            Annulation gratuite
          </p>
        )}
        {dups.length > 0 && (
          <p className="lodgcard__srcs">
            <span className="lodgcard__srcwin">{srcOf(lg)}</span>
            {dups.map((x) => (
              <span key={`${x.src}-${x.total}`} className="lodgcard__srclost">
                {x.src} {eur(x.total)}
              </span>
            ))}
          </p>
        )}

        <div className="lodgcard__actions">
          <button
            type="button"
            className={`actpill${inCompare ? ' actpill--on' : ''}`}
            onClick={(e) => {
              stop(e)
              toggleCompare()
            }}
          >
            {inCompare ? '✓ Comparé' : '＋ Comparer'}
          </button>
          <button
            type="button"
            className="actpill"
            onClick={(e) => {
              stop(e)
              toggleTrack()
            }}
          >
            {tracked ? '✓ Suivi' : 'Suivre'}
          </button>
          <span className="u-spacer" />
          {target && (
            <button
              type="button"
              className="actpill actpill--strong"
              onClick={(e) => {
                stop(e)
                void window.skitrack.openExternal(target)
              }}
            >
              {unconfirmed || gone
                ? t('avail_open_anyway')
                : redirect
                  ? `Voir sur ${srcOf(lg)}`
                  : lg.url
                    ? 'Annonce'
                    : `Chercher sur ${srcOf(lg)}`}
              <ExternalIcon />
            </button>
          )}
        </div>
      </div>
    </ResultCard>
  )

  if (!picked) return card

  return (
    <div className="lodgcard__picked">
      <p className="lodgcard__pickedtag">
        {t('lodg_picked_on_map')}
        <button
          type="button"
          className="linkbtn linkbtn--sm"
          aria-label={t('lodg_picked_clear')}
          onClick={() => patch({ lodgPickId: null })}
        >
          ✕
        </button>
      </p>
      {card}
    </div>
  )
}
