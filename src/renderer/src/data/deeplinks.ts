/**
 * Recherches pré-remplies sur les sites d'origine.
 *
 * Tant que les connecteurs partenaires ne sont pas ouverts, c'est le chemin
 * honnête vers l'offre réelle : l'application construit l'URL avec les critères
 * déjà saisis plutôt que de laisser l'utilisateur les ressaisir sur chaque
 * site, et l'ouvre dans le navigateur système.
 *
 * Une offre simulée n'a pas d'annonce à ouvrir — il n'existe pas de page
 * derrière elle. Le bouton mène donc à la **recherche** correspondante sur la
 * source, et son libellé le dit. Ouvrir une URL d'annonce fabriquée donnerait
 * une page 404 en faisant croire à un bug.
 */

import { nightsBetween, slug } from '@/domain/format'
import { stationBookingOf, stationNameOf } from '@/data/stations'

export interface StayCriteria {
  domainName: string
  arrDate: string
  depDate: string
  travelers: number
  rooms: number
  /**
   * Site officiel connu du moteur local, pour les domaines absents de la table
   * vérifiée de `data/stations.ts`. Facultatif : les appelants qui n'ont pas de
   * domaine sous la main s'en passent.
   */
  officialUrl?: string | null
}

export interface DeepLink {
  name: string
  url: string
  /** Site officiel de la station, par opposition à une plateforme de location. */
  official?: boolean
  /** Adresse effectivement obtenue à la vérification. Voir `data/stations.ts`. */
  verified?: boolean
}

type Builder = (c: StayCriteria) => string

/**
 * Destination envoyée aux moteurs de réservation.
 *
 * Le nom du **domaine** ne s'y cherche pas : « Vars – Risoul, La Forêt Blanche »
 * ou « Alpe d'Huez Grand Domaine » ne sont pas des destinations, ce sont des
 * périmètres skiables. C'est le nom de la **station** qu'il faut, et il est
 * aligné sur `tools/skitrack_v25.py` pour que l'application et le collecteur
 * désignent la même chose. Voir `data/stations.ts`.
 */
function destination(c: StayCriteria): string {
  return stationNameOf(c.domainName) || c.domainName
}

/**
 * Le slug n'a sa place que dans un **segment de chemin**.
 *
 * Airbnb range la destination dans l'URL elle-même — `/s/val-thorens/homes` —
 * et attend bien la forme abrégée. Partout ailleurs la destination est une
 * *valeur de paramètre*, et les sites y attendent le nom tel qu'on l'écrit :
 * « Val d'Isère », pas « val-d-isere ». Booking notamment résout cette valeur
 * contre son index de destinations ; un slug ne s'y retrouve pas et renvoie sa
 * page d'erreur au lieu d'une recherche.
 *
 * D'où `URL` + `searchParams` : l'encodage est fait par la plateforme, une
 * apostrophe ou un accent ne peuvent plus casser l'URL, et l'ordre des
 * paramètres reste lisible.
 */
