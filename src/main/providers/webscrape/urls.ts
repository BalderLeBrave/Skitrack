/** Construction d’URL de recherche pré-remplies (scrapers web). */

import type { SearchParams } from '../types'

/**
 * Recherche Booking, page par page.
 *
 * `offset` est le rang du premier résultat demandé, et c'est le paramètre que
 * Booking pose lui-même dans ses liens « page suivante ». Sans lui, le relevé
 * ne voyait **que la première page** — vingt-cinq biens, quel que soit
 * l'inventaire réel de la station. Ce n'était pas un filtre trop serré, c'était
 * une collecte qui s'arrêtait au premier écran.
 *
 * Zéro ne se transmet pas : la première page s'obtient sans paramètre, comme
 * quand on tape l'adresse à la main.
 */
export function bookingSearchUrl(params: SearchParams, offset = 0): string {
  const u = new URL('https://www.booking.com/searchresults.fr.html')
  u.searchParams.set('ss', params.destination)
  if (params.checkIn) u.searchParams.set('checkin', params.checkIn)
  if (params.checkOut) u.searchParams.set('checkout', params.checkOut)
  u.searchParams.set('group_adults', String(params.adults ?? 2))
  u.searchParams.set('group_children', String(params.children ?? 0))
  /*
   * `no_rooms` reste à 1, et ce n'est pas un oubli.
   *
   * Chez Booking, ce paramètre est le nombre d'**unités à réserver**, pas le
   * nombre de chambres du logement. Y poser `params.bedrooms` ferait chercher
   * quatre chambres d'hôtel séparées là où l'utilisateur demande un chalet de
   * quatre chambres — deux séjours différents, et deux prix sans rapport.
   *
   * Booking n'expose pas de filtre « au moins N chambres » dans l'URL de
   * recherche. Ce connecteur ignore donc `bedrooms`, comme il ignore tout ce
   * que sa source ne sait pas traduire ; le critère reste appliqué en aval.
   */
  u.searchParams.set('no_rooms', '1')
  u.searchParams.set('selected_currency', 'EUR')
  if (offset > 0) u.searchParams.set('offset', String(offset))
  // Pas de `latitude`/`longitude` : Booking ne borne pas sa recherche sur ces
  // paramètres-là, il les ignore. Les poser donnait l'illusion d'une recherche
  // géographique alors que seule la chaîne `ss` était lue — et une chaîne comme
  // « Les Arcs » ramène aussi bien la Savoie que la Gironde. Le rattachement au
  // domaine est vérifié en aval, sur les coordonnées des résultats
  // (`keepInZone`, providers/index.ts).
  return u.toString()
}

/**
 * Page suivante d'une recherche Expedia. `startIndex` est le rang du premier
 * résultat, pas le numéro de page — c'est ce que le site pose lui-même.
 */
export function expediaSearchUrl(params: SearchParams, offset = 0): string {
  const u = new URL('https://www.expedia.fr/Hotel-Search')
  u.searchParams.set('destination', params.destination)
  if (params.checkIn) u.searchParams.set('startDate', params.checkIn)
  if (params.checkOut) u.searchParams.set('endDate', params.checkOut)
  u.searchParams.set('adults', String(params.adults ?? 2))
  // Même raison que pour Booking : « rooms » compte les unités réservées, pas
  // les chambres du bien. Voir le commentaire de `bookingSearchUrl`.
  u.searchParams.set('rooms', '1')
  if (offset > 0) u.searchParams.set('startIndex', String(offset))
  return u.toString()
}

/**
 * Recherche Abritel (marque FR, même plateforme).
 *
 * abritel.fr SERP = 429 ; le connecteur lit getResultList. Cette URL reste
 * le lien public daté (destination, dates, adultes) pour ouvrir le site.
 */
export function vrboSearchUrl(params: SearchParams, offset = 0): string {
  const u = new URL('https://www.abritel.fr/search')
  u.searchParams.set('destination', params.destination)
  if (params.checkIn) u.searchParams.set('startDate', params.checkIn)
  if (params.checkOut) u.searchParams.set('endDate', params.checkOut)
  u.searchParams.set('adults', String(params.adults ?? 2))
  if (params.children) u.searchParams.set('children', String(params.children))
  if (offset > 0) u.searchParams.set('startIndex', String(offset))
  return u.toString()
}

/**
 * Recherche Gîtes de France.
 *
 * Dump 2026-09-01 21:47 : GET `towns=50301` (id towns de l'autocomplete) ouvre
 * une SERP. GET `entity_id=` et POST `search_api_page_block_form` ne le font
 * pas (form vide / Cloudflare 403). `travelers=` est le plancher voyageurs
 * (8 → 33 résultats). Sélecteur cartes : `.js-search-tile`.
 *
 * Dump 2026-09-02 : mêmes GET pour Les Angles (`61540`, 27 résultats,
 * Playwright 20 × `.js-search-tile`), Montricher-Albanne / Karellis (`64400`,
 * 107) et Vars Hautes-Alpes (`38123`, 42). Hors dump : `destination=`.
 */
