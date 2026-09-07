/**
 * Hébergements réels d'un domaine, depuis OpenStreetMap.
 *
 * ## Ce que ce connecteur résout, et ce qu'il ne prétend pas résoudre
 *
 * Le besoin : **voir des annonces réelles dans SKITRACK, puis être redirigé vers
 * Airbnb**. La partie « redirection Airbnb » était déjà là (voir
 * `airbnb/airbnb.ts`). Ce qui manquait, c'était *quoi afficher*.
 *
 * Airbnb ne peut pas fournir cette liste : son `robots.txt` interdit
 * `/s/…/homes`, vérifié encore le 2026-08-12 en lançant réellement
 * `@openbnb/mcp-server-airbnb`, qui refuse la requête au lieu de la faire.
 * Aucun serveur MCP ne contourne cela — le blocage vient d'Airbnb.
 *
 * Mais on n'a pas besoin d'Airbnb pour *lister les hébergements d'une station*.
 * OpenStreetMap les cartographie : résidences de tourisme, chalets, hôtels,
 * meublés, taggés `tourism=*` par la communauté. C'est une base **ODbL**, déjà
 * utilisée par ce projet pour les domaines eux-mêmes (voir PROVIDERS.md,
 * niveau 0), donc réutilisable avec attribution. Une requête Overpass bornée à
 * l'emprise du domaine ramène ces établissements, avec leur nom et leur
 * position réelle.
 *
 * ## Pourquoi c'est le bon compromis
 *
 * * Ce sont de **vrais** hébergements, pas un catalogue simulé : le Koh-I Nor,
 *   le Fitz Roy, les résidences Pierre & Vacances de la station y sont, à leurs
 *   coordonnées exactes.
 * * **Aucun prix n'est inventé.** OSM n'a pas de tarif ; le connecteur n'en
 *   fabrique donc pas. Chaque carte est une *porte* vers Airbnb, pré-remplie du
 *   nom de l'établissement et des dates — exactement ce que vous demandez.
 * * **Aucun scraping.** Une requête à une API ouverte qui publie ses données
 *   pour être réutilisées, bornée à une zone, mise en cache. Rien n'est lu chez
 *   Airbnb.
 *
 * ## La forme de sortie
 *
 * Ces entrées ne sont pas des `Accommodation` (le modèle pivot promet un prix
 * réservable). Ce sont des **cartes-redirection** : un nom, une position, une
 * distance calculable, et une URL Airbnb. L'interface les affiche à côté des
 * offres tarifées, visuellement distinctes, jamais triées comme si elles avaient
 * un prix — la règle posée dans `airbnb/airbnb.ts` reste tenue.
 */

import { debugLog } from '../debug'
import { TtlCache, withTimeout } from '../resilience'
import { buildAirbnbSearchUrl } from '../airbnb/airbnb'

/** Miroirs Overpass, essayés dans l'ordre : le premier qui répond gagne. */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
]

const TIMEOUT_MS = 30_000
/** Les hébergements d'une station ne bougent pas d'une semaine à l'autre. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** Types `tourism=*` d'OSM qui désignent un hébergement de séjour. */
const TOURISM_LODGING = [
  'hotel',
  'apartment',
  'apartments',
  'chalet',
  'guest_house',
  'hostel',
  'resort',
  'motel'
]

/** Traduction du tag OSM vers le vocabulaire de type de l'application. */
const TYPE_LABEL: Record<string, string> = {
  hotel: 'Hôtel',
  motel: 'Hôtel',
  resort: 'Hôtel',
  hostel: 'Auberge',
  apartment: 'Appartement',
  apartments: 'Appartement',
  chalet: 'Chalet',
  guest_house: "Chambre d'hôtes"
}

export interface OsmLodgingParams {
  /** Emprise de recherche, en degrés. Vient de la bbox du domaine. */
  south: number
  west: number
  north: number
  east: number
  /** Libellé du domaine, pour la recherche Airbnb pré-remplie. */
  destination: string
  checkIn?: string
  checkOut?: string
  adults?: number
  children?: number
}

/**
 * Une annonce réelle sans prix : un hébergement cartographié, prêt à ouvrir sur
 * Airbnb. C'est délibérément la forme que consomme déjà l'import (`RawListing`
 * côté renderer), pour rejoindre la même liste sans code nouveau en aval.
 */
