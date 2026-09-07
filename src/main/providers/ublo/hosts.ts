/**
 * Centrales Ublo / MSEM (Mon Séjour En Montagne).
 *
 * Next.js + widget lodging : liste `GET /api/lodging/resort/{id}/{channel}`,
 * tarifs datés `POST /api/lodging/resort/{id}/offers`. Pas de Playwright.
 */

export interface UbloSite {
  id: 'alpedhuez' | 'saintefoy' | 'sfl' | 'isola' | 'valberg' | 'ecrins'
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
  },
  /*
   * Valberg — WordPress + widget MSEM, comme Isola. Ids relevés le 2026-09-01
   * sur l'appel du widget, page `/sejourner/reserver-votre-sejour/` :
   *
   *   GET services.msem.tech/api/location/map-config?r=665
   *     → {id:665, libelle:"Valberg-Beuil"}
   *   GET services.msem.tech/api/lodging/resort/665/OT-665 → 40 logements
   *   GET services.msem.tech/api/tunnel/offers/OT-665/665
   *
   * `channel` vaut `OT-665` (le motif OT-<resort> tient ici) — ce n'est pas
   * une extrapolation : c'est l'URL que le widget a appelée. `/hebergements/{slug}`
   * rend 404 ; page d'entrée dans `UBLO_ENTRY_ONLY`. Pas de parseur HTML.
   */
  {
    id: 'valberg',
    host: 'www.valberg.com',
    origin: 'https://www.valberg.com',
    channel: 'OT-665',
    resort: 665,
    lang: 'fr',
    pathPrefix: ''
  },
  /*
   * Pays des Écrins / Puy-Saint-Vincent — WordPress + plugin ws-msem.
   * Ids relevés le 2026-09-01 sur `/hebergements/` :
   *
   *   GET services.msem.tech/api/location/map-config?r=30015
   *     → {id:30015, libelle:"Pays des Ecrins"}
   *   GET services.msem.tech/api/lodging/getLodgingChannelConfig/PDE
   *   GET services.msem.tech/api/lodging/resort/30015/PDE → 186 logements
   *
   * `channel` vaut `PDE`, pas `OT-30015`. Même leçon qu'Isola : ne pas
   * extrapoler OT-<resort>. `/hebergements/{slug}` rend 404.
   */
  {
    id: 'ecrins',
    host: 'www.paysdesecrins.com',
    origin: 'https://www.paysdesecrins.com',
    channel: 'PDE',
    resort: 30015,
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
