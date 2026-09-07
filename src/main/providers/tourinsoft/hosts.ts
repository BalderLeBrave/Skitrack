/**
 * Tourinsoft Connector — Les Angles (lesangles.com).
 *
 * Catalogue dumpé 2026-09-02 : `/tous-les-hebergements/`
 * `article.tsc-card.tsc-card-design[data-id]` — pers / ch. / à partir de.
 * REST `wp/v2/tsc_hebergement` : 100 fiches, sans occupancy structurée.
 * Open System 1395 = 1 produit, pas ce catalogue.
 */

export interface TourinsoftSite {
  id: string
  host: string
  origin: string
  cataloguePath: string
}

const SITES: TourinsoftSite[] = [
  {
    id: 'angles',
    host: 'lesangles.com',
    origin: 'https://lesangles.com',
    cataloguePath: '/tous-les-hebergements/'
  }
]

const BY_HOST = new Map<string, TourinsoftSite>()
for (const site of SITES) {
  BY_HOST.set(site.host, site)
  if (site.host.startsWith('www.')) BY_HOST.set(site.host.slice(4), site)
  else BY_HOST.set(`www.${site.host}`, site)
}

function hostOf(urlOrHost: string): string | null {
  const raw = urlOrHost.trim().toLowerCase()
  if (!raw) return null
  try {
    if (raw.includes('://') || raw.startsWith('//')) {
      return new URL(raw.startsWith('//') ? `https:${raw}` : raw).hostname
    }
    return raw
  } catch {
    return null
  }
}

export function tourinsoftSiteOf(urlOrHost: string): TourinsoftSite | null {
  const host = hostOf(urlOrHost)
  if (!host) return null
  return BY_HOST.get(host) ?? null
}

export function isTourinsoftHost(urlOrHost: string): boolean {
  return tourinsoftSiteOf(urlOrHost) != null
}

export const TOURINSOFT_SITES = SITES
