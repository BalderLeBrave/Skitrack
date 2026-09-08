/**
 * Hébergements cartographiés dans OSM, sans prix.
 *
 * Le relevé Booking / Airbnb / Gîtes ne couvre pas tout le village. OSM
 * connaît des chalets, hôtels, résidences à leur GPS exact — rooms / beds /
 * capacity quand le tag existe, jamais un tarif inventé. Chaque carte ouvre
 * une recherche Airbnb pré-remplie du nom.
 *
 * Un bâtiment déjà présent dans le relevé (même nom, < 200 m) n'est pas
 * recopié : ses chambres OSM arrivent par l'enrichissement d'accès, pas par
 * une seconde vignette.
 */
import { domainZone } from '@shared/geo'
import { distanceKm } from '@shared/geo'
import type { OsmLodgingResult } from '@shared/ipc-contract'
import { listingsLookSame } from './canonical'
import type { Lodging } from './lodgings'

export const OSM_SOURCE = 'OpenStreetMap'

/** Même rayon que le cercle de flou : au-delà, c'est un autre hameau. */
const COVER_M = 200

const NAME_STOP = new Set([
  'chalet',
  'appartement',
  'studio',
  'gite',
  'gites',
  'maison',
  'villa',
  'residence',
  'hotel',
  'hameau',
  'les',
  'des'
])

export interface OsmSearchParams {
  south: number
  west: number
  north: number
  east: number
  destination: string
  domainId: number
  checkIn?: string
  checkOut?: string
  adults?: number
  children?: number
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function namesOverlap(a: string, b: string): boolean {
  const fa = fold(a)
  const fb = fold(b)
  if (!fa || !fb) return false
  if (fa === fb) return true
  const ta = new Set(fa.split(' ').filter((t) => t.length > 3 && !NAME_STOP.has(t)))
  const tb = new Set(fb.split(' ').filter((t) => t.length > 3 && !NAME_STOP.has(t)))
  if (ta.size === 0 || tb.size === 0) return false
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return shared / Math.min(ta.size, tb.size) >= 0.6
}

export function osmCardIsCovered(existing: Lodging[], osm: Lodging): boolean {
  for (const lg of existing) {
    if (listingsLookSame(lg, osm)) return true
    if (lg.lat == null || lg.lon == null || osm.lat == null || osm.lon == null) continue
    const metres = distanceKm(lg.lat, lg.lon, osm.lat, osm.lon) * 1000
    if (metres > COVER_M) continue
    if (namesOverlap(lg.name, osm.name)) return true
  }
  return false
}

function osmCardId(name: string, lat: number, lon: number): number {
  const key = `osm:${name}:${lat.toFixed(5)}:${lon.toFixed(5)}`
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0
  return 800_000_000 + Math.abs(h % 90_000_000)
}

/** 1 pièce OSM = studio (0 chambre). Rien n'est inventé. */
export function osmRoomsAsBedrooms(rooms: number | undefined): { ch: number; rooms?: number } {
  if (rooms == null || !Number.isFinite(rooms) || rooms <= 0) return { ch: 0 }
  if (rooms === 1) return { ch: 0, rooms: 1 }
  return { ch: rooms }
}

export function toOsmCard(hit: OsmLodgingResult, params: OsmSearchParams): Lodging | null {
  if (!hit.name?.trim()) return null
  if (!Number.isFinite(hit.lat) || !Number.isFinite(hit.lon)) return null
  if (hit.lat === 0 && hit.lon === 0) return null
  const size = osmRoomsAsBedrooms(hit.rooms)
  const capacity = hit.capacity && hit.capacity > 0 ? hit.capacity : hit.beds && hit.beds > 0 ? hit.beds : 0
  const image = hit.image ?? null
  return {
    id: osmCardId(hit.name, hit.lat, hit.lon),
    name: hit.name.trim(),
    type: hit.type || '',
    pers: capacity,
    ch: size.ch,
    rooms: size.rooms,
    m2: null,
    note: '',
    avis: 0,
    dist: 0,
    walk: 0,
    den: 0,
    skiIn: false,
    src: OSM_SOURCE,
    srcConnector: 'osm',
    pp: 0,
    lift: '',
    liftDist: 0,
    photo: image ?? '',
    annul: false,
    total: 0,
    alt: 0,
    stock: 0,
    url: hit.url,
    image,
    lat: hit.lat,
    lon: hit.lon,
    locPrecision: 'exact',
    capacitySource: capacity > 0 || size.rooms === 1 || size.ch > 0 ? 'osm' : undefined,
    importDomainId: params.domainId,
    scannedAt: Date.now(),
    accessComputed: false
  }
}

export function keepUncoveredOsmCards(existing: Lodging[], osm: Lodging[]): Lodging[] {
  return osm.filter((card) => !osmCardIsCovered(existing, card))
}

export async function runOsmLodgings(params: OsmSearchParams): Promise<Lodging[]> {
  const api = typeof window !== 'undefined' ? window.skitrack : undefined
  if (!api?.osmLodgings) return []
  try {
    const hits = await api.osmLodgings({
      south: params.south,
      west: params.west,
      north: params.north,
      east: params.east,
      destination: params.destination,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      adults: params.adults,
      children: params.children
    })
    const cards: Lodging[] = []
    for (const hit of hits) {
      const card = toOsmCard(hit, params)
      if (card) cards.push(card)
    }
    return cards
  } catch {
    return []
  }
}

export function osmSearchParamsOf(
  domain: { id: number; name: string; lat: number; lon: number; km?: number | null },
  stay: { checkIn?: string; checkOut?: string; adults?: number; children?: number }
): OsmSearchParams {
  const zone = domainZone(domain)
  return {
    south: zone.south,
    west: zone.west,
    north: zone.north,
    east: zone.east,
    destination: domain.name,
    domainId: domain.id,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    adults: stay.adults,
    children: stay.children
  }
}
