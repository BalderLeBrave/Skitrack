/**
 * Section « Ces logements sont écartés ».
 *
 * L'écran Logements applique deux règles avant tout filtre choisi : une annonce
 * listée doit être réservable et porter un tarif vérifié pour ces dates. Jusque
 * là, ce qui n'y répondait pas disparaissait sans un mot — la source annonçait
 * douze offres, l'écran en montrait quatre, et rien ne rendait compte de l'écart.
 *
 * Trois principes, et le troisième est le plus important :
 *
 *  1. Le motif vient d'`availabilityOf`, celui-là même qui a servi à écarter.
 *     Rien n'est redevine ici.
 *  2. La donnée qui explique le motif est montrée à côté : les dates réellement
 *     tarifées, la distance aux pistes. Un motif sans sa preuve ne vaut pas
 *     mieux qu'un « indisponible » sec.
 *  3. **Aucun prix n'est affiché.** C'est précisément parce que le tarif ne vaut
 *     pas pour ce séjour que l'annonce est écartée ; le montrer ici le
 *     réhabiliterait. `ResultCard` reçoit donc `price={null}`.
 */

import { ResultCard } from './ResultCard'
import { ResultGrid } from './ResultGrid'
import type { RejectedLodging } from '@/state/selectors'
import { srcOf } from '@/data/lodgings'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { useApp } from '@/state/appState'

/** Ancre du saut depuis le compteur de la barre de filtres. */
export const REJECTED_ANCHOR = 'lodg-rejected'

const REASON_KEY: Record<string, TranslationKey> = {
  gone: 'lodg_reason_gone',
  unpriced: 'lodg_reason_unpriced',
  other_dates: 'lodg_reason_other_dates'
}

export function RejectedLodgings({
  rejected,
  compact,
  dense
}: {
  rejected: RejectedLodging[]
  compact: boolean
  dense: boolean
}): JSX.Element | null {
  const { t } = useI18n()
  const { fmt, fmtStay } = useFormat()
  const { state } = useApp()

  if (rejected.length === 0) return null

  return (
    <section id={REJECTED_ANCHOR} className="lodgrej" aria-label={t('lodg_rejected_title')}>
      <div className="lodgrej__head">
        <h3 className="lodgrej__title">
          {t('lodg_rejected_title')}{' '}
          <span className="lodgrej__count u-num">
            {t('lodg_rejected_count').replace('{n}', String(rejected.length))}
          </span>
        </h3>
        <p className="lodgrej__sub">{t('lodg_rejected_sub')}</p>
      </div>

      <ResultGrid compact={compact} dense={dense} ratio="square">
        {rejected.map(({ lodging: lg, verdict }) => {
          // `reason` peut être nul quand le statut vaut « gone » sans motif
          // détaillé : on retombe alors sur le statut lui-même, jamais sur un
          // libellé générique inventé.
          const key = REASON_KEY[verdict.reason ?? verdict.status]
          const badge = key ? t(key) : null

          /** Les dates pour lesquelles un tarif a bien été relevé, s'il y en a. */
          const pricedFor =
            lg.priceCheckIn && lg.priceCheckOut ? fmtStay(lg.priceCheckIn, lg.priceCheckOut) : null

          return (
            <ResultCard
              key={lg.id}
              title={lg.name}
              place={srcOf(lg)}
              factLeft={lg.dist > 0 ? t('lodg_dist_to_runs').replace('{n}', fmt(lg.dist)) : undefined}
              // Pas de prix sur un écarté : c'est la règle de la section.
              price={null}
              dimmed
              ratio="square"
              placeholder={lg.name}
              image={lg.photo || null}
              badges={badge ? <span className="lodgrej__badge">{badge}</span> : undefined}
              ariaLabel={`${lg.name} — ${badge ?? ''}`}
            >
              {verdict.reason === 'other_dates' && pricedFor && (
                <p className="lodgrej__why">
                  {t('lodg_reason_priced_for').replace('{d}', pricedFor)}
                  <br />
                  {t('lodg_reason_stay_asked').replace(
                    '{d}',
                    fmtStay(state.arrDate, state.depDate)
                  )}
                </p>
              )}
              {verdict.reason === 'unpriced' && (
                <p className="lodgrej__why">{t('avail_reason_unpriced')}</p>
              )}
              {verdict.reason === 'gone' && <p className="lodgrej__why">{t('lodg_gone_notice')}</p>}
            </ResultCard>
          )
        })}
      </ResultGrid>
    </section>
  )
}
