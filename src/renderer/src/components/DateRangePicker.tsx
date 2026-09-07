/**
 * Calendrier de séjour : arrivée puis départ, deux mois côte à côte.
 *
 * ## Ce qu'il remplace, et ce qu'il ne change pas
 *
 * Le segment Dates de la pilule déroulait une liste de cinq semaines figées.
 * C'était court à lire et impossible à contourner : un séjour de quatre nuits,
 * un départ un jeudi, une semaine de mars n'existaient pas. Le calendrier
 * ouvre le champ.
 *
 * Ce qu'il **n'ouvre pas**, c'est l'état : il écrit `arrDate` et `depDate`, les
 * deux mêmes chaînes ISO qu'écrivait la liste, et rien d'autre. Tout ce qui
 * lisait ces dates — nuits, coût du séjour, grille des combinaisons, relevé de
 * logements — continue de les lire sans savoir qu'un calendrier existe.
 *
 * Les cinq semaines relevées restent proposées en pied de calendrier. Ce ne
 * sont pas des raccourcis de confort : ce sont les seules semaines pour
 * lesquelles un écart de prix a été mesuré (`WEEKS[].f`, voir `data/snow.ts`).
 * Les retirer aurait rendu invisible la seule information de saisonnalité que
 * l'application possède réellement.
 *
 * ## Le geste
 *
 * Premier clic : arrivée. Second clic : départ, et la plage se ferme. Un second
 * clic **avant** l'arrivée ne produit pas une plage inversée : il recommence
 * une arrivée à cette date, parce que c'est ce que le geste veut dire.
 *
 * Le survol dessine la plage avant la validation — sans quoi on choisit un
 * départ sans voir combien de nuits on prend.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { WEEKS } from '@/data/snow'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'

/** Mois affichés côte à côte en fenêtre large. */
const MONTHS_WIDE = 2
/** En dessous, deux mois ne tiennent plus : on n'en montre qu'un. */
const NARROW_PX = 720
/** Six rangées de sept jours couvrent tout mois, quel que soit son premier jour. */
const WEEKS_SHOWN = 6

interface Props {
  /** Arrivée courante, ISO `YYYY-MM-DD`. */
  arr: string
  /** Départ courant, ISO `YYYY-MM-DD`. */
  dep: string
  /** Appelé une fois la plage complète — jamais sur un choix partiel. */
  onChange: (arr: string, dep: string) => void
  onClose: () => void
}

/* ------------------------------------------------------------------ *
 * Dates. Tout se fait à midi : une date à minuit bascule d'un jour au
 * changement d'heure, et le calendrier afficherait alors la veille.
 * ------------------------------------------------------------------ */

