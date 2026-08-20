/**
 * Centrales Open System (gadget.open-system.fr / for-system.com IIS).
 *
 * Identifiants relevés sur les pages d’accueil (Widget.Instance) et dans
 * `vueinfo.js` (map-jsonp.open-system.fr/osform/…/vueinfo.js).
 * `login` = `produit.login` du JS d’intégration, passé à etape-rest.
 * `vueId` = `vueinfo.id` — sans lui etape-rest répond 200 items:[].
 */

export interface OpenSystemSite {
  id: string
  host: string
  origin: string
  /** Widget RecherchePartenaire / Panier. */
  integrationId: number
  login: string
  /**
   * Identifiant de catalogue OsForm (`vueinfo.id`).
   * C’est le 7ᵉ champ du pipe etape-rest. Obligatoire pour un tarif daté.
   */
  vueId: number | null
  /** Chemin map-jsonp du catalogue (titres, GPS). */
  vueinfoPath: string | null
  /** Code zone homepage (`zNNNN` de x-os-site), pour le repli HTML. */
  zone: number
  /** Zone de recherche meublés, si connue. */
  zoneRech: number | null
  /** Page listing WordPress (La Bresse) — GET opensystem_du/au/nbpers. */
  wordpressListPath?: string
}

const SITES: OpenSystemSite[] = [
  {
    id: 'toussuire',
    host: 'reservation.la-toussuire.com',
    origin: 'https://reservation.la-toussuire.com',
    integrationId: 1744,
    login: 'latoussuire',
    vueId: 1730,
    vueinfoPath: 'osform/39802/3655/8199/vueinfo.js',
    zone: 14220,
    zoneRech: 14236
  },
  {
    id: 'devoluy',
    host: 'reservation.ledevoluy.com',
    origin: 'https://reservation.ledevoluy.com',
    integrationId: 1531,
    login: 'devoluy-hautesalpes',
    vueId: 1755,
    vueinfoPath: 'osform/39120/3666/8217/vueinfo.js',
    zone: 14453,
    zoneRech: null
  },
  {
    id: 'ax',
    host: 'reservation.ax-ski.com',
    origin: 'https://reservation.ax-ski.com',
    integrationId: 1671,
    login: 'ariege',
    vueId: 1861,
    vueinfoPath: 'osform/92630/3693/8269/vueinfo.js',
    zone: 15878,
    zoneRech: 13392
  },
  {
    id: 'valmorel',
    host: 'www.valmorel.com',
    origin: 'https://reservation.valmorel.com',
    integrationId: 1369,
    login: 'valmorel',
    vueId: 1423,
    vueinfoPath: 'osform/63877/3546/7991/vueinfo.js',
    zone: 12089,
    zoneRech: 12316
  },
  {
    id: 'valmorel-resa',
    host: 'reservation.valmorel.com',
    origin: 'https://reservation.valmorel.com',
    integrationId: 1369,
    login: 'valmorel',
    vueId: 1423,
    vueinfoPath: 'osform/63877/3546/7991/vueinfo.js',
    zone: 12089,
    zoneRech: 12316
  },
  {
    id: 'labresse',
    host: 'www.labresse.net',
    origin: 'https://www.labresse.net',
    integrationId: 1736,
    login: 'hautesvosges-labresse',
    vueId: null,
    vueinfoPath: null,
    zone: 0,
    zoneRech: null,
    wordpressListPath: '/hebergements-a-la-bresse-hautes-vosges/'
  },
  {
    id: 'valfrejus',
    host: 'www.valfrejus.com',
    origin: 'https://www.valfrejus.com',
    integrationId: 1618,
    login: 'haute-maurienne',
    vueId: null,
    vueinfoPath: null,
    zone: 0,
    zoneRech: null
  },
  {
    id: 'npy',
    host: 'www.n-py.com',
    origin: 'https://www.n-py.com',
    integrationId: 1448,
    login: 'n-py',
    vueId: null,
    vueinfoPath: null,
    zone: 10298,
    zoneRech: 10015
  },
  {
    id: 'npy-resa',
    host: 'reservation.n-py.com',
    origin: 'https://reservation.n-py.com',
    integrationId: 1448,
    login: 'n-py',
    vueId: null,
    vueinfoPath: null,
    zone: 10298,
    zoneRech: 10015
  }
]

const BY_HOST = new Map<string, OpenSystemSite>()
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

export function opensystemSiteOf(urlOrHost: string): OpenSystemSite | null {
  const host = hostOf(urlOrHost)
  if (!host) return null
  return BY_HOST.get(host) ?? null
}

export function isOpenSystemHost(urlOrHost: string): boolean {
  return opensystemSiteOf(urlOrHost) != null
}

export const OPENSYSTEM_SITES = SITES
