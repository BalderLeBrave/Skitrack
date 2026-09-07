/**
 * Le calendrier du séjour : la partie qui se calcule, sans interface.
 *
 * Deux champs `<input type="date">` posaient les dates jusqu'ici, et ils
 * laissaient l'utilisateur découvrir seul la contrainte du métier : les
 * centrales de station vendent leurs semaines du **samedi au samedi**
 * (`station/station.ts` refuse une arrivée hors calendrier plutôt que de
 * rapprocher). Une plage posée mercredi → mercredi rendait donc zéro offre de
 * toutes les centrales, sans que rien ne dise pourquoi. Le calendrier montre
 * les samedis et propose la semaine correspondante — il ne force rien : les
 * plateformes, elles, acceptent n'importe quelle plage.
 *
 * Tout est calculé en UTC sur des chaînes ISO (`AAAA-MM-JJ`), la forme que
 * `AppState` stocke déjà : pas d'objet `Date` local, dont le fuseau ferait
 * glisser un jour à minuit.
 *
 *   npm run staycal:test
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

export interface YearMonth {
  year: number
  /** Mois **zéro-indexé**, comme `Date` : janvier = 0. */
  month0: number
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** `null` si la chaîne n'est pas une date ISO plausible. */
export function parseIso(iso: string): { year: number; month0: number; day: number } | null {
  const m = ISO.exec(iso)
  if (!m) return null
  const year = Number(m[1])
  const month0 = Number(m[2]) - 1
  const day = Number(m[3])
  if (month0 < 0 || month0 > 11) return null
  // Le mois fait foi : « 2027-02-30 » est un mensonge, pas un 2 mars.
  const probe = new Date(Date.UTC(year, month0, day))
  if (probe.getUTCMonth() !== month0 || probe.getUTCDate() !== day) return null
  return { year, month0, day }
}

export function addDaysIso(iso: string, days: number): string {
  const p = parseIso(iso)
  if (!p) return iso
  const d = new Date(Date.UTC(p.year, p.month0, p.day + days))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Jour de semaine, lundi = 0 … dimanche = 6 — l'ordre des colonnes du calendrier. */
export function weekdayIso(iso: string): number {
  const p = parseIso(iso)
  if (!p) return 0
  return (new Date(Date.UTC(p.year, p.month0, p.day)).getUTCDay() + 6) % 7
}

export function isSaturdayIso(iso: string): boolean {
  return parseIso(iso) != null && weekdayIso(iso) === 5
}

export function monthOfIso(iso: string): YearMonth | null {
  const p = parseIso(iso)
  return p ? { year: p.year, month0: p.month0 } : null
}

export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const d = new Date(Date.UTC(ym.year, ym.month0 + delta, 1))
  return { year: d.getUTCFullYear(), month0: d.getUTCMonth() }
}

/**
 * Le mois en grille : des semaines de sept cases, lundi en tête, `null` hors
 * du mois. C'est la forme que le rendu consomme telle quelle — la construire
 * ici la rend vérifiable, un `<td>` ne se teste pas.
 */
export function monthGrid(ym: YearMonth): (string | null)[][] {
  const first = `${ym.year}-${pad(ym.month0 + 1)}-01`
  const lead = weekdayIso(first)
  const daysInMonth = new Date(Date.UTC(ym.year, ym.month0 + 1, 0)).getUTCDate()

  const cells: (string | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${ym.year}-${pad(ym.month0 + 1)}-${pad(day)}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/**
 * La semaine samedi → samedi qui contient (ou précède au plus près) ce jour.
 *
 * Un samedi est sa propre arrivée : la suggestion pour un samedi est la
 * semaine qui **commence** ce jour-là, pas celle qui s'y termine.
 */
export function saturdayWeekFrom(iso: string): { arr: string; dep: string } | null {
  if (!parseIso(iso)) return null
  const back = (weekdayIso(iso) + 2) % 7
  const arr = addDaysIso(iso, -back)
  return { arr, dep: addDaysIso(arr, 7) }
}

/** Aujourd'hui, en ISO UTC — la borne sous laquelle un séjour n'existe plus. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`
}
