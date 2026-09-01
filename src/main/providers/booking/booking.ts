/**
 * Booking.com — Demand API v3.
 *
 * ## Où mettre vos identifiants
 *
 * Deux voies, dans cet ordre de priorité :
 *
 * 1. **Le coffre de l'application** (recommandé). Réglages → Clés d'API →
 *    « Booking.com Demand API ». La valeur est chiffrée par `safeStorage`
 *    d'Electron (DPAPI sous Windows, liée à votre compte) et poussée en
 *    mémoire. Clé technique : `booking_demand`, voir `src/main/secrets.ts`.
 * 2. **Variable d'environnement** `BOOKING_DEMAND_TOKEN`, pour le
 *    développement et les tests en ligne de commande.
 *
 * Une variable d'environnement dans une application de bureau empaquetée n'est
 * *pas* un secret : elle se lit dans le fichier de lancement ou dans
 * l'inspecteur de processus. D'où le coffre en premier.
 *
 * ## Ce qu'il faut savoir avant d'espérer des résultats
 *
 * Le programme d'affiliation Booking (inscription libre via CJ) ne donne que
 * des **liens et bannières** : aucun accès aux prix. Les tarifs passent par la
 * **Demand API**, qui exige une validation partenaire avec volume d'affaires
 * démontrable — vérifié le 2026-08-12, et déjà documenté dans
 * `docs/RISQUES.md`. Sans identifiant valide, ce module ne devine rien : il se
 * déclare non configuré et l'agrégat continue sans lui.
 *
 * Le mapping ci-dessous suit le schéma publié de `POST /accommodations/search`.
 * Il n'a pas pu être exécuté contre le service réel faute d'accès : la charge
 * utile brute est conservée dans `rawProviderData` pour être corrigée à la
 * première réponse réelle plutôt que d'être devinée deux fois.
 */

import { debugLog } from '../debug'
import { CircuitBreaker, RateLimiter, TtlCache, withRetry, withTimeout } from '../resilience'
import type {
  Accommodation,
  AccommodationProvider,
  ProviderHealth,
  SearchParams
} from '../types'
import { nowIso } from '../types'

const ENDPOINT = 'https://demandapi.booking.com/3.1/accommodations/search'
const TIMEOUT_MS = 20_000
const CACHE_TTL_MS = 10 * 60 * 1000
/** Demand API plafonne les appels ; on s'espace pour ne pas s'en approcher. */
const MIN_INTERVAL_MS = 400

export interface BookingCredentials {
  token: string
  affiliateId?: string
}

/** Résout les identifiants : coffre d'abord, environnement ensuite. */
export function resolveBookingCredentials(
  vault: (key: string) => string | undefined,
  env: NodeJS.ProcessEnv = process.env
): BookingCredentials | null {
  const token = vault('booking_demand') ?? env.BOOKING_DEMAND_TOKEN
  if (!token) return null
  return { token, affiliateId: env.BOOKING_AFFILIATE_ID }
}

interface BookingRow {
  id?: number | string
  name?: string
  url?: string
  photos?: { url?: string }[]
  location?: { latitude?: number; longitude?: number; city?: string; country?: string }
  price?: { total?: number; currency?: string; per_night?: number }
  review?: { score?: number; count?: number }
  rooms?: number
  max_occupancy?: number
}

/** Ajoute l'identifiant d'affiliation à l'URL, pour que le clic soit tracé. */
function affiliateUrl(raw: string | undefined, id: string | undefined, fallbackName: string): string {
  const base = raw ?? `https://www.booking.com/searchresults.fr.html?ss=${encodeURIComponent(fallbackName)}`
  if (!id) return base
  const url = new URL(base)
  url.searchParams.set('aid', id)
  return url.toString()
}