export interface OsmLodging {
  name: string
  type: string
  lat: number
  lon: number
  /** URL de recherche Airbnb pré-remplie du nom de l'établissement. */
  url: string
  /** Site officiel de l'établissement, quand OSM le connaît. */
  website?: string
  /** Photo, quand le tag `image` d'OSM pointe vers une URL https directe.
   *  Rare (quelques % des objets), mais gratuit quand il est là. */
  image?: string
  /** Nombre d'étoiles, quand le tag `stars` existe. */
  stars?: number
  /** Origine, toujours OSM — affiché pour l'attribution ODbL. */
  source: 'OpenStreetMap'
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

/** Construit la requête Overpass QL, bornée à l'emprise, hébergements seuls. */
export function buildOverpassQuery(params: OsmLodgingParams): string {
  const bbox = `${params.south},${params.west},${params.north},${params.east}`
  const filter = TOURISM_LODGING.join('|')
  // `nwr` = nodes + ways + relations ; `out center` donne un point pour les
  // surfaces (un hôtel est souvent un polygone, pas un point).
  return (
    `[out:json][timeout:25];` +
    `(nwr["tourism"~"^(${filter})$"](${bbox}););` +
    `out center tags 80;`
  )
}

/**
 * Transforme un élément Overpass en annonce, ou `null` s'il est inexploitable.
 *
 * Écarte tout ce qui n'a pas de nom : une carte « (sans nom) » qui ouvre une
 * recherche Airbnb du domaine entier n'apporte rien de plus que le bouton de
 * redirection global déjà présent. On ne garde que ce qui nomme un lieu précis.
 */
export function toOsmLodging(element: OverpassElement, params: OsmLodgingParams): OsmLodging | null {
  const tags = element.tags ?? {}
  const name = tags.name?.trim()
  if (!name) return null

  const lat = element.lat ?? element.center?.lat
  const lon = element.lon ?? element.center?.lon
  if (lat == null || lon == null) return null

  const tourism = tags.tourism ?? ''
  const stars = tags.stars ? Number.parseInt(tags.stars, 10) : undefined

  // Le tag `image` d'OSM est libre : on ne garde qu'une URL https directe.
  // Un nom de fichier Wikimedia (« File:… ») demanderait une résolution d'API
  // supplémentaire pour un gain marginal — écarté plutôt que deviné.
  const image = /^https:\/\//.test(tags.image ?? '') ? tags.image : undefined

  return {
    name,
    type: TYPE_LABEL[tourism] ?? 'Hébergement',
    lat,
    lon,
    // La redirection pré-remplie du **nom** : Airbnb cherche cet établissement
    // précis, aux dates du séjour. C'est le cœur de ce que vous demandez.
    url: buildAirbnbSearchUrl({
      city: `${name}, ${params.destination}`,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      adults: params.adults,
      children: params.children
    }),
    website: tags.website ?? tags['contact:website'] ?? undefined,
    image,
    stars: Number.isFinite(stars) ? stars : undefined,
    source: 'OpenStreetMap'
  }
}

const cache = new TtlCache<OsmLodging[]>(CACHE_TTL_MS)

/**
 * Interroge Overpass et rend les hébergements du domaine.
 *
 * Essaie les miroirs dans l'ordre : l'instance publique principale est parfois
 * saturée (elle renvoie alors un texte d'erreur, pas du JSON), auquel cas on
 * bascule sur le miroir suivant plutôt que d'échouer. La déduplication par nom +
 * position évite qu'un même hôtel cartographié en node *et* en way apparaisse
 * deux fois.
 */
export async function fetchOsmLodgings(params: OsmLodgingParams): Promise<OsmLodging[]> {
  const key = JSON.stringify([params.south, params.west, params.north, params.east])
  const cached = cache.get(key)
  if (cached) return cached

  const query = buildOverpassQuery(params)
  debugLog('OSM', 'Search started', { bbox: key })

  let lastError: unknown = null
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await withTimeout(
        fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            // User-Agent identifiant, comme l'exige la politique d'usage OSM.
            'User-Agent': 'SKITRACK/0.1 (comparateur de séjours au ski, usage personnel)'
          },
          body: `data=${encodeURIComponent(query)}`
        }),
        TIMEOUT_MS,
        `overpass/${endpoint}`
      )

      if (!response.ok) {
        lastError = new Error(`Overpass ${endpoint} : HTTP ${response.status}`)
        continue
      }

      const text = await response.text()
      // Overpass saturé répond par un texte d'erreur en HTTP 200 : on le
      // détecte au fait que ce n'est pas du JSON, et on passe au miroir suivant.
      let payload: { elements?: OverpassElement[] }
      try {
        payload = JSON.parse(text)
      } catch {
        lastError = new Error(`Overpass ${endpoint} : réponse non-JSON (instance saturée ?)`)
        continue
      }

      const seen = new Set<string>()
      const lodgings: OsmLodging[] = []
      for (const element of payload.elements ?? []) {
        const lodging = toOsmLodging(element, params)
        if (!lodging) continue
        const dupeKey = `${lodging.name.toLowerCase()}|${lodging.lat.toFixed(3)}|${lodging.lon.toFixed(3)}`
        if (seen.has(dupeKey)) continue
        seen.add(dupeKey)
        lodgings.push(lodging)
      }

      lodgings.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      debugLog('OSM', 'Number of normalized results', { raw: payload.elements?.length ?? 0, normalized: lodgings.length })
      cache.set(key, lodgings)
      return lodgings
    } catch (error) {
      lastError = error
      debugLog('OSM', 'Number of errors', { endpoint, message: (error as Error).message })
    }
  }

  throw new Error(
    `Aucune instance Overpass n'a répondu. ${lastError instanceof Error ? lastError.message : ''} ` +
      'Les hébergements OpenStreetMap sont momentanément indisponibles ; réessayez dans un instant.'
  )
}
