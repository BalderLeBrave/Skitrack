/**
 * Connecteur Ceto / Orchestra — Chamonix Mont-Blanc.
 *
 * Interroge booking.chamonix.com (SERP HTML) avec dates + filtre village.
 * Prix pour le séjour uniquement ; deep-link daté sur chaque fiche.
 */

import { CircuitBreaker, withTimeout } from '../resilience'
import type {
  Accommodation,
  AccommodationProvider,
  ProviderHealth,
  SearchParams
} from '../types'
import { nowIso } from '../types'
import { isChamonixCentral } from './hosts'
import {
  extractChamonixMulti,
  resolveLocationCode,
  type ChamonixListing
} from './chamonixExtract'

export const CETO_CHAMONIX_PROVIDER_NAME = 'ceto-chamonix'

const TIMEOUT_MS = 45_000
const breaker = new CircuitBreaker(3, 60_000)

function toAccommodation(
  item: ChamonixListing,
  params: SearchParams,
  reviews?: { rating: number | null; numReviews: number | null } | null
): Accommodation {
  const total = item.total ?? undefined
  const confidence =
    item.priceConfidence === 'partial'
      ? 'partial'
      : total != null
        ? 'total_confirmed'
        : 'unknown'

  return {
    source: CETO_CHAMONIX_PROVIDER_NAME,
    sourceId: item.id ?? item.url ?? 'unknown',
    title: item.title ?? 'Sans titre',
    url: item.url ?? '',
    latitude: item.lat ?? undefined,
    longitude: item.lon ?? undefined,
    city: item.city ?? undefined,
    country: 'France',
    checkIn: item.priceCheckIn || params.checkIn,
    checkOut: item.priceCheckOut || params.checkOut,
    guests: params.adults,
    totalPrice: total,
    currency: item.currency || 'EUR',
    priceConfidence: confidence,
    rating: reviews?.rating ?? undefined,
    reviewCount: reviews?.numReviews ?? undefined,
    images: item.image ? [item.image] : undefined,
    availability: total != null && total > 0,
    availabilityStatus: total != null && total > 0 ? 'available' : 'unknown',
    retrievedAt: nowIso(),
    rawProviderData: item
  }
}

/** Agrégats TripAdvisor via proxy Orchestra (pas de texte d'avis). */
async function fetchTaAggregates(
  tripadvisorLocationId: string
): Promise<{ rating: number | null; numReviews: number | null } | null> {
  try {
    const url = `https://booking.chamonix.com/api/proxy/tripadvisor-reviews/${tripadvisorLocationId}`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Referer: 'https://booking.chamonix.com/fr/',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(10_000)
    })
    if (!res.ok) return null
    const raw = (await res.json()) as {
      rating?: string | number
      numReviews?: string | number
      error?: string
    }
    if (raw.error) return null
    const rating = raw.rating != null && raw.rating !== '' ? Number(raw.rating) : null
    const numReviews =
      raw.numReviews != null && raw.numReviews !== '' ? Number(raw.numReviews) : null
    return {
      rating: Number.isFinite(rating as number) ? (rating as number) : null,
      numReviews: Number.isFinite(numReviews as number) ? (numReviews as number) : null
    }
  } catch {
    return null
  }
}

/**
 * Active ce connecteur quand la centrale du domaine est booking.chamonix.com.
 */
export function createCetoChamonixProvider(): AccommodationProvider {
  const name = CETO_CHAMONIX_PROVIDER_NAME

  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const central = params.officialUrl?.trim()
      if (!central || !isChamonixCentral(central)) {
        return []
      }

      if (breaker.open) {
        throw new Error(`${name} : ${breaker.reason}`)
      }

      const from = params.checkIn
      const to = params.checkOut
      if (!from || !to) {
        throw new Error(`${name} : dates de séjour requises (checkIn / checkOut).`)
      }

      const location =
        resolveLocationCode(params.destination) ||
        resolveLocationCode(
          params.destination
            ?.toLowerCase()
            .normalize('NFD')
            .replace(/\p{M}/gu, '') ?? ''
        )

      try {
        const result = await withTimeout(
          extractChamonixMulti({
            from,
            to,
            adults: params.adults ?? 2,
            children: params.children ?? 0,
            location,
            maxPages: 2,
            pricedOnly: true,
            types: ['hotel', 'apartment', 'residence']
          }),
          TIMEOUT_MS,
          name
        )

        if (!result.ok) {
          breaker.fail()
          throw new Error(`${name} : ${result.error ?? 'échec extracteur'}`)
        }

        const priced = result.listings.filter(
          (l) => l.total != null && l.total > 0 && l.url && l.title
        )
        // Notes TA en parallèle (max 8, concurrence 3) pour ne pas allonger la recherche
        const REVIEW_CAP = 8
        const CONCURRENCY = 3
        const reviewById = new Map<string, { rating: number | null; numReviews: number | null } | null>()
        const toFetch = priced
          .slice(0, REVIEW_CAP)
          .filter((l) => l.tripadvisorLocationId)
        for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
          const batch = toFetch.slice(i, i + CONCURRENCY)
          const results = await Promise.all(
            batch.map(async (l) => {
              const id = l.tripadvisorLocationId!
              const r = await fetchTaAggregates(id)
              return [id, r] as const
            })
          )
          for (const [id, r] of results) reviewById.set(id, r)
        }
        const offers = priced.map((l) =>
          toAccommodation(
            l,
            params,
            l.tripadvisorLocationId ? reviewById.get(l.tripadvisorLocationId) : null
          )
        )

        if (offers.length === 0) {
          // Stock vide = réponse légitime, pas une panne
          breaker.succeed()
          return []
        }

        breaker.succeed()
        return offers
      } catch (err) {
        breaker.fail()
        throw err
      }
    },
    async health(): Promise<ProviderHealth> {
      return {
        name,
        reachable: !breaker.open,
        detail: breaker.open
          ? breaker.reason
          : 'Centrale Chamonix Mont-Blanc (Orchestra / Ceto) — SERP HTML + filtre village'
      }
    }
  }
}