export function normalizeBooking(row: BookingRow, affiliateId: string | undefined, context: SearchParams): Accommodation | null {
  const sourceId = row.id != null ? String(row.id) : undefined
  const title = row.name?.trim()
  if (!sourceId || !title) return null

  const total = typeof row.price?.total === 'number' ? row.price.total : undefined
  const nightly = typeof row.price?.per_night === 'number' ? row.price.per_night : undefined

  return {
    source: 'booking',
    sourceId,
    title,
    url: affiliateUrl(row.url, affiliateId, title),
    latitude: row.location?.latitude,
    longitude: row.location?.longitude,
    city: row.location?.city,
    country: row.location?.country,
    checkIn: context.checkIn,
    checkOut: context.checkOut,
    /*
     * Capacité du bien, si la réponse la porte.
     *
     * Le commentaire précédent affirmait que « la Demand API ne rend pas
     * d'occupation par bien » — alors que `BookingRow` déclare `max_occupancy`
     * six lignes plus haut. L'une des deux affirmations était fausse et le
     * module n'a jamais été exécuté contre le service réel (voir l'en-tête).
     * On lit donc le champ **s'il est là**, et on ne renvoie jamais la demande
     * en guise de capacité : absent, il reste absent.
     */
    guests:
      typeof row.max_occupancy === 'number' && row.max_occupancy > 0
        ? row.max_occupancy
        : undefined,
    bedrooms: row.rooms,
    nightlyPrice: nightly,
    totalPrice: total,
    currency: row.price?.currency,
    rating: row.review?.score,
    // La Demand API note sur 10 — « 8,2 » sur une fiche Booking. La conversion
    // vers l'échelle d'affichage se fait en aval, une seule fois.
    ratingScale: 10,
    reviewCount: row.review?.count,
    images: row.photos?.map((p) => p.url).filter((u): u is string => Boolean(u)),
    // La Demand API ne renvoie que des biens disponibles pour les dates
    // demandées : c'est l'une des rares sources où l'affirmer est exact.
    availability: true,
    availabilityStatus: 'available',
    priceConfidence: total != null ? 'total_confirmed' : nightly != null ? 'partial' : 'unknown',
    retrievedAt: nowIso(),
    rawProviderData: row
  }
}

export class BookingProvider implements AccommodationProvider {
  readonly name = 'booking'

  private readonly cache = new TtlCache<Accommodation[]>(CACHE_TTL_MS)
  private readonly breaker = new CircuitBreaker()
  private readonly limiter = new RateLimiter(MIN_INTERVAL_MS)

  constructor(private readonly credentials: () => BookingCredentials | null) {}

  isConfigured(): boolean {
    return this.credentials() !== null
  }

  async search(params: SearchParams): Promise<Accommodation[]> {
    const credentials = this.credentials()
    if (!credentials) {
      throw new Error(
        'Booking.com : aucun jeton Demand API. Renseignez-le dans Réglages → Clés d’API, ou via ' +
          'BOOKING_DEMAND_TOKEN. Le programme d’affiliation seul ne donne pas accès aux prix.'
      )
    }
    if (this.breaker.open) throw new Error(`Booking.com : ${this.breaker.reason}`)

    /*
     * Toute entrée de `SearchParams` qui change le résultat doit entrer dans la
     * clé, sans quoi le cache rend la réponse d'une autre question.
     *
     * `bedrooms` est arrivé au contrat (`types.ts`) sans être ajouté ici :
     * chercher « 8 personnes, 2 chambres » puis « 8 personnes, 5 chambres » sur
     * la même station dans les dix minutes du TTL rendait le premier résultat.
     * Les coordonnées et le rayon manquaient pour la même raison — deux
     * domaines voisins portant le même nom de station partageaient une entrée.
     */
    const key = JSON.stringify([
      params.destination,
      params.checkIn,
      params.checkOut,
      params.adults,
      params.children,
      params.bedrooms,
      params.latitude,
      params.longitude,
      params.radiusMeters
    ])
    const cached = this.cache.get(key)
    if (cached) return cached

    debugLog('Booking', 'Search started', { destination: params.destination })

    try {
      await this.limiter.acquire()
      const rows = await withRetry(
        () => withTimeout(this.call(credentials, params), TIMEOUT_MS, 'booking/search'),
        { retryable: (error) => !/40[13]/.test(String(error)) }
      )
      const results = rows
        .map((row) => normalizeBooking(row, credentials.affiliateId, params))
        .filter((r): r is Accommodation => r !== null)

      debugLog('Booking', 'Number of normalized results', { raw: rows.length, normalized: results.length })
      this.breaker.succeed()
      this.cache.set(key, results)
      return results
    } catch (error) {
      this.breaker.fail()
      debugLog('Booking', 'Number of errors', { errors: 1, message: (error as Error).message })
      throw error
    }
  }

  private async call(credentials: BookingCredentials, params: SearchParams): Promise<BookingRow[]> {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.token}`,
        'X-Affiliate-Id': credentials.affiliateId ?? ''
      },
      body: JSON.stringify({
        city: params.destination,
        checkin: params.checkIn,
        checkout: params.checkOut,
        guests: {
          number_of_adults: params.adults ?? 2,
          children: params.children ? Array.from({ length: params.children }, () => 8) : undefined
        },
        currency: 'EUR',
        extras: ['extra_charges', 'photos'],
        rows: 50
      })
    })

    if (response.status === 429) throw new Error('Booking.com : quota atteint (HTTP 429)')
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Booking.com : HTTP ${response.status} ${body.slice(0, 200)}`)
    }
    const payload = (await response.json()) as { data?: BookingRow[] }
    return payload.data ?? []
  }

  async health(): Promise<ProviderHealth> {
    return this.isConfigured()
      ? { name: this.name, reachable: true, detail: 'jeton Demand API présent' }
      : { name: this.name, reachable: false, detail: 'jeton Demand API absent — validation partenaire requise' }
  }
}
