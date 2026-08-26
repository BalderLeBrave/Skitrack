/**
 * Centrales Ublo / MSEM (Mon Séjour En Montagne).
 *
 * Next.js + widget lodging : liste `GET /api/lodging/resort/{id}/{channel}`,
 * tarifs datés `POST /api/lodging/resort/{id}/offers`. Pas de Playwright.
 */

export interface UbloSite {
  id: 'alpedhuez' | 'saintefoy' | 'sfl' | 'isola'
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
  },
  /*
   * Isola 2000 — le widget MSEM est embarqué dans un WordPress, ce qui a
   * trompé la reconnaissance : elle empreinte la page d'accueil et y lit
   * « Yoplanning, WordPress ». Le moteur de réservation, lui, est bien celui-ci.
   *
   * `channel` vaut `ISOLA`, pas `OT-386` : le motif `OT-<resort>` des trois
   * sites précédents ne se généralise pas, et l'extrapoler aurait produit un
   * connecteur qui interroge un canal inexistant. Les deux valeurs sont
   * relevées sur l'appel que le widget émet lui-même, le 2026-08-26 :
   *
   *   GET services.msem.tech/api/lodging/resort/386/ISOLA?facet=0&…&language=fr
   *
   * `pathPrefix` reste vide : le catalogue vit sous la route à dièse
   * `/reservez-votre-sejour/#/lodgings`, que le connecteur n'emprunte pas — il
   * ne parle qu'à l'API.
   */
  {
    id: 'isola',
    host: 'isola2000.com',
    origin: 'https://isola2000.com',
    channel: 'ISOLA',
    resort: 386,
    lang: 'fr',
    /*
     * `pathPrefix` vide, et surtout : Isola ne publie **pas** de fiche par
     * logement. Le patron `/hebergements/{slug}` des trois sites précédents y
     * rend une 404 — la page d'entrée à ouvrir à la place est déclarée dans
     * `UBLO_ENTRY_ONLY` (`@shared/ubloUrl`), partagée avec la réparation des
     * URL déjà enregistrées. Vérifié le 2026-08-26 : le widget réécrit sa
     * propre route au chargement, viser `#/lodgings` serait illusoire.
     */
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
