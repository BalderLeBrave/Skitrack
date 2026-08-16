/**
 * Types de l'API du sidecar.
 *
 * Miroir manuel des schémas Pydantic. `npm run gen:types` régénère la version
 * de référence depuis l'OpenAPI réel (`types.gen.ts`) : en cas de divergence,
 * c'est le fichier généré qui a raison — voir README § « Types partagés ».
 */

export type AltitudeSource = 'openskimap' | 'ign' | 'curated' | string

export interface DomainAccess {
  profile: string
  duration_min: number | null
  distance_km: number | null
  crow_km: number | null
  provider: string | null
  computed_at: string | null
}

export interface DomainSummary {
  id: number
  name: string
  slug: string
  country: string | null
  region: string | null
  massif: string | null
  status: string
  altitude_min_m: number | null
  altitude_max_m: number | null
  altitude_village_m: number | null
  altitude_source: AltitudeSource
  slopes_km_total: number | null
  slopes_km_by_color: Record<string, number> | null
  slopes_count_by_color: Record<string, number> | null
  lifts_count: number | null
  glacier: boolean | null
  snowmaking_pct: number | null
  linked_pass_name: string | null
  official_website_url: string | null
  official_booking_url: string | null
  centroid_lat: number | null
  centroid_lon: number | null
  curated: boolean
  access: DomainAccess | null
  score: number | null
  score_breakdown: Record<string, number> | null
}

export interface Lift {
  id: number
  name: string | null
  lift_type: string | null
  length_m: number | null
  elevation_min_m: number | null
  elevation_max_m: number | null
  base_lat: number | null
  base_lon: number | null
}

export interface DomainDetail extends DomainSummary {
  localities: string[] | null
  admin_code: string | null
  lifts_count_by_type: Record<string, number> | null
  lifts_km_total: number | null
  north_facing_pct: number | null
  season_open_typical: string | null
  season_close_typical: string | null
  wikidata_id: string | null
  osm_id: string | null
  source: string
  source_id: string
  bbox: number[] | null
  geometry: GeoJSON.Geometry | null
  notes: string | null
  lifts: Lift[]
  slopes_available: boolean
}

export interface DomainSearchRequest {
  query?: string | null
  countries?: string[] | null
  massifs?: string[] | null
  status?: string[]
  altitude_min_m?: number | null
  altitude_max_m?: number | null
  altitude_village_min_m?: number | null
  slopes_km_min?: number | null
  lifts_count_min?: number | null
  glacier?: boolean | null
  snowmaking_pct_min?: number | null
  linked_only?: boolean
  origin_id?: number | null
  max_car_time_min?: number | null
  max_car_distance_km?: number | null
  avoid_tolls?: boolean
  sort?: SortKey
  limit?: number
  offset?: number
}

export type SortKey =
  | 'relevance'
  | 'name_asc'
  | 'name_desc'
  | 'altitude_max_desc'
  | 'altitude_max_asc'
  | 'altitude_min_desc'
  | 'slopes_km_desc'
  | 'slopes_km_asc'
  | 'region_asc'
  | 'travel_time_asc'
  | 'forfait_asc'

export interface DomainSearchResponse {
  total: number
  items: DomainSummary[]
  warnings: string[]
}

export interface Facets {
  countries: { code: string; count: number }[]
  massifs: { name: string; count: number }[]
  known_massifs: string[]
  altitude_min_bounds: [number, number]
  altitude_max_max: number
  slopes_km_max: number
}

/** Un candidat de géocodage renvoyé par le moteur local. */
export interface GeocodeResult {
  label: string
  lat: number
  lon: number
  /** Confiance du géocodeur, 0 → 1. Absente chez Nominatim. */
  score: number | null
  city: string | null
  postcode: string | null
  /** `ban`, `nominatim`… — sert à signaler une position approximative. */
  provider: string
}

export interface Origin {
  id: number
  label: string
  address: string
  lat: number
  lon: number
  geocoder: string | null
  is_default: boolean
}

export interface JobStatus {
  id: string
  kind: string
  state: 'pending' | 'running' | 'done' | 'error' | 'cancelled'
  progress: number
  message: string
  result: Record<string, unknown> | null
  error: string | null
  started_at: string | null
  finished_at: string | null
}

export interface ProviderStatus {
  name: string
  kind: 'lodging' | 'routing' | 'elevation' | 'weather' | 'geocoding'
  enabled: boolean
  configured: boolean
  label: string
  reason: string | null
  docs_url: string | null
  last_error: string | null
}

export interface ReferentialStatus {
  domains_total: number
  domains_with_altitude: number
  domains_by_country: Record<string, number>
  referential_ready: boolean
}

export interface DeepLink {
  name: string
  label: string
  url: string
  verified: string | boolean
  note: string | null
}

/** Un logement à enrichir : référence + coordonnées. */
export interface LodgingAccessItem {
  ref: string
  lat: number
  lon: number
  /** 'exact' ou 'approximate' — les positions floues sont arrondies à la centaine. */
  location_precision?: 'exact' | 'approximate'
}

export interface LodgingAccessRequest {
  domain_id: number
  lodgings: LodgingAccessItem[]
  with_elevation?: boolean
}

/** Métriques d'accès d'un logement. Tout est optionnel : un domaine sans tracés
 *  importés (`--with-runs`) n'en produit aucune. */
export interface LodgingAccessMetrics {
  ref: string
  dist_to_nearest_slope_m: number | null
  denivele_to_slope_m: number | null
  dist_to_nearest_lift_m: number | null
  denivele_to_lift_m: number | null
  /** La plus courte des deux (piste OU remontée) — la « distance aux pistes ». */
  dist_to_slopes_m: number | null
  /** Dénivelé au point retenu ci-dessus. */
  denivele_m: number | null
  dist_to_center_m: number | null
  altitude_m: number | null
  slope_access_type: 'skis_aux_pieds' | 'navette' | 'voiture' | null
  precision: string
}

export interface LodgingAccessResponse {
  domain_id: number
  /** Nombre de tracés disponibles. Zéro = référentiel importé sans `--with-runs`. */
  slopes_available: number
  lifts_available: number
  results: LodgingAccessMetrics[]
}
