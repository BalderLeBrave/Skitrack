/**
 * LiteAPI / Nuitee Connect — le premier connecteur qui ramène réellement des
 * prix sans validation partenaire.
 *
 * ## Pourquoi celui-ci et pas Booking en direct
 *
 * Booking Demand et Expedia Rapid exigent un contrat commercial ; le dossier
 * `docs/RISQUES.md` le documente et rien n'a changé. LiteAPI distribue le même
 * type d'inventaire — plus de deux millions d'établissements, agrégés depuis les
 * mêmes grossistes que les OTA grand public — avec une **inscription en libre
 * service** et une clé utilisable dans la minute. C'est la seule voie vérifiée
 * qui produise un prix total ferme sans demander la permission à personne.
 *
 * Vérifié le 2026-08-12, clé de bac à sable publiée par l'éditeur :
 *
 * * `GET /data/hotels` autour de `45.2967, 6.5806` (Val Thorens), rayon 10 km :
 *   des établissements réels sont renvoyés, avec coordonnées, étoiles, note,
 *   nombre d'avis et photo — dont des hôtels *ski aux pieds* de la station.
 * * `POST /hotels/rates` par coordonnées renvoie des tarifs fermes en euros,
 *   taxes détaillées et politique d'annulation.
 * * Le bac à sable **n'a pas d'inventaire en station de ski** : les mêmes
 *   requêtes y répondent `2001 — no availability found`. Une clé de production
 *   est nécessaire pour juger la couverture réelle en Tarentaise.
 *
 * ## Ce que ce connecteur ne résout pas
 *
 * L'inventaire reste **hôtelier et pararhôtelier** : hôtels, résidences,
 * appart-hôtels. Le chalet de particulier loué sur Airbnb n'y est pas, et aucune
 * API ne le donnera — cet inventaire n'est distribué nulle part ailleurs que
 * chez Airbnb. Voir `airbnb/airbnb.ts` : la redirection reste le seul chemin
 * honnête vers cette offre-là.
 *
 * ## Deux transports, un seul mapper
 *
 * Le même connecteur parle soit au REST, soit au **serveur MCP** de l'éditeur
 * (`mcp.liteapi.travel`). Les deux véhiculent exactement la même charge utile —
 * vérifié en comparant les deux réponses. Le mapping est donc écrit une fois, et
 * le transport devient un réglage. Voir `transport.ts`.
 */

import { debugLog } from '../debug'
import { CircuitBreaker, RateLimiter, TtlCache, withRetry } from '../resilience'
import type {
  Accommodation,
  AccommodationProvider,
  ProviderHealth,
  SearchParams
} from '../types'
import { nowIso } from '../types'
import type { LiteApiTransport } from './transport'

const CACHE_TTL_MS = 10 * 60 * 1000
const MIN_INTERVAL_MS = 200
/** Rayon par défaut : un domaine de Tarentaise et ses villages d'accès. */
const DEFAULT_RADIUS_M = 12_000

/** L'éditeur code « aucune disponibilité » comme une erreur. Ce n'en est pas une. */
const NO_AVAILABILITY_CODE = 2001

export interface LiteApiOptions {
  /** Nationalité du voyageur : change les tarifs et les taxes applicables. */
  guestNationality?: string
  currency?: string
  /** Nombre maximum d'établissements ramenés par recherche. */
  limit?: number
}

/* ------------------------------------------------------------------ *
 * Formes renvoyées par `/hotels/rates`, relevées sur réponse réelle.
 * ------------------------------------------------------------------ */

interface Money {
  amount?: number
  currency?: string
}

export interface LiteApiRate {
  rateId?: string
  name?: string
  maxOccupancy?: number
  adultCount?: number
  boardName?: string
  retailRate?: {
    total?: Money[]
    taxesAndFees?: { included?: boolean; description?: string; amount?: number; currency?: string }[]
  }
  cancellationPolicies?: { refundableTag?: string }
}

export interface LiteApiRoomType {
  offerId?: string
  rates?: LiteApiRate[]
}

export interface LiteApiRateHotel {
  hotelId?: string
  roomTypes?: LiteApiRoomType[]
}

export interface LiteApiHotelBrief {
  id?: string
  name?: string
  main_photo?: string
  thumbnail?: string
  address?: string
  city_name?: string
  country_code?: string
  latitude?: number
  longitude?: number
  /** Note sur 10, comme Booking — pas sur 5. Convertie à l'affichage. */
  rating?: number
  stars?: number
  review_count?: number
}

export interface LiteApiRatesResponse {
  data?: LiteApiRateHotel[]
  hotels?: LiteApiHotelBrief[]
  sandbox?: boolean
  error?: { code?: number; message?: string }
}

/* ------------------------------------------------------------------ *
 * Mapping vers le modèle pivot. Pur, testable sans réseau ni clé.
 * ------------------------------------------------------------------ */

function nightsBetween(checkIn?: string, checkOut?: string): number | null {
  if (!checkIn || !checkOut) return null
  const from = Date.parse(checkIn)
  const to = Date.parse(checkOut)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null
  return Math.round((to - from) / 86_400_000)
}

