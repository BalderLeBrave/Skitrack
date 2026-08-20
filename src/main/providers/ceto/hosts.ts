/**
 * Hôtes Orchestra / Ceto (hors Ingénie).
 *
 * `station-web` les ignore : pas de moteur Ingénie, réservation via ce connecteur.
 */

export const CETO_HOSTS = new Set([
  'booking.chamonix.com',
  'www.booking.chamonix.com',
  'reservations.meribel.net',
  'www.reservations.meribel.net',
  'www.laplagneresort.com',
  'laplagneresort.com',
  'megeve-booking.com',
  'www.megeve-booking.com'
])

export function isCetoHost(urlOrHost: string): boolean {
  try {
    const host = urlOrHost.includes('://')
      ? new URL(urlOrHost).hostname.toLowerCase()
      : urlOrHost.toLowerCase()
    return CETO_HOSTS.has(host)
  } catch {
    return false
  }
}

function hostOf(urlOrHost: string): string | null {
  try {
    return urlOrHost.includes('://')
      ? new URL(urlOrHost).hostname.toLowerCase()
      : urlOrHost.toLowerCase()
  } catch {
    return null
  }
}

/** Chamonix Mont-Blanc + villages de la vallée. */
export function isChamonixCentral(urlOrHost: string): boolean {
  const host = hostOf(urlOrHost)
  return host === 'booking.chamonix.com' || host === 'www.booking.chamonix.com'
}

export function isMeribelCentral(urlOrHost: string): boolean {
  const host = hostOf(urlOrHost)
  return host === 'reservations.meribel.net' || host === 'www.reservations.meribel.net'
}

export function isPlagneCentral(urlOrHost: string): boolean {
  const host = hostOf(urlOrHost)
  return host === 'www.laplagneresort.com' || host === 'laplagneresort.com'
}

export function isMegeveCentral(urlOrHost: string): boolean {
  const host = hostOf(urlOrHost)
  return host === 'megeve-booking.com' || host === 'www.megeve-booking.com'
}
