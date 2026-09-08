/**
 * Accès canoniques aux champs d'une annonce.
 *
 * `Lodging.pers` / `ch` / `alt` / `dist` portent encore `0` au sens « non
 * annoncé » — c'est le contrat persisté. L'UI, les filtres et le comparateur
 * ne lisent plus ces zéros : ils passent par ici, où `null` n'est pas `0`.
 */

import { distanceKm } from '@shared/geo'
import {
  listingSourceOf,
  locationPrecisionOf,
  qualityOf,
  type AltitudeSource,
  type CanonicalListing,
  type CapacitySource,
  type FieldQuality,
  type LocationPrecision
} from '@shared/canonicalListing'
import type { Lodging } from './lodgings'

export {
  listingSourceOf,
  locationPrecisionOf,
  qualityOf
} from '@shared/canonicalListing'
export type { CanonicalListing, FieldQuality, LocationPrecision, AltitudeSource, CapacitySource }

/** Capacité max publiée. `0` persisté = silence de la source. */
export function capacityMaxOf(lg: Pick<Lodging, 'pers'>): number | null {
  return lg.pers > 0 ? lg.pers : null
}

/** Chambres publiées. Un studio annoncé = `ch === 0` ET `rooms === 1` : 0 chambre. */
export function bedroomsOf(lg: Pick<Lodging, 'ch' | 'rooms'>): number | null {
  if (lg.ch > 0) return lg.ch
  if (lg.rooms === 1) return 0
  return null
}

/** Altitude IGN/EU-DEM, seulement après calcul. Jamais le texte d'annonce. */
export function altitudeMOf(lg: Pick<Lodging, 'alt' | 'accessComputed'>): number | null {
  if (lg.accessComputed !== true) return null
  if (typeof lg.alt !== 'number' || !Number.isFinite(lg.alt)) return null
  return Math.round(lg.alt)
}

export function altitudeSourceOf(lg: Pick<Lodging, 'altSource'>): AltitudeSource {
  return lg.altSource ?? 'none'
}

/**
 * Distance à la gare aval la plus proche, en mètres.
 *
 * C'est `liftDist` après enrichissement. Distinct de `dist` (min piste /
 * remontée) : l'étiquette « des remontées » ne doit pas recycler le min.
 */
export function distToLiftsMOf(
  lg: Pick<Lodging, 'liftDist' | 'accessComputed'>
): number | null {
  if (lg.accessComputed !== true) return null
  if (typeof lg.liftDist !== 'number' || !Number.isFinite(lg.liftDist)) return null
  return Math.round(lg.liftDist)
}

/**
 * Distance aux pistes : minimum piste / remontée, comme avant l'écran canonique.
 * `0` après calcul = au pied ; avant calcul → null.
 */
export function distToRunsMOf(lg: Pick<Lodging, 'dist' | 'accessComputed'>): number | null {
  if (lg.accessComputed !== true) return null
  if (typeof lg.dist !== 'number' || !Number.isFinite(lg.dist)) return null
  return Math.round(lg.dist)
}

export function locationPrecisionOfLodging(
  lg: Pick<Lodging, 'locPrecision' | 'geoPrecision' | 'lat' | 'lon' | 'src' | 'srcConnector'>
): LocationPrecision {
  if (lg.locPrecision === 'approximate' || lg.geoPrecision === 'approximate') return 'approximate'
  if (lg.locPrecision === 'address' || lg.geoPrecision === 'address') return 'address'
  if (lg.locPrecision === 'unknown' || lg.geoPrecision === 'none') return 'unknown'
  if (lg.locPrecision === 'exact') return 'exact'
  if (lg.geoPrecision === 'exact') return 'exact'
  return locationPrecisionOf(lg.srcConnector ?? lg.src, lg.lat != null && lg.lon != null)
}

export function isFuzzyLocation(
  lg: Pick<Lodging, 'locPrecision' | 'geoPrecision' | 'src' | 'srcConnector' | 'lat' | 'lon'>
): boolean {
  const p = locationPrecisionOfLodging(lg)
  return p === 'approximate' || p === 'unknown'
}

/** Libellé de distance : mètre exact, ~100 m, ou « < 1 km » si le point est flou. */
export function formatLiftDistance(
  metres: number | null,
  fuzzy: boolean,
  fmt: (n: number) => string
): { text: string; fuzzy: boolean } | null {
  if (metres == null) return null
  if (fuzzy) {
    if (metres < 1000) return { text: '< 1 km', fuzzy: true }
    return { text: `~${fmt(Math.round(metres / 100) * 100)} m`, fuzzy: true }
  }
  return { text: `${fmt(metres)} m`, fuzzy: false }
}

