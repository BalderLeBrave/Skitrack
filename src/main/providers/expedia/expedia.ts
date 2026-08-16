/**
 * Expedia Group — EPS Rapid, couvrant Expedia et Vrbo/Abritel.
 *
 * ## Hotels.com a été retiré
 *
 * C'était une marque d'Expedia Group servie par le même inventaire Rapid, avec
 * les mêmes clés et les mêmes biens : elle n'ajoutait pas une source, elle
 * dédoublait celle-ci. Le drapeau de marque a donc disparu, ici comme dans
 * l'interface. Vrbo, lui, reste indépendant — c'est l'inventaire de location
 * saisonnière, celui qui intéresse cette application.
 *
 * ## Où mettre vos identifiants
 *
 * Réglages → Clés d'API → « Expedia Rapid — API key » et « — shared secret ».
 * Chiffrés par `safeStorage` (DPAPI). Clés techniques `expedia_rapid_key` et
 * `expedia_rapid_secret`, voir `src/main/secrets.ts`. En développement :
 * `EPS_API_KEY` et `EPS_SHARED_SECRET`.
 *
 * ## Authentification
 *
 * Rapid signe chaque appel : `Signature = SHA512(apiKey + secret + timestamp)`,
 * transmis dans `Authorization: EAN apikey=…,signature=…,timestamp=…`. La
 * signature est donc recalculée à chaque requête — un horodatage figé est
 * rejeté au bout de quelques secondes.
 *
 * ## Limite connue, à vérifier avant d'investir
 *
 * Rapid est un produit d'**inventaire hôtelier**. La présence des locations
 * Vrbo/Abritel n'y est pas garantie, alors que ce sont précisément les chalets
 * et appartements que cherche cette application. `docs/RISQUES.md` §2
 * recommande de compter les biens `VACATION_RENTAL` sur une requête sandbox
 * avant d'écrire plus loin. Le drapeau `vrbo` existe pour rendre ce test
 * immédiat.
 */

import { createHash } from 'node:crypto'
import { debugLog } from '../debug'
import { CircuitBreaker, RateLimiter, TtlCache, withRetry, withTimeout } from '../resilience'
import type { Accommodation, AccommodationProvider, ProviderHealth, SearchParams } from '../types'
import { nowIso } from '../types'

const ENDPOINT = 'https://api.ean.com/v3/properties/availability'
const TIMEOUT_MS = 25_000
const CACHE_TTL_MS = 10 * 60 * 1000
const MIN_INTERVAL_MS = 250

export type ExpediaBrand = 'expedia' | 'vrbo'

export interface ExpediaCredentials {
  apiKey: string
  sharedSecret: string
}

export interface ExpediaOptions {
  /** Marques interrogées. Vrbo se coupe indépendamment des deux autres. */
  brands?: Partial<Record<ExpediaBrand, boolean>>
}

export function resolveExpediaCredentials(
  vault: (key: string) => string | undefined,
  env: NodeJS.ProcessEnv = process.env
): ExpediaCredentials | null {
  const apiKey = vault('expedia_rapid_key') ?? env.EPS_API_KEY
  const sharedSecret = vault('expedia_rapid_secret') ?? env.EPS_SHARED_SECRET
  return apiKey && sharedSecret ? { apiKey, sharedSecret } : null
}

/** `SHA512(apiKey + secret + timestamp)`, recalculée à chaque appel. */
export function signatureFor(credentials: ExpediaCredentials, timestampSeconds: number): string {
  return createHash('sha512')
    .update(`${credentials.apiKey}${credentials.sharedSecret}${timestampSeconds}`)
    .digest('hex')
}

interface RapidProperty {
  property_id?: string
  name?: string
  links?: { web_details?: { href?: string } }
  ratings?: { guest?: { overall?: number; count?: number } }
  location?: { coordinates?: { latitude?: number; longitude?: number }; address?: { city?: string; country_code?: string } }
  rooms?: {
    rates?: {
      occupancy_pricing?: Record<string, { totals?: { inclusive?: { billable_currency?: { value?: string; currency?: string } } } }>
    }[]
  }[]
  images?: { links?: { '350px'?: { href?: string } } }[]
  category?: { id?: string; name?: string }
}

/** Rapid encode le type de bien dans `category` ; c'est ce qui distingue Vrbo. */
export function brandOf(property: RapidProperty): ExpediaBrand {
  const name = `${property.category?.name ?? ''} ${property.category?.id ?? ''}`.toLowerCase()
  return /vacation|rental|apartment|chalet|house/.test(name) ? 'vrbo' : 'expedia'
}

