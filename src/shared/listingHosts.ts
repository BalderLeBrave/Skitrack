/**
 * Politique produit : CozyCozy est interdit (agrégateur Airbnb / Booking / Gîtes).
 * Airbnb, Booking, Abritel et Gîtes de France restent lisibles.
 *
 * Les solveurs captcha (sidecar `CaptchaSolver` / 2captcha) et l'évasion WAF
 * (Playwright stealth, proxies, empreinte Chrome) restent en place. Ce fichier
 * ne les concerne pas — il ne décide que si une URL *peut* être ouverte.
 */
export const FORBIDDEN_LISTING_HOSTS = ['cozycozy.com', 'www.cozycozy.com'] as const

/**
 * Cette adresse relève-t-elle d'un hôte interdit ?
 */
export function isForbiddenListingHost(url: string | undefined): boolean {
  if (!url) return false
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    return host === 'cozycozy.com' || host.endsWith('.cozycozy.com')
  } catch {
    return false
  }
}
