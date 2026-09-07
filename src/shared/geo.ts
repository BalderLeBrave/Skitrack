/**
 * Zone de recherche d'un domaine skiable : la construire, et vérifier ce qui en
 * revient.
 *
 * ## Pourquoi ce module existe
 *
 * Une recherche de logements partait jusqu'ici d'un **nom** — « La Plagne »,
 * « Les Arcs » — envoyé tel quel à des catalogues mondiaux. Un nom de station
 * française a des homonymes : communes, quartiers, lieux-dits, à l'autre bout
 * du pays ou à l'étranger. Les sources répondaient donc, en toute logique, des
 * logements qui n'ont rien à voir avec le domaine cherché, et rien en aval ne
 * les écartait.
 *
 * Une zone décrite en coordonnées ne souffre pas de cette ambiguïté. Ce module
 * la construit une fois, dans une unité unique — le **kilomètre** — et l'expose
 * sous les deux formes que réclament les sources : un rayon (Booking Demand,
 * LiteAPI, serveurs MCP) et une boîte englobante (Overpass).
 *
 * ## Les trois pièges, et comment ils sont évités ici
 *
 * 1. **Latitude et longitude inversées.** Les champs sont nommés (`lat`, `lon`,
 *    `south`, `west`, `north`, `east`) et jamais passés en tuple positionnel.
 * 2. **Un rayon en degrés pris pour des kilomètres.** La conversion est faite
 *    ici, une seule fois, et la longitude est corrigée par le cosinus de la
 *    latitude — à 45°, un degré de longitude ne vaut que 78 km contre 111 pour
 *    un degré de latitude. Une boîte carrée en degrés est un rectangle de 111 ×
 *    78 km sur le terrain, soit 40 % de trop d'un côté.
 * 3. **Un rayon fixe pour tous les domaines.** Les 3 Vallées font vingt-cinq
 *    kilomètres de bout en bout, un téléski des Vosges en fait deux. Le rayon
 *    est donc dérivé de la taille du domaine, pas figé.
 *
 * ## Ce que ce module ne fait pas
 *
 * Il ne corrige aucune position et n'en invente aucune. Un logement dont la
 * source ne publie pas les coordonnées ne peut pas être jugé : il est signalé
 * comme invérifiable, jamais rejeté sur une position devinée.
 */

/** Kilomètres par degré de latitude (moyenne WGS84 aux latitudes tempérées). */
const KM_PER_DEG_LAT = 110.574
/** Kilomètres par degré de longitude à l'équateur. */
const KM_PER_DEG_LON_EQUATOR = 111.32
/** Rayon moyen de la Terre, en kilomètres. */
const EARTH_RADIUS_KM = 6371

/**
 * Marge tolérée au-delà du rayon de la zone, en kilomètres.
 *
 * Elle n'est pas de la générosité : le centroïde d'un domaine tombe sur les
 * pistes, pas sur le front de neige, et les hébergements se répartissent dans
 * les villages d'accès en contrebas. Quinze kilomètres couvrent cette vallée
 * d'approche sans jamais atteindre la station voisine.
 */
export const OUT_OF_ZONE_MARGIN_KM = 15

export interface GeoBox {
  south: number
  west: number
  north: number
  east: number
}

export interface SearchZone extends GeoBox {
  /** Centre de la zone : le centroïde du domaine. */
  lat: number
  lon: number
  /** Rayon de la zone, en kilomètres. La boîte est celle de ce cercle. */
  radiusKm: number
}

/** Une position est-elle exploitable ? */
export function coordsUsable(lat: number | null | undefined, lon: number | null | undefined): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    // (0, 0) est au large du golfe de Guinée : c'est la valeur qu'une source
    // renvoie quand elle n'a pas de position, jamais un logement.
    (lat !== 0 || lon !== 0)
  )
}

/** Kilomètres par degré de longitude à cette latitude. */
export function kmPerDegreeLon(lat: number): number {
  // Plancher : au-delà de 89°, le cosinus tend vers zéro et la boîte
  // s'étendrait sur tout le tour du globe. Aucun domaine skiable n'y est, mais
  // une division par un cosinus nul n'a pas à dépendre de cette confiance.
  return Math.max(0.5, KM_PER_DEG_LON_EQUATOR * Math.cos((lat * Math.PI) / 180))
}

