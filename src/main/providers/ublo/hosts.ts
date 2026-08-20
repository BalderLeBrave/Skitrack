/**
 * Centrales Ublo / MSEM (Mon Séjour En Montagne).
 *
 * Next.js + widget lodging : liste `GET /api/lodging/resort/{id}/{channel}`,
 * tarifs datés `POST /api/lodging/resort/{id}/offers`. Pas de Playwright.
 */

export interface UbloSite {
  id: 'alpedhuez' | 'saintefoy' | 'sfl'
  /** Hôte canonique (sans www si le site n’en sert pas). */
  host: string
  origin: string
  channel: string
  resort: number
  lang: 'fr' | 'en'
  /** Préfixe de chemin CMS (`/fr` à Sainte-Foy). */
  pathPrefix: string
}

const SITES: UbloSite[] = [
  {
    id: 'alpedhuez',
    host: 'reservation.alpedhuez.com',
    origin: 'https://reservation.alpedhuez.com',
    channel: 'OT-125',
    resort: 125,
    lang: 'fr',
    pathPrefix: ''
  },
  {
    id: 'saintefoy',
    host: 'www.saintefoy-reservation.com',
    origin: 'https://www.saintefoy-reservation.com',
    channel: 'OT-595',
    resort: 595,
    lang: 'fr',
    pathPrefix: '/fr'
  },
  {
    id: 'sfl',
    host: 'reservation.saintfrancoislongchamp.com',
    origin: 'https://reservation.saintfrancoislongchamp.com',
    channel: 'OT-SFL',
    resort: 566,
    lang: 'fr',
    pathPrefix: ''
  }
]

const BY_HOST = new Map<string, UbloSite>()
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
    if (raw.includes('/') || raw.includes('?')) {
      return new URL(`https://${raw}`).hostname
    }
    return raw
  } catch {
    return null
  }
}

export function ubloSiteOf(urlOrHost: string): UbloSite | null {
  const host = hostOf(urlOrHost)
  if (!host) return null
  return BY_HOST.get(host) ?? null
}

export function isUbloHost(urlOrHost: string): boolean {
  return ubloSiteOf(urlOrHost) != null
}

export const UBLO_SITES = SITES
