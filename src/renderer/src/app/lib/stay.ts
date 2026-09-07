/** Libellés du séjour, partagés par la barre, les cartes et le récapitulatif. */

import { nightsBetween } from '@/domain/format'
import type { AppState } from '@/state/appState'

export type StayState = Pick<AppState, 'arrDate' | 'depDate' | 'travelers' | 'children' | 'rooms'>

export const TRAVELERS_MAX = 12
export const ROOMS_MAX = 6

export function stayNights(s: Pick<AppState, 'arrDate' | 'depDate'>): number {
  return s.arrDate && s.depDate ? nightsBetween(s.arrDate, s.depDate) : 0
}

export function stayDatesLabel(
  s: Pick<AppState, 'arrDate' | 'depDate'>,
  fmtStay: (a: string, b: string) => string,
  nightsTxt: (n: number) => string,
  fallback: string
): string {
  if (!s.arrDate || !s.depDate) return fallback
  return `${fmtStay(s.arrDate, s.depDate)} · ${nightsTxt(stayNights(s))}`
}
