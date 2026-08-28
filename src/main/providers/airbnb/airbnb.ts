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

/**
 * Emprise de carte, en degrés. Coin nord-est et coin sud-ouest.
 *
 * C'est la **même boîte** que celle sur laquelle le résultat sera filtré,
 * `domainZone()` dans `@shared/geo`. Chercher la boîte qu'on va filtrer fait
 * coïncider la question et le contrôle : il n'y a plus de place entre les deux
 * pour qu'un géocodeur glisse une autre commune.
 */
export interface AirbnbBounds {
  north: number
  south: number
  east: number
  west: number
}

export interface AirbnbUrlParams {
  city: string
  /**
   * Emprise de recherche. Quand elle est donnée, Airbnb cherche **dans le
   * rectangle** et le nom ne sert plus que d'étiquette.
   *
   * Le nom seul se géocode, et un géocodeur devine : « Arc 2000 » ramenait des
   * appartements d'Arcachon. Aucune formulation ne rend cette devinette sûre,
   * parce qu'elle reste une devinette — un rectangle, non.
   */
  bounds?: AirbnbBounds | null
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
/**
 * Niveau de zoom qui cadre une emprise, pour une carte d'environ 1 100 px.
 *
 * Airbnb accepte le rectangle mais s'en sert avec le zoom : un zoom absent ou
 * grossier lui fait élargir la vue, et il rend alors des annonces hors de la
 * boîte demandée. Borné entre 8 et 14 — au-delà, la carte est si serrée que le
 * site ne rend plus qu'une poignée d'annonces.
 */
function zoomPourEmprise(bounds: AirbnbBounds): number {
  const largeurDeg = Math.max(1e-4, Math.abs(bounds.east - bounds.west))
  // Web Mercator : à un zoom `z`, le monde fait 256 × 2^z pixels de large. Une
  // carte de `CARTE_PX` pixels montre donc 360 × CARTE_PX / (256 × 2^z) degrés,
  // qu'on inverse. Sauter ce facteur donnait trois niveaux de trop : une boîte
  // de 0,6° sortait à zoom 8, une vue de région, et Airbnb rendait alors des
  // annonces bien au-delà du rectangle demandé.
  const CARTE_PX = 1100
  const brut = Math.log2((360 * CARTE_PX) / (256 * largeurDeg))
  return Math.max(8, Math.min(14, Math.round(brut)))
}

export function buildAirbnbSearchUrl(params: AirbnbUrlParams): string {
  const query = new URLSearchParams()
  if (params.bounds) {
    // `search_by_map` est ce qui dit à Airbnb de lire le rectangle plutôt que
    // le segment de ville. Sans lui, les quatre coordonnées sont ignorées.
    query.set('ne_lat', String(params.bounds.north))
    query.set('ne_lng', String(params.bounds.east))
    query.set('sw_lat', String(params.bounds.south))
    query.set('sw_lng', String(params.bounds.west))
    query.set('zoom', String(zoomPourEmprise(params.bounds)))
    query.set('search_by_map', 'true')
  }
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
