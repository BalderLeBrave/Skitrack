import type {
  DeepLink,
  DomainDetail,
  DomainSearchRequest,
  DomainSearchResponse,
  Facets,
  GeocodeResult,
  JobStatus,
  LodgingAccessRequest,
  LodgingAccessResponse,
  Origin,
  ProviderStatus,
  ReferentialStatus
} from './types'

/**
 * Client HTTP du sidecar.
 *
 * L'URL de base et le token ne sont pas connus au chargement : ils arrivent
 * après le handshake Electron. Le client est donc configuré une fois que le
 * sidecar est prêt, et toute requête émise avant lève une erreur explicite
 * plutôt qu'un `fetch('undefined/...')` illisible.
 */

let baseUrl: string | null = null
let token: string | null = null

export function configureClient(url: string, sessionToken: string): void {
  baseUrl = url
  token = sessionToken
}

export function isClientReady(): boolean {
  return baseUrl !== null
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!baseUrl || !token) {
    throw new ApiError(0, "Le moteur local n'est pas encore démarré.")
  }
  const resp = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Skitrack-Token': token,
      ...(init?.headers ?? {})
    }
  })

  if (!resp.ok) {
    let message = `Erreur ${resp.status}`
    let code: string | undefined
    try {
      const body = await resp.json()
      // FastAPI renvoie `detail` ; nos handlers renvoient `code`/`message`.
      message = body.message ?? formatDetail(body.detail) ?? message
      code = body.code
    } catch {
      /* corps non JSON : on garde le message générique */
    }
    throw new ApiError(resp.status, message, code)
  }
  if (resp.status === 204) return undefined as T
  return (await resp.json()) as T
}

/** Les erreurs de validation Pydantic arrivent sous forme de tableau. */
function formatDetail(detail: unknown): string | undefined {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item?.msg === 'string' ? item.msg : JSON.stringify(item)))
      .join(' · ')
  }
  return undefined
}

export const api = {
  status: () => request<ReferentialStatus>('/api/status'),

  searchDomains: (body: DomainSearchRequest) =>
    request<DomainSearchResponse>('/api/domains/search', {
      method: 'POST',
      body: JSON.stringify(body)
    }),

  domain: (id: number, originId?: number | null, avoidTolls = false) => {
    const params = new URLSearchParams()
    if (originId != null) params.set('origin_id', String(originId))
    if (avoidTolls) params.set('avoid_tolls', 'true')
    const qs = params.toString()
    return request<DomainDetail>(`/api/domains/${id}${qs ? `?${qs}` : ''}`)
  },

  facets: () => request<Facets>('/api/domains/facets'),

  mapPoints: () => request<GeoJSON.FeatureCollection>('/api/domains/map'),

  /**
   * Géocodage d'une commune, par le moteur local.
   *
   * Le moteur porte la politique d'usage — Base Adresse Nationale en France,
   * Nominatim ailleurs avec sa limite d'une requête par seconde et son
   * User-Agent identifiant. Passer par lui évite d'ouvrir la CSP du renderer
   * sur deux hôtes de plus, et garde ces règles à un seul endroit.
   */
  geocode: (q: string, limit = 5) =>
    request<GeocodeResult[]>(`/api/geo/geocode?q=${encodeURIComponent(q)}&limit=${limit}`),

  origins: () => request<Origin[]>('/api/geo/origins'),

  createOrigin: (label: string, address: string) =>
    request<Origin>('/api/geo/origins', {
      method: 'POST',
      body: JSON.stringify({ label, address, is_default: true })
    }),

  deleteOrigin: (id: number) => request<{ deleted: number }>(`/api/geo/origins/${id}`, { method: 'DELETE' }),

  precomputeRoutes: (originId: number, profile: 'car' | 'car_no_toll', maxCrowKm = 900) =>
    request<JobStatus>('/api/geo/routes/precompute', {
      method: 'POST',
      body: JSON.stringify({ origin_id: originId, profile, max_crow_km: maxCrowKm })
    }),

  routeToDomain: (domainId: number, originId: number, avoidTolls: boolean) =>
    request<{
      duration_min: number | null
      distance_km: number | null
      provider: string
      profile: string
      avoid_tolls_applied: boolean
    }>(`/api/geo/routes/${domainId}?origin_id=${originId}&avoid_tolls=${avoidTolls}`, {
      method: 'POST'
    }),

  isochrones: (originId: number, rangesMin: number[], profile: 'car' | 'car_no_toll') =>
    request<{ geojson: GeoJSON.FeatureCollection; provider: string }>('/api/geo/isochrones', {
      method: 'POST',
      body: JSON.stringify({ origin_id: originId, ranges_min: rangesMin, profile })
    }),

  /**
   * Calcule les métriques d'accès aux pistes d'un lot de logements.
   *
   * Enrichit des annonces (LiteAPI, Airbnb collées) avec la distance aux pistes,
   * le dénivelé, l'altitude et le type d'accès, à partir des tracés du domaine.
   * Sans état côté sidecar : on envoie des coordonnées, on reçoit des mesures.
   */
  lodgingsAccess: (body: LodgingAccessRequest) =>
    request<LodgingAccessResponse>('/api/lodgings/access', {
      method: 'POST',
      body: JSON.stringify(body)
    }),

  importReferential: (body: {
    countries: string[]
    with_lifts: boolean
    with_runs?: boolean
    detect_glaciers: boolean
    force_download?: boolean
  }) => request<JobStatus>('/api/referential/import', { method: 'POST', body: JSON.stringify(body) }),

  referentialSources: () =>
    request<{
      urls: Record<string, string>
      local_dumps: Record<string, { path: string; size_mb: number; modified_at: number } | null>
      license: string
      attribution: string
    }>('/api/referential/sources'),

  job: (id: string) => request<JobStatus>(`/api/jobs/${id}`),
  jobs: () => request<JobStatus[]>('/api/jobs'),
  cancelJob: (id: string) => request<{ cancelled: boolean }>(`/api/jobs/${id}/cancel`, { method: 'POST' }),

  providers: () => request<ProviderStatus[]>('/api/providers'),

  settings: () => request<{ settings: Record<string, unknown>; secrets_configured: string[] }>('/api/settings'),

  patchSettings: (values: Record<string, unknown>) =>
    request<{ settings: Record<string, unknown> }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ values })
    }),

  deeplinks: (body: {
    query: string
    check_in?: string
    check_out?: string
    adults?: number
    bedrooms?: number
    domain_slug?: string
  }) => request<DeepLink[]>('/api/deeplinks', { method: 'POST', body: JSON.stringify(body) })
}
