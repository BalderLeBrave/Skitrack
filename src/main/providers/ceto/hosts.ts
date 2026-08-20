/**
 * Hôtes Orchestra / Ceto (hors Ingénie).
 *
 * `station-web` les ignore : pas de moteur Ingénie, réservation via ce connecteur.
 */

export const CETO_HOSTS = new Set([
  'booking.chamonix.com',
  'www.booking.chamonix.com',
  // Prochaines cibles (même famille DOM / API)
  'reservations.meribel.net',
  'www.laplagneresort.com',
  'laplagneresort.com'
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

/** Chamonix Mont-Blanc + villages de la vallée. */
export function isChamonixCentral(urlOrHost: string): boolean {
  try {
    const host = urlOrHost.includes('://')
      ? new URL(urlOrHost).hostname.toLowerCase()
      : urlOrHost.toLowerCase()
    return host === 'booking.chamonix.com' || host === 'www.booking.chamonix.com'
  } catch {
    return false
  }
}
