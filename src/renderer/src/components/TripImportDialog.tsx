/**
 * Prévisualisation d'un séjour reçu, avant application.
 *
 * L'écran montre ce qui va remplacer la recherche courante — station, dates,
 * groupe, budget — et nomme la station telle qu'elle est **dans le référentiel
 * de cette machine**, pas telle que l'expéditeur l'a écrite : un identifiant
 * qui ne désigne rien ici doit se voir avant d'être appliqué, pas après.
 *
 * Deux issues seulement : appliquer, ou fermer. Pas de « ne plus demander » —
 * l'écran existe précisément parce qu'un séjour reçu vient de quelqu'un
 * d'autre.
 */

import { useRef } from 'react'
import { useFocusTrap } from '@/hooks/useShortcuts'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useTripShare } from '@/state/tripShare'
import { useUserData } from '@/state/userData'

export function TripImportDialog(): JSX.Element | null {
  const { t, lang } = useI18n()
  const { eur } = useFormat()
  const { patch, domains } = useApp()
  const { importTrip } = useUserData()
  const { pending, importError, dismiss } = useTripShare()
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref)

  if (!pending && !importError) return null

  const day = (iso: string): string => {
    try {
      return new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    } catch {
      return iso
    }
  }

  const domain = pending ? domains.find((d) => d.id === pending.stationId) : undefined

  const apply = (): void => {
    if (!pending) return
    void importTrip(pending)
    patch({
      selectedId: pending.stationId,
      lodgingDomainId: pending.stationId,
      arrDate: pending.dates.from,
      depDate: pending.dates.to,
      travelers: pending.party.adults + pending.party.children,
      children: pending.party.children,
      ...(pending.budget ? { budgetMax: pending.budget.max, budgetMode: pending.budget.mode } : {}),
      tab: 'recherche'
    })
    dismiss()
  }

  return (
    <>
      {/* Voile cliquable : fermer sans appliquer doit rester le geste le plus
          facile, comme sur les autres modales de l'application. */}
      <div className="scrim" style={{ zIndex: 18 }} onClick={dismiss} />
      <div
        ref={ref}
        className="modal tripimport"
        role="dialog"
        aria-modal="true"
        aria-label={t('trip_import_title')}
        style={{ zIndex: 19 }}
      >
        <h3 className="tripimport__title">{t('trip_import_title')}</h3>

        {!pending ? (
          <>
            <p className="notice notice--warn tripimport__error">{t('trip_import_invalid')}</p>
            <div className="tripimport__actions">
              <span className="u-spacer" />
              <button type="button" className="btn" onClick={dismiss}>
                {t('close')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="u-muted tripimport__lead">{t('trip_import_lead')}</p>

            <dl className="tripimport__grid">
              <div>
                <dt>{t('trip_import_resort')}</dt>
                <dd>
                  {domain ? (
                    domain.name
                  ) : (
                    <>
                      {`#${pending.stationId}`}{' '}
                      <span className="u-muted">— {t('fav_station_gone')}</span>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>{t('trip_import_label')}</dt>
                <dd>{pending.label}</dd>
              </div>
              <div>
                <dt>{t('trip_import_dates')}</dt>
                <dd className="u-num">
                  {day(pending.dates.from)} → {day(pending.dates.to)}
                </dd>
              </div>
              <div>
                <dt>{t('trip_import_party')}</dt>
                <dd className="u-num">
                  {t('trip_party')
                    .replace('{a}', String(pending.party.adults))
                    .replace('{c}', String(pending.party.children))}
                </dd>
              </div>
              <div>
                <dt>{t('trip_import_budget')}</dt>
                <dd className="u-num">
                  {pending.budget
                    ? (pending.budget.mode === 'perso' ? t('trip_budget_perso') : t('trip_budget_total')).replace(
                        '{v}',
                        eur(pending.budget.max)
                      )
                    : t('trip_no_budget')}
                </dd>
              </div>
            </dl>

            <p className="notice tripimport__warn">{t('trip_import_overwrite')}</p>

            <div className="tripimport__actions">
              <span className="u-spacer" />
              <button type="button" className="btn" onClick={dismiss}>
                {t('cancel')}
              </button>
              <button type="button" className="btn btn--primary" onClick={apply}>
                {t('trip_import_apply')}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
