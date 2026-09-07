/**
 * Les dates du séjour : un seul geste, un calendrier de plage.
 *
 * Remplace les deux `<input type="date">` séparés qui posaient `arrDate` et
 * `depDate` en trois endroits (onboarding, critères de recherche, panneau de
 * filtres). Deux champs distincts laissaient produire des plages inversées et
 * taisaient la contrainte du métier — les centrales de station vendent du
 * **samedi au samedi**. Ici les samedis sont marqués, et une suggestion cale
 * la plage sur la semaine correspondante sans jamais l'imposer.
 *
 * L'état global n'est modifié **qu'à la plage complète** : entre le premier
 * clic (arrivée) et le second (départ), la sélection vit en local. Les deux
 * anciens champs écrivaient chaque borne séparément, et l'état traversait des
 * plages invalides que `stayCriteriaReady` devait rattraper à l'affichage.
 *
 * Les noms de mois et de jours viennent d'`Intl` sur la locale courante — pas
 * de clés i18n pour ce que la plateforme sait déjà dire dans les deux langues.
 */

import { useState } from 'react'
import { useApp } from '@/state/appState'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import {
  isSaturdayIso,
  monthGrid,
  monthOfIso,
  saturdayWeekFrom,
  shiftMonth,
  todayIso,
  type YearMonth
} from '@/data/stayCalendar'

/** Un lundi connu, pour tirer les en-têtes de colonnes d'`Intl`. */
const A_MONDAY = Date.UTC(2024, 0, 1)

export function StayDatesField(): JSX.Element {
  const { state, patch } = useApp()
  const { fmtDay, locale } = useFormat()
  const { t } = useI18n()

  const [open, setOpen] = useState(false)
  // Arrivée en attente de son départ. `null` = aucune sélection en cours.
  const [pending, setPending] = useState<string | null>(null)
  const [view, setView] = useState<YearMonth>(
    () => monthOfIso(state.arrDate) ?? (monthOfIso(todayIso()) as YearMonth)
  )

  const today = todayIso()

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(A_MONDAY + i * 86_400_000).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })
  )
  const monthLabel = new Date(Date.UTC(view.year, view.month0, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })

  const pick = (iso: string): void => {
    if (pending == null || iso <= pending) {
      // Premier clic — ou un clic revenu en arrière, qui recommence la plage.
      setPending(iso)
      return
    }
    patch({ arrDate: pending, depDate: iso })
    setPending(null)
    setOpen(false)
  }

  /*
   * La suggestion part de la sélection en cours, sinon de la plage posée. Elle
   * ne s'affiche que si elle change quelque chose et reste réservable — une
   * semaine qui commence hier n'est pas une suggestion, c'est un regret.
   */
  const base = pending ?? state.arrDate
  const week = saturdayWeekFrom(base)
  const suggestion =
    week && week.arr >= today && !(week.arr === state.arrDate && week.dep === state.depDate)
      ? week
      : null

  const dayClass = (iso: string): string => {
    const cls = ['staycal__day']
    if (isSaturdayIso(iso)) cls.push('staycal__day--sat')
    if (pending != null) {
      if (iso === pending) cls.push('staycal__day--start')
    } else {
      if (iso === state.arrDate) cls.push('staycal__day--start')
      if (iso === state.depDate) cls.push('staycal__day--end')
      if (iso > state.arrDate && iso < state.depDate) cls.push('staycal__day--in')
    }
    return cls.join(' ')
  }

  return (
    <div className="staycal">
      <button
        type="button"
        className="field staycal__toggle"
        aria-expanded={open}
        aria-label={t('stay_edit_dates')}
        onClick={() => {
          setOpen(!open)
          setPending(null)
          const shown = monthOfIso(state.arrDate)
          if (shown) setView(shown)
        }}
      >
        <span className="u-num">
          {fmtDay(state.arrDate)} → {fmtDay(state.depDate)}
        </span>
        <span aria-hidden>▾</span>
      </button>

      {open && (
        <div className="staycal__panel">
          <div className="staycal__head">
            <button
              type="button"
              className="staycal__nav"
              aria-label={t('stay_prev_month')}
              onClick={() => setView(shiftMonth(view, -1))}
            >
              ‹
            </button>
            <span className="staycal__month">{monthLabel}</span>
            <button
              type="button"
              className="staycal__nav"
              aria-label={t('stay_next_month')}
              onClick={() => setView(shiftMonth(view, 1))}
            >
              ›
            </button>
          </div>

          <div className="staycal__grid" role="grid">
            {weekdays.map((wd) => (
              <span key={wd} className="staycal__wd" aria-hidden>
                {wd}
              </span>
            ))}
            {monthGrid(view).flat().map((iso, i) =>
              iso == null ? (
                <span key={`v${i}`} aria-hidden />
              ) : (
                <button
                  key={iso}
                  type="button"
                  className={dayClass(iso)}
                  disabled={iso < today}
                  aria-pressed={iso === state.arrDate || iso === state.depDate || iso === pending}
                  onClick={() => pick(iso)}
                >
                  {Number(iso.slice(8))}
                </button>
              )
            )}
          </div>

          <p className="staycal__hint" aria-live="polite">
            {pending == null ? t('stay_pick_arrival') : t('stay_pick_departure')}
          </p>

          {suggestion && (
            <button
              type="button"
              className="linkbtn staycal__snap"
              onClick={() => {
                patch({ arrDate: suggestion.arr, depDate: suggestion.dep })
                setPending(null)
                setOpen(false)
              }}
            >
              {t('stay_snap_week')
                .replace('{a}', fmtDay(suggestion.arr))
                .replace('{b}', fmtDay(suggestion.dep))}
            </button>
          )}
          <p className="staycal__note">{t('stay_sat_note')}</p>
        </div>
      )}
    </div>
  )
}