export function formatAltitude(
  metres: number | null,
  source: AltitudeSource,
  fuzzy: boolean,
  fmt: (n: number) => string
): { text: string; source: string } | null {
  if (metres == null) return null
  const src = source === 'ign' ? 'IGN' : source === 'eudem' ? 'EU-DEM' : ''
  const n = fmt(metres)
  return { text: fuzzy ? `~${n} m` : `${n} m`, source: src }
}

export function toCanonicalListing(lg: Lodging, domainId?: string | null): CanonicalListing {
  const capacity = capacityMaxOf(lg)
  const bedrooms = bedroomsOf(lg)
  const alt = altitudeMOf(lg)
  const lift = distToLiftsMOf(lg)
  const hasCoords = lg.lat != null && lg.lon != null
  const source = listingSourceOf(lg.srcConnector ?? lg.src)
  const rating = lg.note && lg.note !== '—' ? Number(lg.note.replace(',', '.')) || null : null
  const ratingScale: 5 | 10 | null =
    rating == null ? null : source === 'booking_scraper' || source === 'liteapi' ? 10 : 5
  return {
    source,
    source_id: lg.listingHash ?? (lg.url ? lg.url : String(lg.id)),
    name: lg.name,
    url: lg.url ?? null,
    lat: lg.lat ?? null,
    lon: lg.lon ?? null,
    location_precision: locationPrecisionOfLodging(lg),
    address_text: lg.addressText ?? null,
    commune: lg.commune ?? null,
    altitude_m: alt,
    altitude_source: altitudeSourceOf(lg),
    bedrooms,
    beds: null,
    capacity_max: capacity,
    capacity_source: (lg.capacitySource ?? (capacity != null ? 'provider' : 'none')) as CapacitySource,
    dist_to_nearest_lift_m: lift,
    walk_min_to_lift: lift != null ? Math.max(1, Math.round(lift / 50)) : null,
    domain_id: domainId ?? (lg.importDomainId != null ? String(lg.importDomainId) : null),
    price_total_eur: lg.total > 0 ? lg.total : null,
    price_per_night_eur: lg.nightly && lg.nightly > 0 ? lg.nightly : null,
    rating,
    rating_scale: ratingScale,
    review_count: lg.avis > 0 ? lg.avis : null,
    amenities: [],
    fields_quality: lg.fieldsQuality ?? {
      altitude_m: qualityOf(alt),
      bedrooms: qualityOf(bedrooms),
      capacity_max: qualityOf(capacity),
      dist_to_nearest_lift_m: qualityOf(lift),
      lat: hasCoords ? 'ok' : 'missing'
    }
  }
}

const NAME_NOISE = /^(le|la|les|un|une|studio|appartement|chalet|gite|maison|a|the)\s+/i

function foldName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(NAME_NOISE, '')
    .trim()
}

function aptNumber(name: string): string | null {
  const m = foldName(name).match(/\b(?:n|no|apt|appartement)?\s*(\d{1,4})\b/)
  return m ? m[1] : null
}

/** Même bien publié sous deux URLs, pas deux annonces d'un même relevé.

 *  On refuse :
 *  - un GPS flou (Airbnb / Abritel / Cozy) — beaucoup d'annonces partagent le même cercle ;
 *  - deux cartes de la **même** source — `listingKey` a déjà fusionné le vrai doublon ;
 *  - deux n° d'appartement distincts.
 *  Reste : < 40 m, GPS exact/adresse, sources différentes, noms proches.
 */
export function listingsLookSame(
  a: Pick<Lodging, 'name' | 'lat' | 'lon' | 'locPrecision' | 'geoPrecision' | 'src' | 'srcConnector'>,
  b: Pick<Lodging, 'name' | 'lat' | 'lon' | 'locPrecision' | 'geoPrecision' | 'src' | 'srcConnector'>
): boolean {
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return false
  const sa = listingSourceOf(a.srcConnector ?? a.src)
  const sb = listingSourceOf(b.srcConnector ?? b.src)
  if (sa === sb) return false
  if (isApproximateSource(sa) || isApproximateSource(sb)) return false
  if (isFuzzyLocation(a) || isFuzzyLocation(b)) return false
  const metres = distanceKm(a.lat, a.lon, b.lat, b.lon) * 1000
  if (metres >= 40) return false
  const na = aptNumber(a.name)
  const nb = aptNumber(b.name)
  if (na && nb && na !== nb) return false
  const fa = foldName(a.name)
  const fb = foldName(b.name)
  if (!fa || !fb) return false
  if (fa === fb) return true
  const ta = new Set(fa.split(' ').filter((t) => t.length > 3))
  const tb = new Set(fb.split(' ').filter((t) => t.length > 3))
  if (ta.size === 0 || tb.size === 0) return false
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return shared / Math.min(ta.size, tb.size) >= 0.6
}

function isApproximateSource(source: string): boolean {
  return source === 'airbnb_scraper' || source === 'abritel_scraper' || source === 'cozycozy_scraper'
}
