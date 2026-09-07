/**
 * Diffusio / Laetis — Massif du Sancy (www.sancy.com).
 *
 * SERP datée : `/hebergement/tous-les-hebergements-sancy/?id1[d]=~from~to&id1[prestation]=resa`
 * Cartes `.list-item-TFO{id}` : capacité, commune, fiche.
 * Chambres + tarif semaine (fourchette) : fiche `/fr/fiche/hebergement-locatif/{slug}_TFO{id}/`.
 * Hôte partagé Super Besse / Mont-Dore. Dump 2026-09-01 + fiche 2026-09-02.
 */

export interface DiffusioSite {
  id: string
  host: string
  origin: string
  serpPath: string
}

const SITES: DiffusioSite[] = [
  {
    id: 'sancy',
    host: 'www.sancy.com',
    origin: 'https://www.sancy.com',
    serpPath: '/hebergement/tous-les-hebergements-sancy/'
  }
]

const BY_HOST = new Map<string, DiffusioSite>()
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

export function diffusioSiteOf(urlOrHost: string): DiffusioSite | null {
  const host = hostOf(urlOrHost)
  if (!host) return null
  return BY_HOST.get(host) ?? null
}

export function isDiffusioHost(urlOrHost: string): boolean {
  return diffusioSiteOf(urlOrHost) != null
}

export const DIFFUSIO_SITES = SITES