const BUILDERS: Record<string, Builder> = {
  Airbnb: (c) => {
    const u = new URL(`https://www.airbnb.fr/s/${slug(destination(c))}/homes`)
    u.searchParams.set('checkin', c.arrDate)
    u.searchParams.set('checkout', c.depDate)
    u.searchParams.set('adults', String(c.travelers))
    u.searchParams.set('min_bedrooms', String(c.rooms))
    return u.toString()
  },
  // Chemin et noms de paramètres alignés sur `webscrape/urls.ts`, qui est le
  // constructeur réellement exercé contre le site.
  'Gîtes de France': (c) => {
    const u = new URL('https://www.gites-de-france.com/fr/search')
    u.searchParams.set('search[value]', destination(c))
    u.searchParams.set('search[from]', c.arrDate)
    u.searchParams.set('search[to]', c.depDate)
    u.searchParams.set('search[capacity]', String(c.travelers))
    return u.toString()
  },
  'Booking.com': (c) => {
    const u = new URL('https://www.booking.com/searchresults.fr.html')
    u.searchParams.set('ss', destination(c))
    u.searchParams.set('checkin', c.arrDate)
    u.searchParams.set('checkout', c.depDate)
    u.searchParams.set('group_adults', String(c.travelers))
    u.searchParams.set('no_rooms', String(Math.max(1, c.rooms)))
    u.searchParams.set('selected_currency', 'EUR')
    return u.toString()
  },
  // Méta-moteur : il agrège des plateformes déjà interrogées ici, mais ratisse
  // aussi des agences locales qu'aucune autre source ne porte. Chemin et noms
  // de paramètres alignés sur `webscrape/urls.ts`.
  cozycozy: (c) => {
    const u = new URL('https://www.cozycozy.com/fr/search')
    u.searchParams.set('location', destination(c))
    u.searchParams.set('checkin', c.arrDate)
    u.searchParams.set('checkout', c.depDate)
    u.searchParams.set('adults', String(c.travelers))
    u.searchParams.set('nights', String(nightsBetween(c.arrDate, c.depDate)))
    return u.toString()
  },
  Expedia: (c) => {
    const u = new URL('https://www.expedia.fr/Hotel-Search')
    u.searchParams.set('destination', destination(c))
    u.searchParams.set('startDate', c.arrDate)
    u.searchParams.set('endDate', c.depDate)
    u.searchParams.set('adults', String(c.travelers))
    u.searchParams.set('rooms', String(Math.max(1, c.rooms)))
    return u.toString()
  }
}

/** Sources proposées dans le panneau de filtres. */
export const DEEPLINK_SOURCES = ['Airbnb', 'Gîtes de France', 'Booking.com', 'Expedia', 'cozycozy']

/** Libellé du lien vers la centrale de réservation de la station. */
export const OFFICIAL_SOURCE = 'Site officiel de la station'

/**
 * Lien vers la centrale de réservation de la station, `null` si aucune connue.
 *
 * L'adresse mène au **moteur de réservation** de la station quand il y en a un
 * — `reservation.les2alpes.com`, `booking.chamonix.com` — et à son site
 * institutionnel sinon. La distinction compte : le premier porte l'inventaire,
 * le second une page d'accueil.
 *
 * L'URL n'est pas pré-remplie des dates, contrairement aux plateformes : chaque
 * centrale a son propre format de paramètres. Les offres, elles, sont bien
 * relevées aux dates du séjour — par le connecteur `station-web`, qui interroge
 * la même adresse (voir `main/providers/station/station.ts`). Ce lien est la
 * porte d'entrée manuelle vers ce que ce connecteur ramène.
 */
export function officialLink(criteria: StayCriteria): DeepLink | null {
  const site = stationBookingOf(criteria.domainName, criteria.officialUrl)
  if (!site) return null
  return { name: OFFICIAL_SOURCE, url: site.url, official: true, verified: site.verified }
}

/**
 * Recherches pré-remplies, site officiel de la station en tête.
 *
 * En tête parce que c'est la source qui a le plus de chances de tenir un
 * appartement que les plateformes n'ont pas, et parce que c'est la seule qui
 * réserve sans intermédiaire.
 */
export function deepLinks(criteria: StayCriteria): DeepLink[] {
  const official = officialLink(criteria)
  const platforms = DEEPLINK_SOURCES.map((name) => ({ name, url: BUILDERS[name](criteria) }))
  return official ? [official, ...platforms] : platforms
}

/** Recherche correspondant à la source d'une offre, `null` si inconnue. */
export function searchUrlFor(source: string, criteria: StayCriteria): string | null {
  const builder = BUILDERS[source]
  return builder ? builder(criteria) : null
}

