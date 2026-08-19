/**
 * Gestion des **blocages calendrier Airbnb**.
 *
 * Airbnb n’expose pas les dates bloquées via API. On détecte côté page :
 * - jours `data-is-day-blocked="true"` / aria-disabled
 * - messages « ces dates ne sont pas disponibles »
 * - résultats vides avec texte d’indisponibilité
 *
 * Et on propose un **décalage** vers le prochain week-end samedi→samedi
 * (ou N jours plus tard) pour retenter la recherche URL-based.
 */

import type { Page } from 'playwright'

export interface CalendarDate {
  year: number
  month: number // 1-12
  day: number
}

export function parseIso(iso: string): CalendarDate {
  const [y, m, d] = iso.split('-').map(Number)
  return { year: y!, month: m!, day: d! }
}

export function toIso(d: CalendarDate): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

export function addDaysIso(iso: string, days: number): string {
  const dt = new Date(iso + 'T12:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/** Prochain samedi à partir de `fromIso` (inclus si déjà samedi). */
export function nextSaturday(fromIso: string): string {
  const dt = new Date(fromIso + 'T12:00:00Z')
  const day = dt.getUTCDay() // 0 dim … 6 sam
  const add = day === 6 ? 0 : (6 - day + 7) % 7
  dt.setUTCDate(dt.getUTCDate() + add)
  return dt.toISOString().slice(0, 10)
}

export function saturdayWeekRange(fromIso: string, weeksAhead = 0): {
  checkIn: string
  checkOut: string
} {
  let start = nextSaturday(fromIso)
  if (weeksAhead > 0) start = addDaysIso(start, weeksAhead * 7)
  return { checkIn: start, checkOut: addDaysIso(start, 7) }
}

/** Messages / sélecteurs indiquant des dates indisponibles. */
const DATE_BLOCK_TEXT = [
  /ces dates ne sont pas disponibles/i,
  /dates non disponibles/i,
  /those dates (are|aren.?t) (not )?available/i,
  /selected dates (are|aren.?t) available/i,
  /no availability/i,
  /aucune disponibilit/i,
  /pas de disponibilit/i,
  /choisissez d.?autres dates/i,
  /try different dates/i,
  /change (your )?dates/i
]

/**
 * Détecte un message de blocage dates sur la page (hors CAPTCHA).
 */
export async function detectDateBlockMessage(page: Page): Promise<string | null> {
  try {
    const text = await page.evaluate(() => (document.body?.innerText || '').slice(0, 12_000))
    for (const re of DATE_BLOCK_TEXT) {
      const m = text.match(re)
      if (m) return m[0]
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Lit les jours bloqués visibles dans un calendrier ouvert (si présent).
 * Retourne des ISO YYYY-MM-DD.
 */
export async function readBlockedDaysFromOpenCalendar(page: Page): Promise<string[]> {
  try {
    return await page.evaluate(() => {
      const out: string[] = []
      const nodes = document.querySelectorAll(
        '[data-testid^="calendar-day-"][data-is-day-blocked="true"], ' +
          '[data-testid^="calendar-day-"][aria-disabled="true"], ' +
          'td[data-date][class*="disabled"], ' +
          '[data-date][aria-disabled="true"]'
      )
      nodes.forEach((el) => {
        const testId = el.getAttribute('data-testid')
        if (testId?.startsWith('calendar-day-')) {
          out.push(testId.replace('calendar-day-', ''))
          return
        }
        const dataDate = el.getAttribute('data-date')
        if (dataDate) out.push(dataDate)
      })
      return [...new Set(out)]
    })
  } catch {
    return []
  }
}

/**
 * Un séjour [checkIn, checkOut) est-il impacté par des jours bloqués connus ?
 * (intersection stricte sur les nuits)
 */
export function rangeHitsBlocked(
  checkIn: string,
  checkOut: string,
  blocked: string[]
): boolean {
  if (blocked.length === 0) return false
  const set = new Set(blocked)
  let cur = checkIn
  while (cur < checkOut) {
    if (set.has(cur)) return true
    cur = addDaysIso(cur, 1)
  }
  return false
}

export interface ShiftDatesOptions {
  /** Nombre max de week-ends à tester en avant. Défaut 8. */
  maxWeeks?: number
  /** Jours bloqués connus (ISO). */
  blockedDays?: string[]
  /** Point de départ (défaut = checkIn demandé). */
  fromIso?: string
}

/**
 * Trouve le prochain séjour samedi→samedi qui n’intersecte pas les jours bloqués.
 * Si aucun blocage connu, décale simplement de `weekOffset` semaines.
 */
export function shiftToAvailableWeekend(
  checkIn: string,
  checkOut: string,
  opts: ShiftDatesOptions = {}
): { checkIn: string; checkOut: string; weeksShifted: number } {
  const maxWeeks = opts.maxWeeks ?? 8
  const blocked = opts.blockedDays ?? []
  const duration =
    Math.round(
      (new Date(checkOut + 'T12:00:00Z').getTime() -
        new Date(checkIn + 'T12:00:00Z').getTime()) /
        86_400_000
    ) || 7

  const startBase = opts.fromIso ?? checkIn

  for (let w = 0; w <= maxWeeks; w++) {
    const start = nextSaturday(addDaysIso(startBase, w === 0 ? 0 : w * 7))
    // si w=0 et startBase n'est pas samedi, nextSaturday avance déjà
    const actualStart =
      w === 0 && startBase === checkIn && checkIn === nextSaturday(checkIn)
        ? checkIn
        : w === 0
          ? nextSaturday(startBase)
          : nextSaturday(addDaysIso(startBase, w * 7))
    const end = addDaysIso(actualStart, duration)
    if (!rangeHitsBlocked(actualStart, end, blocked)) {
      return { checkIn: actualStart, checkOut: end, weeksShifted: w }
    }
  }

  // fallback : +maxWeeks semaines sans filtre
  const fb = saturdayWeekRange(startBase, maxWeeks)
  return { checkIn: fb.checkIn, checkOut: fb.checkOut, weeksShifted: maxWeeks }
}

export interface DateBlockDiagnosis {
  blocked: boolean
  message: string | null
  blockedDaysSample: string[]
  suggestion?: { checkIn: string; checkOut: string; weeksShifted: number }
}

/**
 * Diagnostic après une recherche à 0 résultat : dates bloquées ou autre cause.
 */
export async function diagnoseEmptySearch(
  page: Page,
  checkIn: string,
  checkOut: string
): Promise<DateBlockDiagnosis> {
  const message = await detectDateBlockMessage(page)
  const blockedDaysSample = await readBlockedDaysFromOpenCalendar(page)
  const blocked =
    Boolean(message) || rangeHitsBlocked(checkIn, checkOut, blockedDaysSample)

  const suggestion = blocked
    ? shiftToAvailableWeekend(checkIn, checkOut, {
        blockedDays: blockedDaysSample,
        fromIso: checkIn
      })
    : undefined

  return {
    blocked,
    message,
    blockedDaysSample: blockedDaysSample.slice(0, 31),
    suggestion
  }
}
