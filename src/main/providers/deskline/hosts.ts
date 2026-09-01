/**
 * Deskline / Feratel DW5 — ids dumpés 2026-09-01 (La Clusaz).
 *
 * Session : en-tête `DW-SessionId` = `Q` + Date.now() (format widget).
 * Recherche datée : POST /searches (adults, dateFrom, dateTo).
 * Plancher chambres : POST /filters `bedrooms: number[]` (List<Int16>).
 */

export interface DesklineSite {
  id: string
  host: string
  client: string
  origin: string
  listPath: string
}

const SITES: DesklineSite[] = [
  {
    id: 'clusaz',
    host: 'www.laclusaz.com',
    client: 'laclusaz',
    origin: 'https://www.laclusaz.com',
    listPath: '/reservation/hebergements'
  }
]

const BY_HOST = new Map<string, DesklineSite>()
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

export function desklineSiteOf(urlOrHost: string): DesklineSite | null {
  const host = hostOf(urlOrHost)
  if (!host) return null
  return BY_HOST.get(host) ?? null
}

export function isDesklineHost(urlOrHost: string): boolean {
  return desklineSiteOf(urlOrHost) != null
}

export const DESKLINE_SITES = SITES
