/**
 * Dernier recours de la recherche : les stations les plus proches d'un lieu.
 *
 * ## Quand ce chemin sert
 *
 * L'index des lieux couvre les stations, leurs villages et leurs domaines. Il
 * ne couvre pas la France entière : taper « Bourg-en-Bresse », « Annecy » ou le
 * nom d'un hameau qui n'est rattaché à rien ne ramène rien, et une recherche
 * qui ne ramène rien sans rien dire est un cul-de-sac.
 *
 * Ce module transforme ce cul-de-sac en réponse : le lieu est géocodé, puis on
 * classe les stations par distance à vol d'oiseau. « Stations proches d'Annecy :
 * La Clusaz (32 km)… » vaut mieux que le vide.
 *
 * ## Pourquoi cette API-là
 *
 * `data.geopf.fr/geocodage` est l'API Adresse de la Géoplateforme (IGN), déjà
 * référencée par le projet : elle figure dans le `connect-src` de la politique
 * de sécurité de `renderer/index.html`, aux côtés des fonds de carte IGN. Aucun
 * hôte nouveau n'est introduit, et rien n'est demandé au moteur local — ce
 * chemin fonctionne moteur arrêté, ce qui est justement le cas où l'on cherche
 * à tâtons.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne filtre pas sur un rayon. Une commune du Nord rendra les stations les
 * plus proches, à trois cents kilomètres, et la distance sera affichée : c'est
 * à l'utilisateur de juger, pas à l'application de décider qu'il s'est trompé.
 * Il ne réordonne rien non plus quand l'index a répondu — il n'est consulté
 * qu'à vide.
 */

import type { Station } from './skiAreas'
import { hasCoords } from './referentiel'
import { distanceKm } from '@shared/geo'

/** API Adresse de la Géoplateforme (IGN). Déjà autorisée par la CSP. */
const GEOCODE_URL = 'https://data.geopf.fr/geocodage/search/'

/** Au-delà, la liste cesse d'aider : on ne propose pas vingt stations. */
const MAX_STATIONS = 5

export interface NearbyStation {
  station: Station
  /** Distance à vol d'oiseau depuis le lieu géocodé, en kilomètres. */
  km: number
}

export interface NearbyResult {
  /** Le lieu tel que le géocodeur l'a compris — affiché, jamais deviné. */
  label: string
  stations: NearbyStation[]
}

interface GeoFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: { label?: string; city?: string; postcode?: string }
}

/** Libellé court : la commune et son code postal distinguent deux homonymes. */
function shortLabel(feature: GeoFeature): string {
  const props = feature.properties ?? {}
  const town = props.city ?? props.label?.split(',')[0]?.trim() ?? ''
  return props.postcode && town ? `${town} (${props.postcode})` : town || (props.label ?? '')
}

/**
 * Stations les plus proches du lieu cherché, ou `null` si le lieu est inconnu.
 *
 * Lève sur panne réseau : l'appelant distingue « lieu introuvable » (`null`)
 * d'« impossible de chercher », et ne peut pas afficher le second comme le
 * premier.
 */
export async function stationsNear(
  query: string,
  stations: Station[],
  options: { max?: number; signal?: AbortSignal } = {}
): Promise<NearbyResult | null> {
  const q = query.trim()
  if (q.length < 3) return null

  const url = new URL(GEOCODE_URL)
  url.searchParams.set('q', q)
  url.searchParams.set('limit', '1')
  // `municipality` plutôt qu'une adresse : on cherche une commune, et demander
  // un numéro de rue ferait remonter des adresses exactes pour un nom de lieu.
  url.searchParams.set('type', 'municipality')
  url.searchParams.set('index', 'address')

  const response = await fetch(url.toString(), { signal: options.signal })
  if (!response.ok) throw new Error(`Géoplateforme : HTTP ${response.status}`)

  const payload = (await response.json()) as { features?: GeoFeature[] }
  const feature = payload.features?.[0]
  const coordinates = feature?.geometry?.coordinates
  if (!feature || !coordinates || coordinates.length < 2) return null

  const [lon, lat] = coordinates
  const ranked = stations
    .filter(hasCoords)
    .map((station) => ({ station, km: Math.round(distanceKm(lat, lon, station.lat, station.lon)) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, options.max ?? MAX_STATIONS)

  return { label: shortLabel(feature), stations: ranked }
}
