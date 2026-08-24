/**
 * Connecteur LocVacances / Arkiane — Pralognan-la-Vanoise.
 *
 * Le catalogue affiche un « à partir de / sem. ». Le montant daté est
 * sur la fiche Lot/Detail (`.availability-rates .rate` + bouton Réserver).
 */

import { CircuitBreaker, withTimeout } from '../resilience'
import type {
  Accommodation,
  AccommodationProvider,
  ProviderHealth,
  SearchParams
} from '../types'
import { nowIso } from '../types'
import { locvacancesSiteOf } from './hosts'
import { extractLocvacances, type LocvacancesListing } from './parse'

export const LOCVACANCES_PROVIDER_NAME = 'locvacances'

const TIMEOUT_MS = 45_000
const breaker = new CircuitBreaker(3, 60_000)

function toAccommodation(item: LocvacancesListing, params: SearchParams): Accommodation {
  return {
    source: LOCVACANCES_PROVIDER_NAME,
    sourceId: item.id,
    title: item.title,
    url: item.url,
    city: item.city,
    country: 'France',
    checkIn: item.priceCheckIn || params.checkIn,
    checkOut: item.priceCheckOut || params.checkOut,
    // Lus dans la fiche (« Chalet 14personnes »), jamais recopiés de la demande.
    guests: item.capacity ?? undefined,
    rooms: item.rooms ?? undefined,
    bedrooms: item.bedrooms ?? undefined,
    totalPrice: item.total,
    currency: item.currency,
    priceConfidence: 'total_confirmed',
    availability: true,
    availabilityStatus: 'available',
    retrievedAt: nowIso(),
    rawProviderData: item
  }
}

export function createLocvacancesProvider(): AccommodationProvider {
  const name = LOCVACANCES_PROVIDER_NAME
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const central = params.officialUrl?.trim()
      if (!central) return []
      const site = locvacancesSiteOf(central)
      if (!site) return []
      if (breaker.open) throw new Error(`${name} : ${breaker.reason}`)
      const from = params.checkIn
      const to = params.checkOut
      if (!from || !to) throw new Error(`${name} : dates de séjour requises.`)
      try {
        const listings = await withTimeout(
          extractLocvacances({ site, from, to }),
          TIMEOUT_MS,
          name
        )
        breaker.succeed()
        return listings.map((l) => toAccommodation(l, params))
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
          : 'Centrale LocVacances — fiche Lot/Detail datée'
      }
    }
  }
}
