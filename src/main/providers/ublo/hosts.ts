/**
 * Centrales Ublo / MSEM (Mon Séjour En Montagne).
 *
 * Next.js + widget lodging : liste `GET /api/lodging/resort/{id}/{channel}`,
 * tarifs datés `POST /api/lodging/resort/{id}/offers`. Pas de Playwright.
 */

export interface UbloSite {
  id: string
  /** Hôte canonique (sans www si le site n’en sert pas). */
  host: string
  origin: string
  channel: string
  resort: number
  lang: 'fr' | 'en'
  /** Préfixe de chemin CMS (`/fr` à Sainte-Foy). */
  pathPrefix: string
  /**
   * Page d'accueil du widget MSEM quand le CMS n'a pas `/hebergements/{slug}`
   * (WordPress Isola / Valberg / Montclar / Écrins).
   */
  listingPage?: string
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
  },
  {
    id: 'villardlans',
    host: 'reservation.villarddelans-correnconenvercors.com',
    origin: 'https://reservation.villarddelans-correnconenvercors.com',
    channel: 'OTVDL',
    resort: 30002,
    lang: 'fr',
    pathPrefix: ''
  },
  {
    id: 'isola',
    host: 'isola2000.com',
    origin: 'https://isola2000.com',
    channel: 'ISOLA',
    resort: 386,
    lang: 'fr',
    pathPrefix: '',
    listingPage: 'https://isola2000.com/reservez-votre-sejour/'
  },
  {
    id: 'valberg',
    host: 'www.valberg.com',
    origin: 'https://www.valberg.com',
    channel: 'OT-665',
    resort: 665,
    lang: 'fr',
    pathPrefix: '',
    listingPage: 'https://www.valberg.com/sejourner/reserver-votre-sejour/'
  },
  {
    id: 'montclar',
    host: 'www.montclar.com',
    origin: 'https://www.montclar.com',
    channel: 'OT-276',
    resort: 276,
    lang: 'fr',
    pathPrefix: '',
    listingPage: 'https://www.montclar.com/'
  },
  {
    id: 'ecrins',
    host: 'www.paysdesecrins.com',
    origin: 'https://www.paysdesecrins.com',
    channel: 'PDE',
    resort: 30015,
    lang: 'fr',
    pathPrefix: '',
    listingPage: 'https://www.paysdesecrins.com/hebergements/'
  },
  {
    id: 'leman',
    host: 'www.leman-mountains-explore.com',
    origin: 'https://www.leman-mountains-explore.com',
    channel: 'LEMAN_MOUNTAINS',
    resort: 30016,
    lang: 'fr',
    pathPrefix: '',
    listingPage: 'https://www.leman-mountains-explore.com/reserver/sejour-hebergements/'
  },
  {
    id: 'oz',
    host: 'www.oz-en-oisans.com',
    origin: 'https://www.oz-en-oisans.com',
    channel: 'OT-523',
    resort: 523,
    lang: 'fr',
    pathPrefix: '',
    listingPage: 'https://www.oz-en-oisans.com/ete/sejour/je-reserve-mon-sejour/reserver-mon-hebergement-2/'
  },
  {
    id: 'villardreculas',
    host: 'reservation.villard-reculas.com',
    origin: 'https://reservation.villard-reculas.com',
    channel: 'OT-702',
    resort: 702,
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
