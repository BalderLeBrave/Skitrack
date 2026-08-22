/**
 * Centrales LocVacances / Arkiane (Pralognan…).
 *
 * Listing : GET `{origin}/fr-FR/`
 * Tarif daté : POST `{origin}/fr-FR/Lot/Detail` (startDate/endDate jj/mm/aaaa).
 */

export interface LocvacancesSite {
  id: string
  host: string
  origin: string
  city: string
}

const SITES: LocvacancesSite[] = [
  {
    id: 'pralognan',
    host: 'www.reservationpralognan.fr',
    origin: 'https://reservationpralognan.locvacances.com',
    city: 'Pralognan-la-Vanoise'
  }
]

const BY_HOST = new Map<string, LocvacancesSite>()
for (const site of SITES) {
  BY_HOST.set(site.host, site)
  BY_HOST.set('reservationpralognan.locvacances.com', site)
  BY_HOST.set('www.reservationpralognan.com', site)
  BY_HOST.set('reservationpralognan.com', site)
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

export function locvacancesSiteOf(urlOrHost: string): LocvacancesSite | null {
  const host = hostOf(urlOrHost)
  if (!host) return null
  return BY_HOST.get(host) ?? null
}
