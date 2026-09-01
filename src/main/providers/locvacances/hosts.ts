/**
 * LocVacances — Pralognan (reservationpralognan.fr).
 *
 * Session PHP : cookie de `/reservation/resultats/`, dates via
 * `ajax.req.4g.php?id=dd|df|criteres`. Liste : `id=getListe` + `page`.
 * Dump 2026-09-01 (froid) + getFiche 2026-09-02.
 */

export interface LocvacancesSite {
  id: string
  host: string
  origin: string
  listPath: string
}

const SITES: LocvacancesSite[] = [
  {
    id: 'pralognan',
    host: 'www.reservationpralognan.fr',
    origin: 'https://www.reservationpralognan.fr',
    listPath: '/reservation/resultats/'
  }
]

const BY_HOST = new Map<string, LocvacancesSite>()
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

export function locvacancesSiteOf(urlOrHost: string): LocvacancesSite | null {
  const host = hostOf(urlOrHost)
  if (!host) return null
  return BY_HOST.get(host) ?? null
}

export function isLocvacancesHost(urlOrHost: string): boolean {
  return locvacancesSiteOf(urlOrHost) != null
}

export const LOCVACANCES_SITES = SITES