/**
 * Retient l'offre la moins chère d'un établissement.
 *
 * `maxRatesPerHotel: 1` est demandé à l'API, mais l'appliquer aussi ici évite de
 * dépendre d'un paramètre serveur pour une propriété dont l'affichage dépend :
 * une carte de logement montre *un* prix, et ce prix doit être le plus bas
 * réellement réservable, pas le premier arrivé dans le tableau.
 */
export function cheapestOffer(
  hotel: LiteApiRateHotel
): { rate: LiteApiRate; offerId?: string; total: number; currency?: string } | null {
  let best: { rate: LiteApiRate; offerId?: string; total: number; currency?: string } | null = null

  for (const roomType of hotel.roomTypes ?? []) {
    for (const rate of roomType.rates ?? []) {
      const money = rate.retailRate?.total?.[0]
      if (typeof money?.amount !== 'number' || !Number.isFinite(money.amount)) continue
      if (!best || money.amount < best.total) {
        best = { rate, offerId: roomType.offerId, total: money.amount, currency: money.currency }
      }
    }
  }
  return best
}

/** Somme des taxes **non incluses** au total — celles qui se paient sur place. */
function unincludedTaxes(rate: LiteApiRate): number | undefined {
  const fees = rate.retailRate?.taxesAndFees ?? []
  const extra = fees
    .filter((fee) => fee.included === false && typeof fee.amount === 'number')
    .reduce((sum, fee) => sum + (fee.amount as number), 0)
  return extra > 0 ? extra : undefined
}

/**
 * Assemble tarifs et fiches en `Accommodation[]`.
 *
 * Les deux tableaux de la réponse ne sont pas alignés : `data` porte les prix,
 * `hotels` le contenu descriptif, et ils se rejoignent par `hotelId`. Un
 * établissement tarifé sans fiche descriptive est **écarté** : sans nom ni
 * coordonnées, il n'a ni titre affichable ni distance au domaine, donc aucune
 * utilité dans un comparateur qui trie par accès aux pistes.
 */
export function normalizeLiteApi(
  response: LiteApiRatesResponse,
  context: SearchParams
): Accommodation[] {
  const briefs = new Map<string, LiteApiHotelBrief>()
  for (const brief of response.hotels ?? []) {
    if (brief.id) briefs.set(brief.id, brief)
  }

  const nights = nightsBetween(context.checkIn, context.checkOut)
  const retrievedAt = nowIso()
  const results: Accommodation[] = []

  for (const hotel of response.data ?? []) {
    const hotelId = hotel.hotelId
    if (!hotelId) continue

    const brief = briefs.get(hotelId)
    const title = brief?.name?.trim()
    if (!title) continue

    const offer = cheapestOffer(hotel)
    if (!offer) continue

    const images = [brief?.main_photo, brief?.thumbnail].filter((url): url is string => Boolean(url))

    results.push({
      source: 'liteapi',
      sourceId: hotelId,
      title,
      // Pas de page publique : LiteAPI est un distributeur, pas une vitrine. Le
      // lien pointe donc vers la fiche interne, d'où part la réservation. Écrire
      // ici une URL Booking reconstituée à partir du nom serait une invention.
      url: `#/logements/liteapi/${encodeURIComponent(hotelId)}`,
      latitude: brief?.latitude,
      longitude: brief?.longitude,
      city: brief?.city_name,
      country: brief?.country_code?.toUpperCase(),
      checkIn: context.checkIn,
      checkOut: context.checkOut,
      guests: offer.rate.maxOccupancy ?? context.adults,
      nightlyPrice: nights ? Math.round((offer.total / nights) * 100) / 100 : undefined,
      taxes: unincludedTaxes(offer.rate),
      totalPrice: offer.total,
      currency: offer.currency,
      rating: brief?.rating,
      reviewCount: brief?.review_count,
      amenities: offer.rate.boardName ? [offer.rate.boardName] : undefined,
      images: images.length ? images : undefined,
      // `/hotels/rates` ne renvoie que du réservable aux dates demandées.
      availability: true,
      availabilityStatus: 'available',
      priceConfidence: 'total_confirmed',
      offerId: offer.offerId,
      retrievedAt,
      rawProviderData: { rates: hotel, hotel: brief }
    })
  }

  return results
}

/* ------------------------------------------------------------------ *
 * Connecteur.
 * ------------------------------------------------------------------ */

export class LiteApiProvider implements AccommodationProvider {
  readonly name = 'liteapi'

  private readonly cache = new TtlCache<Accommodation[]>(CACHE_TTL_MS)
  private readonly breaker = new CircuitBreaker()
  private readonly limiter = new RateLimiter(MIN_INTERVAL_MS)
  /** Résolutions `texte → placeId`, stables et coûteuses : gardées une heure. */
  private readonly places = new TtlCache<string | null>(60 * 60 * 1000)

  constructor(
    private readonly transport: () => LiteApiTransport | null,
    private readonly options: LiteApiOptions = {}
  ) {}

  isConfigured(): boolean {
    return this.transport() !== null
  }

