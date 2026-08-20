/**
 * Connecteur Ublo / MSEM — Alpe d’Huez, Sainte-Foy, Saint-François-Longchamp.
 *
 * Prix séjour daté (pas un « à partir de ») : POST offers MSEM.
 */

import { CircuitBreaker, withTimeout } from '../resilience'
import type {
  Accommodation,
  AccommodationProvider,
  ProviderHealth,
  SearchParams
} from '../types'
import { nowIso } from '../types'
import { ubloSiteOf } from './hosts'
import { extractUblo, type UbloListing } from './msem'

export const UBLO_PROVIDER_NAME = 'ublo-msem'

const TIMEOUT_MS = 45_000
const breaker = new CircuitBreaker(3, 60_000)

function toAccommodation(item: UbloListing, params: SearchParams): Accommodation {
  return {
    source: UBLO_PROVIDER_NAME,
    sourceId: item.id,
    title: item.title,
    url: item.url,
    latitude: item.lat ?? undefined,
    longitude: item.lon ?? undefined,
    city: item.city ?? undefined,
    country: 'France',
    checkIn: item.priceCheckIn || params.checkIn,
    checkOut: item.priceCheckOut || params.checkOut,
    guests: params.adults,
    rooms: item.rooms ?? undefined,
    totalPrice: item.total,
    currency: item.currency,
    priceConfidence: 'total_confirmed',
    images: item.image ? [item.image] : undefined,
    availability: true,
    availabilityStatus: 'available',
    retrievedAt: nowIso(),
    rawProviderData: item
  }
}

export function createUbloProvider(): AccommodationProvider {
  const name = UBLO_PROVIDER_NAME
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const central = params.officialUrl?.trim()
      if (!central) return []
      const site = ubloSiteOf(central)
      if (!site) return []
      if (breaker.open) throw new Error(`${name} : ${breaker.reason}`)
      const from = params.checkIn
      const to = params.checkOut
      if (!from || !to) throw new Error(`${name} : dates de séjour requises.`)

      try {
        const result = await withTimeout(
          extractUblo({
            site,
            from,
            to,
            adults: params.adults ?? 2,
            children: params.children ?? 0
          }),
          TIMEOUT_MS,
          name
        )
        if (!result.ok) {
          breaker.fail()
          throw new Error(`${name} : ${result.error ?? 'échec extracteur'}`)
        }
        const offers = result.listings
          .filter((l) => l.total > 0 && l.url && l.title)
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
          : 'Centrale Ublo / MSEM — liste + offres datées (JSON)'
      }
    }
  }
}