function parseIso(iso: string): Date | null {
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function toIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date)
  out.setDate(out.getDate() + days)
  return out
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12)
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 12)
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function nightsBetweenDates(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/**
 * Grille d'un mois : six rangées de sept jours, lundi en tête.
 *
 * Les jours des mois voisins sont rendus, en atténué : une grille tronquée fait
 * sauter la première ligne d'un mois à l'autre, et l'œil perd le repère des
 * colonnes.
 */
function monthGrid(month: Date): Date[] {
  const first = startOfMonth(month)
  // `getDay()` compte dimanche = 0 ; la semaine française commence lundi.
  const offset = (first.getDay() + 6) % 7
  const start = addDays(first, -offset)
  return Array.from({ length: WEEKS_SHOWN * 7 }, (_, i) => addDays(start, i))
}

export function DateRangePicker({ arr, dep, onChange, onClose }: Props): JSX.Element {
  const { locale } = useFormat()
  const { t } = useI18n()

  const today = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  }, [])

  const arrDate = parseIso(arr)
  const depDate = parseIso(dep)

  /** Arrivée posée, en attente d'un départ. `null` = plage complète affichée. */
  const [anchor, setAnchor] = useState<Date | null>(null)
  const [hover, setHover] = useState<Date | null>(null)
  /** Jour sous le curseur clavier : c'est lui qui reçoit le focus. */
  const [cursor, setCursor] = useState<Date>(() => arrDate ?? today)
  const [firstMonth, setFirstMonth] = useState<Date>(() => startOfMonth(arrDate ?? today))
  const [months, setMonths] = useState(() =>
    typeof window === 'undefined' || window.innerWidth >= NARROW_PX ? MONTHS_WIDE : 1
  )
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onResize = (): void => setMonths(window.innerWidth >= NARROW_PX ? MONTHS_WIDE : 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Le focus entre dans la grille à l'ouverture : sans cela, les flèches
  // pilotent la page derrière le popover et le calendrier paraît inerte.
  useEffect(() => {
    gridRef.current?.querySelector<HTMLButtonElement>('[data-cursor="true"]')?.focus()
    // Une seule fois, à l'ouverture : replacer le focus à chaque rendu
    // empêcherait de sortir du calendrier à la tabulation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const weekdays = useMemo(() => {
    // Un lundi quelconque sert de point de départ ; seul le jour de la semaine
    // compte, et l'année n'apparaît nulle part.
    const monday = new Date(2024, 0, 1, 12)
    return Array.from({ length: 7 }, (_, i) =>
      addDays(monday, i).toLocaleDateString(locale, { weekday: 'narrow' })
    )
  }, [locale])

  /** Bornes de la plage à peindre : la sélection posée, ou celle en cours. */
  const painted = useMemo((): { from: Date; to: Date } | null => {
    if (anchor) {
      const end = hover && hover > anchor ? hover : null
      return end ? { from: anchor, to: end } : { from: anchor, to: anchor }
    }
    return arrDate && depDate && depDate > arrDate ? { from: arrDate, to: depDate } : null
  }, [anchor, hover, arr, dep]) // eslint-disable-line react-hooks/exhaustive-deps

  const nights = painted ? nightsBetweenDates(painted.from, painted.to) : 0

  const isPast = (day: Date): boolean => day < today

  const pick = (day: Date): void => {
    if (isPast(day)) return
    // Pas d'arrivée en attente, ou clic avant l'arrivée posée : on (re)commence
    // une arrivée. Une plage inversée n'a pas de sens et le geste dit autre
    // chose — « finalement, je pars de ce jour-là ».
    if (!anchor || day <= anchor) {
      setAnchor(day)
      setHover(null)
      setCursor(day)
      return
    }
    onChange(toIso(anchor), toIso(day))
    setAnchor(null)
    setHover(null)
    onClose()
  }

  const moveCursor = (days: number): void => {
    const next = addDays(cursor, days)
    setCursor(next)
    if (anchor && next > anchor) setHover(next)
    // Le calendrier suit le curseur : sortir du dernier mois affiché sans
    // faire défiler laisserait le focus sur un jour invisible.
    const last = addMonths(firstMonth, months - 1)
    if (next < firstMonth) setFirstMonth(startOfMonth(next))
    else if (next >= addMonths(last, 1)) setFirstMonth(addMonths(startOfMonth(next), -(months - 1)))
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7
    }
    if (e.key in step) {
      e.preventDefault()
      moveCursor(step[e.key])
      return
    }
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      const next = addMonths(cursor, e.key === 'PageUp' ? -1 : 1)
      setCursor(next)
      setFirstMonth(startOfMonth(next))
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(cursor)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Le focus suit le curseur clavier une fois la grille active.
  useEffect(() => {
    const active = gridRef.current?.querySelector<HTMLButtonElement>('[data-cursor="true"]')
    if (active && gridRef.current?.contains(document.activeElement)) active.focus()
  }, [cursor, firstMonth])

  const dayClass = (day: Date, month: Date): string => {
    const classes = ['dp__day']
    if (day.getMonth() !== month.getMonth()) classes.push('dp__day--out')
    if (isPast(day)) classes.push('dp__day--past')
    if (painted) {
      const isStart = sameDay(day, painted.from)
      const isEnd = sameDay(day, painted.to)
      if (isStart) classes.push('dp__day--start')
      if (isEnd && !isStart) classes.push('dp__day--end')
      if (day > painted.from && day < painted.to) classes.push('dp__day--in')
    }
    if (sameDay(day, today)) classes.push('dp__day--today')
    return classes.join(' ')
  }

  const shown = Array.from({ length: months }, (_, i) => addMonths(firstMonth, i))

  return (
    <div className="dp" role="group" aria-label={t('dp_title')}>
      <div className="dp__bar">
        <button
          type="button"
          className="dp__nav"
          aria-label={t('dp_prev_month')}
          onClick={() => setFirstMonth(addMonths(firstMonth, -1))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 6L9 12l5.5 6" />
          </svg>
        </button>
        <strong className="dp__state">
          {anchor ? t('dp_pick_departure') : nights > 0 ? t('dp_nights').replace('{n}', String(nights)) : t('dp_pick_arrival')}
        </strong>
        <button
          type="button"
          className="dp__nav"
          aria-label={t('dp_next_month')}
          onClick={() => setFirstMonth(addMonths(firstMonth, 1))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.5 6l5.5 6-5.5 6" />
          </svg>
        </button>
      </div>

      {/* Un seul gestionnaire de clavier pour toute la grille : la navigation
          est celle du calendrier, pas celle de quarante-deux boutons. */}
      <div className="dp__months" ref={gridRef} onKeyDown={onKey} onMouseLeave={() => setHover(null)}>
        {shown.map((month) => (
          <div className="dp__month" key={month.toISOString()}>
            <div className="dp__caption">
              {month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
            </div>
            <div className="dp__weekdays" aria-hidden>
              {weekdays.map((day, i) => (
                <span key={i}>{day}</span>
              ))}
            </div>
            <div className="dp__grid" role="grid">
              {monthGrid(month).map((day) => {
                const iso = toIso(day)
                const isCursor = sameDay(day, cursor)
                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    className={dayClass(day, month)}
                    // Un seul jour est atteignable à la tabulation : la
                    // navigation entre jours est aux flèches, comme partout
                    // ailleurs dans un calendrier.
                    tabIndex={isCursor ? 0 : -1}
                    data-cursor={isCursor ? 'true' : undefined}
                    disabled={isPast(day)}
                    aria-label={day.toLocaleDateString(locale, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                    aria-current={sameDay(day, today) ? 'date' : undefined}
                    onMouseEnter={() => anchor && setHover(day)}
                    onFocus={() => setCursor(day)}
                    onClick={() => pick(day)}
                  >
                    {day.getDate()}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Semaines relevées : les seules dont l'écart de prix est mesuré. */}
      <div className="dp__weeks">
        <span className="dp__weeks-label">{t('dp_measured_weeks')}</span>
        {WEEKS.map((w) => (
          <button
            key={w.arr}
            type="button"
            className={`chip${w.arr === arr && w.dep === dep ? ' chip--on' : ''}`}
            onClick={() => {
              onChange(w.arr, w.dep)
              setAnchor(null)
              onClose()
            }}
          >
            {w.label}
          </button>
        ))}
      </div>
    </div>
  )
}