/** Distance à vol d'oiseau entre deux points, en kilomètres (haversine). */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Rayon de recherche d'un domaine, en kilomètres, dérivé de sa taille.
 *
 * La racine carrée et non une proportion : un domaine quatre fois plus grand en
 * kilomètres de pistes n'est pas quatre fois plus large sur le terrain, il
 * empile ses pistes sur les mêmes versants. Les bornes tiennent les deux
 * extrêmes — huit kilomètres pour une station de village, vingt-cinq pour Les
 * 3 Vallées, qui mesure effectivement cela d'Orelle à Courchevel.
 */
export function domainRadiusKm(slopesKm: number | null | undefined): number {
  const km = typeof slopesKm === 'number' && Number.isFinite(slopesKm) ? Math.max(0, slopesKm) : 0
  return Math.round(Math.min(25, Math.max(8, 6 + Math.sqrt(km))))
}

/** Boîte englobante du cercle de rayon `radiusKm` centré sur (`lat`, `lon`). */
export function boxAround(lat: number, lon: number, radiusKm: number): GeoBox {
  const dLat = radiusKm / KM_PER_DEG_LAT
  const dLon = radiusKm / kmPerDegreeLon(lat)
  return {
    south: lat - dLat,
    north: lat + dLat,
    west: lon - dLon,
    east: lon + dLon
  }
}

/** Zone de recherche complète : centre, rayon, et boîte du cercle. */
export function searchZone(lat: number, lon: number, radiusKm: number): SearchZone {
  return { lat, lon, radiusKm, ...boxAround(lat, lon, radiusKm) }
}

/** Zone d'un domaine, rayon dérivé de ses kilomètres de pistes. */
export function domainZone(domain: { lat: number; lon: number; km?: number | null }): SearchZone {
  return searchZone(domain.lat, domain.lon, domainRadiusKm(domain.km))
}

/** La position est-elle dans la boîte ? */
export function boxContains(box: GeoBox, lat: number, lon: number): boolean {
  return lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east
}

/**
 * Verdict géographique d'une position vis-à-vis d'une zone.
 *
 * Trois issues et non deux : `'unknown'` distingue « la source n'a pas publié
 * de position » de « la position est hors zone ». Les confondre reviendrait à
 * rejeter en masse les sources qui ne géolocalisent pas leurs annonces, ou à
 * accepter en masse celles qui les placent ailleurs.
 */
export type ZoneVerdict = 'in' | 'out' | 'unknown'

export function zoneVerdict(
  zone: SearchZone,
  lat: number | null | undefined,
  lon: number | null | undefined,
  marginKm = OUT_OF_ZONE_MARGIN_KM
): ZoneVerdict {
  if (!coordsUsable(lat, lon)) return 'unknown'
  return distanceKm(zone.lat, zone.lon, lat as number, lon as number) <= zone.radiusKm + marginKm
    ? 'in'
    : 'out'
}

export interface ZoneFilterResult<T> {
  /** Ce qui est dans la zone, ou dont la position est inconnue. */
  kept: T[]
  /** Ce qui a été rejeté sur une position publiée, hors zone. */
  rejected: T[]
  /** Retenus faute de position publiée : invérifiables, pas validés. */
  unlocated: number
}

/**
 * Écarte d'une liste ce qui est géographiquement hors du domaine.
 *
 * Les entrées sans position sont **conservées** et comptées à part. Une source
 * qui ne géolocalise pas ses annonces n'est pas une source qui ment ; la
 * rejeter viderait l'écran là où le problème est ailleurs. Le compte, lui, est
 * rendu à l'appelant pour être journalisé.
 */
export function filterToZone<T>(
  items: T[],
  zone: SearchZone,
  positionOf: (item: T) => { lat?: number | null; lon?: number | null },
  marginKm = OUT_OF_ZONE_MARGIN_KM
): ZoneFilterResult<T> {
  const kept: T[] = []
  const rejected: T[] = []
  let unlocated = 0

  for (const item of items) {
    const { lat, lon } = positionOf(item)
    const verdict = zoneVerdict(zone, lat, lon, marginKm)
    if (verdict === 'out') {
      rejected.push(item)
      continue
    }
    if (verdict === 'unknown') unlocated++
    kept.push(item)
  }

  return { kept, rejected, unlocated }
}