/**
 * Paramètres de séjour à recoller sur une URL d'annonce, par source.
 *
 * Les extracteurs coupent la chaîne de requête (`href.split('?')[0]`) : c'est
 * juste, parce que celle des cartes de résultats porte des identifiants de bloc
 * et de session qui périment en quelques minutes. Mais l'URL nue perd du même
 * coup les dates et le nombre de voyageurs, et l'annonce s'ouvre sur un
 * calendrier vide qu'il faut ressaisir — alors que l'application les connaît.
 *
 * On les recolle donc à l'ouverture, sous les noms attendus par chaque site.
 */
/** `YYYY-MM-DD` → `JJ/MM/AAAA` (format des centrales Ingénie). */
function frenchDateParam(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

const STAY_PARAMS: Record<string, (c: StayCriteria) => Record<string, string>> = {
  'Booking.com': (c) => ({
    checkin: c.arrDate,
    checkout: c.depDate,
    group_adults: String(c.travelers),
    no_rooms: String(Math.max(1, c.rooms)),
    selected_currency: 'EUR'
  }),
  Expedia: (c) => ({
    startDate: c.arrDate,
    endDate: c.depDate,
    adults: String(c.travelers)
  }),
  Airbnb: (c) => ({
    check_in: c.arrDate,
    check_out: c.depDate,
    adults: String(c.travelers)
  }),
  /**
   * Centrales de station (Ingénie et assimilés).
   * Sans ces params, la fiche s'ouvre avec un calendrier vide et il faut
   * re-cliquer « Rechercher » pour voir le prix du séjour.
   */
  [OFFICIAL_SOURCE]: (c) => {
    const from = frenchDateParam(c.arrDate)
    const to = frenchDateParam(c.depDate)
    const nights = String(Math.max(1, nightsBetween(c.arrDate, c.depDate)))
    return {
      datedeb: from,
      datefin: to,
      duree: nights,
      personnes: String(Math.max(1, c.travelers)),
      adultes: String(Math.max(1, c.travelers))
    }
  },
  /** Orchestra / Ceto — hash #s_checkinDate (voir listingUrlWithStay). */
  'Chamonix Réservation': (c) => ({
    s_checkinDate: c.arrDate,
    s_checkoutDate: c.depDate,
    s_channel: 'CMB'
  })
}

/**
 * URL d'annonce enrichie des critères du séjour.
 *
 * Les paramètres déjà présents sur l'URL sont respectés : la source sait mieux
 * que nous ce qu'elle y a mis. Une URL illisible est renvoyée telle quelle
 * plutôt que de faire échouer l'ouverture.
 */
export function listingUrlWithStay(url: string, source: string, criteria: StayCriteria): string {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()

    // Orchestra / Ceto : dates dans le hash (#s_checkinDate=…).
    const orchestra =
      source === 'Chamonix Réservation' ||
      host === 'booking.chamonix.com' ||
      host.endsWith('.booking.chamonix.com') ||
      host === 'reservations.meribel.net' ||
      host === 'www.laplagneresort.com' ||
      host === 'laplagneresort.com'

    const build =
      STAY_PARAMS[source] ||
      (orchestra ? STAY_PARAMS['Chamonix Réservation'] : null) ||
      // Centrales Ingénie / réservation.* sans label exact → params site officiel
      (/^reservation\./i.test(host) || /location.*\.com$/i.test(host)
        ? STAY_PARAMS[OFFICIAL_SOURCE]
        : null)

    if (!build) return url
    const params = build(criteria)

    if (orchestra) {
      const hash = new URLSearchParams(u.hash.startsWith('#') ? u.hash.slice(1) : u.hash)
      for (const [key, value] of Object.entries(params)) {
        if (value && !hash.has(key)) hash.set(key, value)
      }
      if (!hash.has('s_channel') && host.includes('chamonix')) hash.set('s_channel', 'CMB')
      u.hash = hash.toString()
      return u.toString()
    }

    for (const [key, value] of Object.entries(params)) {
      if (value && !u.searchParams.has(key)) u.searchParams.set(key, value)
    }
    return u.toString()
  } catch {
    return url
  }
}