  async search(params: SearchParams): Promise<Accommodation[]> {
    const transport = this.transport()
    if (!transport) {
      throw new Error(
        'LiteAPI : aucune clé. Réglages → Clés d’API → « LiteAPI », ou LITEAPI_KEY. ' +
          'L’inscription est libre sur dashboard.liteapi.travel/register ; une clé « sand_ » suffit pour essayer.'
      )
    }
    if (this.breaker.open) throw new Error(`LiteAPI : ${this.breaker.reason}`)

    if (!params.checkIn || !params.checkOut) {
      // Sans dates, l'API ne peut rien tarifer. Le dire vaut mieux que renvoyer
      // une liste vide qu'on lirait comme « pas de logement dans ce domaine ».
      throw new Error('LiteAPI : des dates d’arrivée et de départ sont nécessaires pour obtenir un prix.')
    }

    const key = JSON.stringify([
      params.destination,
      params.latitude,
      params.longitude,
      params.radiusMeters,
      params.checkIn,
      params.checkOut,
      params.adults,
      params.children
    ])
    const cached = this.cache.get(key)
    if (cached) return cached

    debugLog('LiteAPI', 'Search started', {
      transport: transport.kind,
      geo: params.latitude != null && params.longitude != null
    })

    try {
      const body = await this.buildBody(transport, params)
      await this.limiter.acquire()
      const response = await withRetry(() => transport.rates(body), {
        // Un refus d'authentification ou une absence d'inventaire donnera la
        // même réponse au second essai : insister ne fait que coûter du quota.
        retryable: (error) => !/40[13]|HTTP 4/.test(String(error))
      })

      if (response.error) {
        if (response.error.code === NO_AVAILABILITY_CODE) {
          debugLog('LiteAPI', 'Number of normalized results', { raw: 0, normalized: 0 })
          this.breaker.succeed()
          this.cache.set(key, [])
          return []
        }
        throw new Error(`LiteAPI : ${response.error.message ?? 'erreur'} (code ${response.error.code})`)
      }

      const results = normalizeLiteApi(response, params)
      debugLog('LiteAPI', 'Number of normalized results', {
        raw: response.data?.length ?? 0,
        normalized: results.length,
        sandbox: response.sandbox === true
      })

      this.breaker.succeed()
      this.cache.set(key, results)
      return results
    } catch (error) {
      this.breaker.fail()
      debugLog('LiteAPI', 'Number of errors', { errors: 1, message: (error as Error).message })
      throw error
    }
  }

  /**
   * Construit le corps de `/hotels/rates`.
   *
   * L'API exige **une** méthode de localisation. Par ordre de préférence :
   * coordonnées du domaine, puis `placeId` résolu depuis le libellé, puis rien —
   * auquel cas on refuse plutôt que d'envoyer une requête qui ramènerait une
   * ville homonyme à l'autre bout du pays.
   */
  private async buildBody(
    transport: LiteApiTransport,
    params: SearchParams
  ): Promise<Record<string, unknown>> {
    const occupancy: Record<string, unknown> = { adults: params.adults ?? 2 }
    if (params.children) {
      // L'API attend les âges, pas un décompte. Sans information, 8 ans est un
      // âge qui ne déclenche ni tarif bébé ni tarif adulte chez la plupart des
      // hôteliers : le prix reste représentatif.
      occupancy.children = Array.from({ length: params.children }, () => 8)
    }

    const body: Record<string, unknown> = {
      occupancies: [occupancy],
      currency: this.options.currency ?? 'EUR',
      guestNationality: this.options.guestNationality ?? 'FR',
      checkin: params.checkIn,
      checkout: params.checkOut,
      maxRatesPerHotel: 1,
      includeHotelData: true,
      limit: this.options.limit ?? 50
    }

    if (params.latitude != null && params.longitude != null) {
      body.latitude = params.latitude
      body.longitude = params.longitude
      body.radius = params.radiusMeters ?? DEFAULT_RADIUS_M
      return body
    }

    const placeId = await this.resolvePlace(transport, params.destination)
    if (!placeId) {
      throw new Error(
        `LiteAPI : « ${params.destination} » n’a pas été reconnu comme lieu. ` +
          'Renseignez les coordonnées du domaine pour une recherche par rayon.'
      )
    }
    body.placeId = placeId
    return body
  }

  private async resolvePlace(transport: LiteApiTransport, query: string): Promise<string | null> {
    const cached = this.places.get(query)
    if (cached !== undefined) return cached

    const found = await transport.places(query)
    // Le premier résultat est le mieux classé ; on ne cherche pas à arbitrer
    // entre plusieurs lieux ici, l'utilisateur a déjà choisi son domaine.
    const placeId = found[0]?.placeId ?? null
    this.places.set(query, placeId)
    return placeId
  }

  async health(): Promise<ProviderHealth> {
    const transport = this.transport()
    if (!transport) {
      return {
        name: this.name,
        reachable: false,
        detail: 'clé absente — inscription libre sur dashboard.liteapi.travel/register'
      }
    }
    return {
      name: this.name,
      reachable: true,
      detail: `clé présente — transport ${transport.kind}${transport.sandbox ? ', bac à sable' : ''}`
    }
  }
}
