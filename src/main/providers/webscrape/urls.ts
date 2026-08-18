/** Construction d’URL de recherche pré-remplies (scrapers web). */

import type { SearchParams } from '../types'

function nights(params: SearchParams): number {
  if (!params.checkIn || !params.checkOut) return 1
  const a = Date.parse(params.checkIn)
  const b = Date.parse(params.checkOut)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1
  return Math.max(1, Math.round((b - a) / 86_400_000))
}

export function bookingSearchUrl(params: SearchParams): string {
  const u = new URL('https://www.booking.com/searchresults.fr.html')
  u.searchParams.set('ss', params.destination)
  if (params.checkIn) u.searchParams.set('checkin', params.checkIn)
  if (params.checkOut) u.searchParams.set('checkout', params.checkOut)
  u.searchParams.set('group_adults', String(params.adults ?? 2))
  u.searchParams.set('group_children', String(params.children ?? 0))
  u.searchParams.set('no_rooms', '1')
  u.searchParams.set('selected_currency', 'EUR')
  // Pas de `latitude`/`longitude` : Booking ne borne pas sa recherche sur ces
  // paramètres-là, il les ignore. Les poser donnait l'illusion d'une recherche
  // géographique alors que seule la chaîne `ss` était lue — et une chaîne comme
  // « Les Arcs » ramène aussi bien la Savoie que la Gironde. Le rattachement au
  // domaine est vérifié en aval, sur les coordonnées des résultats
  // (`keepInZone`, providers/index.ts).
  return u.toString()
}

export function expediaSearchUrl(params: SearchParams): string {
  const u = new URL('https://www.expedia.fr/Hotel-Search')
  u.searchParams.set('destination', params.destination)
  if (params.checkIn) u.searchParams.set('startDate', params.checkIn)
  if (params.checkOut) u.searchParams.set('endDate', params.checkOut)
  u.searchParams.set('adults', String(params.adults ?? 2))
  u.searchParams.set('rooms', '1')
  return u.toString()
}

export function gitesSearchUrl(params: SearchParams): string {
  // Recherche texte Gîtes de France
  const u = new URL('https://www.gites-de-france.com/fr/search')
  u.searchParams.set('search[value]', params.destination)
  if (params.checkIn) u.searchParams.set('search[from]', params.checkIn)
  if (params.checkOut) u.searchParams.set('search[to]', params.checkOut)
  u.searchParams.set('search[capacity]', String(params.adults ?? 2))
  return u.toString()
}

export function cozycozySearchUrl(params: SearchParams): string {
  // CozyCozy — méta-moteur locations vacances
  const u = new URL('https://www.cozycozy.com/fr/search')
  u.searchParams.set('location', params.destination)
  if (params.checkIn) u.searchParams.set('checkin', params.checkIn)
  if (params.checkOut) u.searchParams.set('checkout', params.checkOut)
  u.searchParams.set('adults', String(params.adults ?? 2))
  if (params.children) u.searchParams.set('children', String(params.children))
  u.searchParams.set('nights', String(nights(params)))
  return u.toString()
}