export function normalizeExpedia(property: RapidProperty, context: SearchParams): Accommodation | null {
  const sourceId = property.property_id
  const title = property.name?.trim()
  if (!sourceId || !title) return null

  const billable = property.rooms?.[0]?.rates?.[0]?.occupancy_pricing
  const firstOccupancy = billable ? Object.values(billable)[0] : undefined
  const amount = firstOccupancy?.totals?.inclusive?.billable_currency
  const total = amount?.value != null ? Number(amount.value) : undefined

  return {
    source: 'expedia',
    sourceId,
    title,
    url:
      property.links?.web_details?.href ??
      `https://www.expedia.fr/h${sourceId}.Hotel-Information`,
    latitude: property.location?.coordinates?.latitude,
    longitude: property.location?.coordinates?.longitude,
    city: property.location?.address?.city,
    country: property.location?.address?.country_code,
    checkIn: context.checkIn,
    checkOut: context.checkOut,
    guests: context.adults,
    totalPrice: Number.isFinite(total) ? total : undefined,
    currency: amount?.currency,
    rating: property.ratings?.guest?.overall,
    reviewCount: property.ratings?.guest?.count,
    images: property.images?.map((i) => i.links?.['350px']?.href).filter((h): h is string => Boolean(h)),
    // `availability` est l'endpoint interrogé : ce qui en sort est disponible.
    availability: true,
    availabilityStatus: 'available',
    priceConfidence: Number.isFinite(total) ? 'total_confirmed' : 'unknown',
    retrievedAt: nowIso(),
    rawProviderData: property
  }
}

export class ExpediaProvider implements AccommodationProvider {
  readonly name = 'expedia'

  private readonly cache = new TtlCache<Accommodation[]>(CACHE_TTL_MS)
  private readonly breaker = new CircuitBreaker()
  private readonly limiter = new RateLimiter(MIN_INTERVAL_MS)
  private readonly brands: Record<ExpediaBrand, boolean>

  constructor(
    private readonly credentials: () => ExpediaCredentials | null,
    options: ExpediaOptions = {}
  ) {
    this.brands = {
      expedia: options.brands?.expedia ?? true,
      vrbo: options.brands?.vrbo ?? true
    }
  }

  isConfigured(): boolean {
    return this.credentials() !== null
  }

  async search(params: SearchParams): Promise<Accommodation[]> {
    const credentials = this.credentials()
    if (!credentials) {
      throw new Error(
        'Expedia Rapid : clé ou secret absent. Réglages → Clés d’API, ou EPS_API_KEY / EPS_SHARED_SECRET. ' +
          'Un compte partenaire Expedia Group validé est requis.'
      )
    }
    if (this.breaker.open) throw new Error(`Expedia : ${this.breaker.reason}`)

    const key = JSON.stringify([params.destination, params.checkIn, params.checkOut, params.adults, this.brands])
    const cached = this.cache.get(key)
    if (cached) return cached

    debugLog('Expedia', 'Search started', { destination: params.destination, brands: this.brands })

    try {
      await this.limiter.acquire()
      const properties = await withRetry(
        () => withTimeout(this.call(credentials, params), TIMEOUT_MS, 'expedia/availability'),
        { retryable: (error) => !/40[13]/.test(String(error)) }
      )

      const results = properties
        .map((property) => ({ property, brand: brandOf(property) }))
        // Le filtrage par marque se fait ici : un seul appel, plusieurs marques.
        .filter(({ brand }) => this.brands[brand] !== false)
        .map(({ property }) => normalizeExpedia(property, params))
        .filter((r): r is Accommodation => r !== null)

      debugLog('Expedia', 'Number of normalized results', {
        raw: properties.length,
        normalized: results.length
      })
      this.breaker.succeed()
      this.cache.set(key, results)
      return results
    } catch (error) {
      this.breaker.fail()
      debugLog('Expedia', 'Number of errors', { errors: 1, message: (error as Error).message })
      throw error
    }
  }

  private async call(credentials: ExpediaCredentials, params: SearchParams): Promise<RapidProperty[]> {
    const timestamp = Math.floor(Date.now() / 1000)
    const query = new URLSearchParams({
      checkin: params.checkIn ?? '',
      checkout: params.checkOut ?? '',
      currency: 'EUR',
      language: 'fr-FR',
      country_code: 'FR',
      occupancy: String(params.adults ?? 2),
      sales_channel: 'website',
      sales_environment: 'hotel_only'
    })

    const response = await fetch(`${ENDPOINT}?${query.toString()}`, {
      headers: {
        Accept: 'application/json',
        Authorization:
          `EAN apikey=${credentials.apiKey},` +
          `signature=${signatureFor(credentials, timestamp)},timestamp=${timestamp}`,
        'User-Agent': 'SKITRACK/0.1'
      }
    })

    if (response.status === 429) throw new Error('Expedia : quota atteint (HTTP 429)')
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Expedia : HTTP ${response.status} ${body.slice(0, 200)}`)
    }
    const payload = (await response.json()) as RapidProperty[] | { properties?: RapidProperty[] }
    return Array.isArray(payload) ? payload : (payload.properties ?? [])
  }

  async health(): Promise<ProviderHealth> {
    const enabled = Object.entries(this.brands)
      .filter(([, on]) => on)
      .map(([brand]) => brand)
      .join(', ')
    return this.isConfigured()
      ? { name: this.name, reachable: true, detail: `clés Rapid présentes — marques : ${enabled}` }
      : { name: this.name, reachable: false, detail: 'clés Rapid absentes — compte partenaire requis' }
  }
}
