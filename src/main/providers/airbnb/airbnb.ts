/**
 * Airbnb — module de redirection uniquement.
 *
 * ## Pourquoi ce module ne fait aucune requête
 *
 * Airbnb n'expose **aucune API publique** : leur programme partenaire est fermé
 * aux nouveaux entrants depuis des années. La seule voie technique serait de
 * lire leurs pages, et leur `robots.txt` l'interdit explicitement pour le
 * chemin de recherche :
 *
 *     Disallow: /s/*&#47;*        ← couvre /s/<ville>/homes
 *
 * Vérifié en conditions réelles le 2026-08-12 : une requête sur
 * `/s/Val-Thorens--France/homes` est refusée, tout comme `/rooms/<id>`, par le
 * serveur `@openbnb/mcp-server-airbnb` appliquant ce `robots.txt`.
 *
 * Ce module construit donc **une URL, et rien d'autre**. Aucun `fetch`, aucun
 * sous-processus, aucune lecture de page. L'utilisateur clique, son navigateur
 * ouvre Airbnb, et c'est Airbnb qui lui montre ses prix — ce qui est le
 * fonctionnement normal du web, hors du champ de `robots.txt`.
 *
 * Conséquence assumée côté interface : **on n'a pas de prix**. La carte Airbnb
 * doit donc être visuellement distincte des fiches chiffrées, et jamais triée
 * parmi elles comme si elle était comparable. Voir `aggregate()`.
 */

import type { RedirectResult, SearchParams } from '../types'

/** Airbnb attend un segment de ville, pas un paramètre de requête. */
function citySegment(city: string): string {
  return encodeURIComponent(city.trim().replace(/\s*,\s*/g, '--').replace(/\s+/g, '-'))
}

export interface AirbnbUrlParams {
  city: string
  checkIn?: string
  checkOut?: string
  adults?: number
  children?: number
  infants?: number
  pets?: number
  minPrice?: number
  maxPrice?: number
  bedrooms?: number
}

/**
 * Construit l'URL de recherche pré-remplie. **Fonction pure** : aucune I/O,
 * testable sans réseau.
 */
export function buildAirbnbSearchUrl(params: AirbnbUrlParams): string {
  const query = new URLSearchParams()
  if (params.checkIn) query.set('checkin', params.checkIn)
  if (params.checkOut) query.set('checkout', params.checkOut)
  if (params.adults != null) query.set('adults', String(params.adults))
  if (params.children) query.set('children', String(params.children))
  if (params.infants) query.set('infants', String(params.infants))
  if (params.pets) query.set('pets', String(params.pets))
  if (params.minPrice != null) query.set('price_min', String(Math.round(params.minPrice)))
  if (params.maxPrice != null) query.set('price_max', String(Math.round(params.maxPrice)))
  if (params.bedrooms != null) query.set('min_bedrooms', String(params.bedrooms))

  const suffix = query.toString()
  return `https://www.airbnb.fr/s/${citySegment(params.city)}/homes${suffix ? `?${suffix}` : ''}`
}

/**
 * Entrée « redirection » de l'agrégat. Ce n'est délibérément pas un
 * `Accommodation` : le modèle normalisé promet un logement identifié, celui-ci
 * n'est qu'une porte vers une recherche.
 */
export function airbnbRedirect(params: SearchParams): RedirectResult {
  return {
    kind: 'redirect',
    source: 'airbnb',
    label: 'Airbnb',
    title: 'Voir les logements sur Airbnb',
    url: buildAirbnbSearchUrl({
      city: params.destination,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      adults: params.adults,
      children: params.children,
      infants: params.infants,
      pets: params.pets,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice
    }),
    reason:
      'Airbnb ne publie pas d’API et interdit l’accès automatisé à ses pages de recherche. ' +
      'Les prix ne peuvent donc pas être comparés ici : la recherche s’ouvre sur leur site, pré-remplie.'
  }
}
