/**
 * Motifs d'un relevé vide, et rapport de pagination.
 *
 * Un connecteur qui rend `[]` sans motif est un mensonge : on ne sait pas si
 * la station n'a rien, si les sélecteurs sont morts, ou si un challenge a
 * fermé la porte. Ces codes sont la seule chose que l'écran et le journal
 * `station_run` ont le droit d'afficher pour un zéro.
 *
 * Pas un nouveau kit d'évasion : le résolveur CAPTCHA / WAF existant pose
 * `challenge_unresolved` quand il a été appelé et n'a pas débloqué la page.
 */

export const REASON_CODES = [
  'ok',
  'blocked',
  '0_after_parse',
  'host_forbidden',
  'selector_miss',
  'not_wired',
  'challenge_unresolved',
  'empty_inventory',
  'no_official_url',
  'delegated'
] as const

export type ReasonCode = (typeof REASON_CODES)[number]

export const STOPPED_REASONS = [
  'exhausted',
  'max_pages',
  'max_listings',
  'budget',
  'empty_page',
  'no_fresh',
  'blocked'
] as const

export type StoppedReason = (typeof STOPPED_REASONS)[number]

export interface PaginationReport {
  pagesFetched: number
  listingsFound: number
  listingsDeduped: number
  stoppedReason: StoppedReason
}

/**
 * Traduit un message d'erreur de connecteur déjà écrit dans le dépôt.
 *
 * On ne devine pas : on reconnaît les phrases que `emptyReason`, le scrape
 * Airbnb et le connecteur station posent réellement.
 */
export function classifyProviderError(message: string | null | undefined): ReasonCode {
  if (!message) return '0_after_parse'
  const m = message.toLowerCase()
  if (m.includes('[not_wired]') || m.includes('not_wired')) return 'not_wired'
  if (m.includes('[delegated]')) return 'delegated'
  if (m.includes('[no_official_url]')) return 'no_official_url'
  if (m.includes('interdit') && m.includes('hôte')) return 'host_forbidden'
  if (
    m.includes('challenge_unresolved') ||
    m.includes('captcha non résolu') ||
    m.includes('aucune clé api 2captcha')
  ) {
    return 'challenge_unresolved'
  }
  if (
    m.includes('captcha') ||
    m.includes('blocage anti-robot') ||
    m.includes('relevé refusé') ||
    m.includes('are you a robot') ||
    m.includes('bot or not') ||
    m.includes('robot ou pas robot') ||
    m.includes('attention required')
  ) {
    return 'blocked'
  }
  if (m.includes('sélecteurs') || m.includes('selecteurs')) return 'selector_miss'
  if (m.includes('stock vide') || m.includes('empty_inventory')) return 'empty_inventory'
  return '0_after_parse'
}
