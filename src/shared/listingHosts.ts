/**
 * Politique produit : aucune OTA n'est sur liste noire.
 *
 * Airbnb, Booking, VRBO / Abritel et Gîtes de France sont lisibles.
 * `FORBIDDEN_LISTING_HOSTS` reste exporté (écran Logements, import par URL)
 * mais vide : un hôte parsable n'est jamais « interdit ».
 *
 * Les solveurs captcha (sidecar `CaptchaSolver` / 2captcha) et l'évasion WAF
 * (Playwright stealth, proxies, empreinte Chrome) restent en place. Ce fichier
 * ne les concerne pas — il ne décide que si une URL *peut* être ouverte.
 */
export const FORBIDDEN_LISTING_HOSTS = [] as const

/**
 * Cette adresse relève-t-elle d'un hôte interdit ?
 *
 * Rend `false` sur une URL parsable, et `false` aussi sur une URL illisible :
 * une adresse qu'on ne sait pas analyser n'est pas une adresse interdite.
 */
export function isForbiddenListingHost(url: string | undefined): boolean {
  if (!url) return false
  try {
    new URL(url)
  } catch {
    return false
  }
  return false
}