export function gitesTownsIdForDestination(destination: string): string | null {
  const n = destination
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  if (n.includes('deux alpes') || /(?:^|[^a-z0-9])2[\s-]?alpes(?:$|[^a-z0-9])/.test(n)) {
    return '50301'
  }
  // Dump 2026-09-02 : GET towns= ouvre une SERP (même contrat que Les 2 Alpes).
  // Autocomplete : Montricher-Albanne towns=64400 ; q=Karellis = pois 425067.
  if (n.includes('karellis') || n.includes('montricher')) return '64400'
  // Pyrénées-Orientales 61540, pas Hautes-Pyrénées 61077 ni Angles-sur-Corrèze 42616.
  if (/angles-sur-correze/.test(n)) return null
  if (/\bles angles\b/.test(n) || n.includes('les-angles')) return '61540'
  // Vars (Hautes-Alpes / Forêt Blanche). Pas Vars-sur-Roseix (towns=42881) ni Haute-Saône 63410.
  if (/vars-sur-roseix/.test(n)) return null
  if (/\bvars\b/.test(n) || n.includes('foret blanche')) return '38123'
  return null
}

export function cozycozySeoPathForDestination(destination: string): string | null {
  const n = destination
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  if (n.includes('deux alpes') || /(?:^|[^a-z0-9])2[\s-]?alpes(?:$|[^a-z0-9])/.test(n)) {
    return '/fr/location-vacances-les-2-alpes'
  }
  // Dump 2026-09-02 : pages SEO SSR hoj_seo_card (HTTP 200). Sans dates.
  if (n.includes('karellis')) return '/fr/location-vacances-les-karellis'
  if (/\bles angles\b/.test(n) || n.includes('les-angles')) {
    return '/fr/location-vacances-les-angles'
  }
  if (/\bvars\b/.test(n) || n.includes('foret blanche')) {
    return '/fr/location-vacances-vars'
  }
  return null
}

/**
 * Segment lieu du GET daté.
 *
 * Dump 2026-09-02 `cozy-dated-results.json` : path
 * `/fr/search/{place}/{from}/{to}/{chambres}-{adultes}-{enfants}/results`
 * lance searchInputLocation + launch + getResultList. Prix « N € pour 7 nuits ».
 *
 * Les 2 Alpes : « Les Deux Alpes station de ski, France » (URL fournie, 180 offres).
 * Méribel / Karellis / Vars / Angles : « {Nom}, France ».
 */
export function cozycozyDatedPlace(destination: string): string {
  const n = destination
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  if (n.includes('deux alpes') || /(?:^|[^a-z0-9])2[\s-]?alpes(?:$|[^a-z0-9])/.test(n)) {
    return 'Les Deux Alpes station de ski, France'
  }
  const trimmed = destination.replace(/\s+/g, ' ').trim()
  if (/,\s*france\s*$/i.test(trimmed)) return trimmed
  return `${trimmed}, France`
}

export function gitesSearchUrl(params: SearchParams, offset = 0): string {

  const u = new URL('https://www.gites-de-france.com/fr/search')
  const towns = gitesTownsIdForDestination(params.destination)
  if (towns) {
    u.searchParams.set('towns', towns)
    u.searchParams.set('travelers', String(params.adults ?? 2))
  } else {
    u.searchParams.set('destination', params.destination)
    u.searchParams.set('adults', String(params.adults ?? 2))
  }
  if (params.checkIn) u.searchParams.set('date-start', params.checkIn)
  if (params.checkOut) u.searchParams.set('date-end', params.checkOut)
  // Dump gites_towns_50301.html : Gîte only. Pas chambre d'hôtes, pas groupe.
  u.searchParams.set('f[0]', 'type:36172')
  if (params.children) u.searchParams.set('children', String(params.children))
  const page = offset + 1
  if (page > 1) u.searchParams.set('page', String(page))
  return u.toString()
}

export function cozycozySearchUrl(params: SearchParams, offset = 0): string {
  if (params.checkIn && params.checkOut) {
    const place = encodeURIComponent(cozycozyDatedPlace(params.destination))
    const bedrooms = params.bedrooms ?? 0
    const adults = params.adults ?? 2
    const children = params.children ?? 0
    // Pagination du path /results non dumpée — page 1 seulement.
    if (offset > 0) {
      /* no-op : pas de ?page= dumpé sur cette SERP */
    }
    return `https://www.cozycozy.com/fr/search/${place}/${params.checkIn}/${params.checkOut}/${bedrooms}-${adults}-${children}/results`
  }
  const seo = cozycozySeoPathForDestination(params.destination)
  if (seo) {
    // Catalogue SSR, sans dates. /fr/search?location= ne lance pas la recherche.
    return `https://www.cozycozy.com${seo}`
  }
  const u = new URL('https://www.cozycozy.com/fr/search')
  u.searchParams.set('location', params.destination)
  u.searchParams.set('adults', String(params.adults ?? 2))
  if (params.children) u.searchParams.set('children', String(params.children))
  if (params.bedrooms != null && params.bedrooms > 0) {
    u.searchParams.set('e', String(params.bedrooms))
  }
  const page = offset + 1
  if (page > 1) u.searchParams.set('page', String(page))
  return u.toString()
}
