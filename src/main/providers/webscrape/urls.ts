/** Construction d’URL de recherche pré-remplies (scrapers web). */

import type { SearchParams } from '../types'

function nights(params: SearchParams): number {
  if (!params.checkIn || !params.checkOut) return 1
  const a = Date.parse(params.checkIn)
  const b = Date.parse(params.checkOut)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1
  return Math.max(1, Math.round((b - a) / 86_400_000))
}

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
 * Recherche VRBO.
 *
 * VRBO appartient au groupe Expedia et partage sa mécanique d'URL : une
 * destination en clair, des dates, un nombre d'adultes, et un rang de départ
 * pour la pagination. Le connecteur n'existait pas — `data/providers.ts`
 * portait une entrée « VRBO » sans aucun connecteur derrière.
 *
 * `bedrooms` n'est **pas** transmis : comme chez Booking et Expedia, le
 * paramètre de chambres du site compte des unités à réserver, pas les chambres
 * du bien. Le critère reste appliqué en aval.
 */
export function vrboSearchUrl(params: SearchParams, offset = 0): string {
  const u = new URL('https://www.vrbo.com/search')
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
 * Pour une destination hors dump, on garde `destination=` (peut rester Oups).
 */
export function gitesTownsIdForDestination(destination: string): string | null {
  const n = destination
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  if (n.includes('deux alpes') || /(?:^|[^a-z0-9])2[\s-]?alpes(?:$|[^a-z0-9])/.test(n)) {
    return '50301'
  }
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
  return null
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
  if (params.children) u.searchParams.set('children', String(params.children))
  const page = offset + 1
  if (page > 1) u.searchParams.set('page', String(page))
  return u.toString()
}

export function cozycozySearchUrl(params: SearchParams, offset = 0): string {
  const seo = cozycozySeoPathForDestination(params.destination)
  if (seo) {
    // Catalogue SSR dumpé. /fr/search?location= ne lance pas la recherche.
    return `https://www.cozycozy.com${seo}`
  }
  const u = new URL('https://www.cozycozy.com/fr/search')
  u.searchParams.set('location', params.destination)
  if (params.checkIn) u.searchParams.set('checkin', params.checkIn)
  if (params.checkOut) u.searchParams.set('checkout', params.checkOut)
  u.searchParams.set('adults', String(params.adults ?? 2))
  if (params.children) u.searchParams.set('children', String(params.children))
  u.searchParams.set('nights', String(nights(params)))
  if (params.bedrooms != null && params.bedrooms > 0) {
    u.searchParams.set('e', String(params.bedrooms))
  }
  const page = offset + 1
  if (page > 1) u.searchParams.set('page', String(page))
  return u.toString()
}
