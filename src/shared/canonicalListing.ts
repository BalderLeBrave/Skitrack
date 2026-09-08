/**
 * Contrat unique d'une annonce, quelle que soit la source.
 *
 * L'identité, les lits et le prix viennent du provider. Les coordonnées
 * peuvent être raffinées (BAN / Nominatim). L'altitude et la distance aux
 * remontées sont TOUJOURS calculées localement — jamais recopiées du texte
 * d'annonce. Voir docs/ANNONCES.md.
 */

export type ListingSource =
  | 'liteapi'
  | 'booking_scraper'
  | 'expedia'
  | 'gites_de_france'
  | 'osm'
  | 'airbnb_scraper'
  | 'abritel_scraper'
  | 'cozycozy_scraper'
  | 'manual'
  | 'deeplink'
  | `central:${string}`

export type LocationPrecision = 'exact' | 'address' | 'approximate' | 'unknown'
export type FieldQuality = 'ok' | 'inferred' | 'missing' | 'conflict'
export type CapacitySource = 'provider' | 'osm' | 'parsed' | 'inferred' | 'none'
export type AltitudeSource = 'ign' | 'eudem' | 'openskimap_point' | 'curated' | 'none'

export type CanonicalField =
  | 'altitude_m'
  | 'bedrooms'
  | 'capacity_max'
  | 'dist_to_nearest_lift_m'
  | 'lat'

export interface CanonicalListing {
  source: ListingSource
  source_id: string
  name: string
  url: string | null
  lat: number | null
  lon: number | null
  location_precision: LocationPrecision
  address_text: string | null
  commune: string | null
  altitude_m: number | null
  altitude_source: AltitudeSource
  bedrooms: number | null
  beds: number | null
  capacity_max: number | null
  capacity_source: CapacitySource
  dist_to_nearest_lift_m: number | null
  walk_min_to_lift: number | null
  domain_id: string | null
  price_total_eur: number | null
  price_per_night_eur: number | null
  rating: number | null
  rating_scale: 5 | 10 | null
  review_count: number | null
  amenities: string[]
  fields_quality: Partial<Record<CanonicalField, FieldQuality>>
}

export function emptyCanonical(partial: Partial<CanonicalListing> & Pick<CanonicalListing, 'source' | 'source_id' | 'name'>): CanonicalListing {
  return {
    url: null,
    lat: null,
    lon: null,
    location_precision: 'unknown',
    address_text: null,
    commune: null,
    altitude_m: null,
    altitude_source: 'none',
    bedrooms: null,
    beds: null,
    capacity_max: null,
    capacity_source: 'none',
    dist_to_nearest_lift_m: null,
    walk_min_to_lift: null,
    domain_id: null,
    price_total_eur: null,
    price_per_night_eur: null,
    rating: null,
    rating_scale: null,
    review_count: null,
    amenities: [],
    fields_quality: {},
    ...partial
  }
}

/** Qualité d'un champ : une valeur présente est `ok`, sinon `missing`. Jamais `ok` sur 0 inventé. */
export function qualityOf(value: number | string | null | undefined): FieldQuality {
  if (value == null) return 'missing'
  if (typeof value === 'number' && !Number.isFinite(value)) return 'missing'
  if (typeof value === 'string' && value.trim() === '') return 'missing'
  return 'ok'
}

export function listingSourceOf(raw: string | null | undefined): ListingSource {
  const s = (raw ?? '').toLowerCase()
  if (s.includes('liteapi')) return 'liteapi'
  if (s.includes('expedia')) return 'expedia'
  if (s.includes('gite')) return 'gites_de_france'
  if (s.includes('airbnb')) return 'airbnb_scraper'
  if (s.includes('abritel') || s.includes('vrbo')) return 'abritel_scraper'
  if (s.includes('cozy')) return 'cozycozy_scraper'
  if (s.includes('booking')) return 'booking_scraper'
  if (s.includes('osm') || s.includes('openstreetmap')) return 'osm'
  if (s.includes('manual') || s.startsWith('import')) return 'manual'
  if (s.includes('deeplink')) return 'deeplink'
  if (
    s.includes('ceto') ||
    s.includes('ublo') ||
    s.includes('opensystem') ||
    s.includes('deskline') ||
    s.includes('station') ||
    s.includes('centrale') ||
    s.includes('ingenie') ||
    s.includes('orchestra')
  ) {
    return `central:${raw || 'station'}`
  }
  return 'manual'
}

export function locationPrecisionOf(source: string, hasCoords: boolean): LocationPrecision {
  if (!hasCoords) return 'unknown'
  const s = source.toLowerCase()
  if (s.includes('airbnb')) return 'approximate'
  if (s.includes('abritel') || s.includes('vrbo')) return 'approximate'
  if (s.includes('gite')) return 'address'
  return 'exact'
}
