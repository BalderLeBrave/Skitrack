/**
 * Connecteur Orchestra — La Plagne (laplagneresort.com).
 *
 * Dates : s_dd + s_dmy + s_minMan. Village : s_c.location (A2, BP, PC…).
 */

import { CircuitBreaker, withTimeout } from '../resilience'
import type {
  Accommodation,
  AccommodationProvider,
  ProviderHealth,
  SearchParams
} from '../types'
import { nowIso } from '../types'
import { isPlagneCentral } from './hosts'
import { extractChamonixMulti, resolveLocationCode, type ChamonixListing } from './chamonixExtract'

export const CETO_PLAGNE_PROVIDER_NAME = 'ceto-plagne'

const TIMEOUT_MS = 45_000
const breaker = new CircuitBreaker(3, 60_000)

function toAccommodation(item: ChamonixListing, params: SearchParams): Accommodation {
  const total = item.total ?? undefined
  return {
    source: CETO_PLAGNE_PROVIDER_NAME,
    sourceId: item.id ?? item.url ?? 'unknown',
    title: item.title ?? 'Sans titre',
    url: item.url ?? '',
    latitude: item.lat ?? undefined,
    longitude: item.lon ?? undefined,
    city: item.city ?? undefined,
    country: 'France',
    checkIn: item.priceCheckIn || params.checkIn,
    checkOut: item.priceCheckOut || params.checkOut,
    // La SERP Orchestra ne publie pas la capacité — elle n'est lisible que dans
    // le sélecteur d'occupation de la fiche, rendu par le widget. Absente donc,
    // plutôt que recopiée de la demande.
    guests: undefined,
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

export function createCetoPlagneProvider(): AccommodationProvider {
  const name = CETO_PLAGNE_PROVIDER_NAME
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const central = params.officialUrl?.trim()
      if (!central || !isPlagneCentral(central)) return []
      if (breaker.open) throw new Error(`${name} : ${breaker.reason}`)
      const from = params.checkIn
      const to = params.checkOut
      if (!from || !to) throw new Error(`${name} : dates de séjour requises.`)

      const location = resolveLocationCode(params.destination)

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
            types: ['hotel', 'apartment'],
            site: 'plagne'
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
        detail: breaker.open
          ? breaker.reason
          : 'Centrale La Plagne (Orchestra) — SERP + filtre village'
      }
    }
  }
}
