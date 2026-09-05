/**
 * Canonicalisation d'URL d'annonce — identité du bien, hors tracking.
 *
 * Le hash d'offre (dates + voyageurs) est un autre contrat : ces paramètres
 * ne rentrent pas dans l'identité du logement.
 */

export interface CanonicalUrl {
  host: string
  path: string
  query: string
  full: string
}

const MOBILE_ALIASES = ['m.', 'mobile.', 'touch.'] as const

const KNOWN_LISTING_HOSTS = [
  'airbnb.com',
  'airbnb.fr',
  'booking.com',
  'abritel.fr',
  'vrbo.com',
  'expedia.fr',
  'expedia.com',
  'hotels.com',
  'gites-de-france.com'
]

/** Clés de requête qui portent l'identité du bien, par hôte. */
export const KEEP_QUERY_BY_HOST: Record<string, readonly string[]> = {
  // la plupart des fiches portent l'id dans le chemin
}

export function isKnownMobileAlias(host: string): boolean {
  const lower = host.toLowerCase()
  for (const alias of MOBILE_ALIASES) {
    if (!lower.startsWith(alias)) continue
    const rest = lower.slice(alias.length)
    if (KNOWN_LISTING_HOSTS.some((h) => rest === h || rest.endsWith(`.${h}`))) return true
  }
  return false
}

export function getKeepQueryKeys(host: string, override?: readonly string[]): readonly string[] {
  if (override) return override
  return KEEP_QUERY_BY_HOST[host] ?? []
}

export function canonicalizeUrl(url: string, keepQueryKeys?: readonly string[]): CanonicalUrl {
  try {
    const parsed = new URL(url)
    parsed.protocol = 'https:'

    let host = parsed.hostname.toLowerCase()
    for (const alias of MOBILE_ALIASES) {
      if (host.startsWith(alias) && isKnownMobileAlias(host)) {
        host = host.slice(alias.length)
        break
      }
    }
    if (host.startsWith('www.')) host = host.slice(4)
    parsed.hostname = host

    let path = parsed.pathname
    try {
      path = decodeURIComponent(path)
    } catch {
      /* chemin déjà décodé ou mal formé : on garde */
    }
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
    parsed.pathname = path || '/'

    const keep = getKeepQueryKeys(host, keepQueryKeys)
    const params = new URLSearchParams()
    for (const key of keep) {
      const value = parsed.searchParams.get(key)
      if (value != null) params.set(key, value)
    }
    const qs = params.toString()
    parsed.search = qs
    parsed.hash = ''

    return {
      host: parsed.hostname,
      path: parsed.pathname,
      query: qs ? `?${qs}` : '',
      full: parsed.toString()
    }
  } catch {
    return { host: '', path: '', query: '', full: url }
  }
}
