/**
 * Connecteur Orchestra — Megève (megeve-booking.com).
 */

import { CircuitBreaker, withTimeout } from '../resilience'
import type {
  Accommodation,
  AccommodationProvider,
  ProviderHealth,
  SearchParams
} from '../types'
import { nowIso } from '../types'
import { isMegeveCentral } from './hosts'
import { extractChamonixMulti, type ChamonixListing } from './chamonixExtract'

export const CETO_MEGEVE_PROVIDER_NAME = 'ceto-megeve'

const TIMEOUT_MS = 45_000
const breaker = new CircuitBreaker(3, 60_000)

function toAccommodation(item: ChamonixListing, params: SearchParams): Accommodation {
  const total = item.total ?? undefined
  return {
    source: CETO_MEGEVE_PROVIDER_NAME,
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
    priceConfidence:
      item.priceConfidence === 'partial' ? 'partial' : total != null ? 'total_confirmed' : 'unknown',
    images: item.image ? [item.image] : undefined,
    availability: total != null && total > 0,
    availabilityStatus: total != null && total > 0 ? 'available' : 'unknown',
    retrievedAt: nowIso(),
    rawProviderData: item
  }
}

export function createCetoMegeveProvider(): AccommodationProvider {
  const name = CETO_MEGEVE_PROVIDER_NAME
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const central = params.officialUrl?.trim()
      if (!central || !isMegeveCentral(central)) return []
      if (breaker.open) throw new Error(`${name} : ${breaker.reason}`)
      const from = params.checkIn
      const to = params.checkOut
      if (!from || !to) throw new Error(`${name} : dates de séjour requises.`)

      try {
        const result = await withTimeout(
          extractChamonixMulti({
            from,
            to,
            adults: params.adults ?? 2,
            children: params.children ?? 0,
            location: null,
            maxPages: 2,
            pricedOnly: true,
            types: ['hotel', 'apartment', 'residence'],
            site: 'megeve'
          }),
          TIMEOUT_MS,
          name
        )
        if (!result.ok) {
          breaker.fail()
          throw new Error(`${name} : ${result.error ?? 'échec extracteur'}`)
        }
        const offers = result.listings
          .filter((l) => l.total != null && l.total > 0 && l.url && l.title)
          .map((l) => toAccommodation(l, params))
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
        detail: breaker.open ? breaker.reason : 'Centrale Megève (Orchestra) — SERP HTML'
      }
    }
  }
}
