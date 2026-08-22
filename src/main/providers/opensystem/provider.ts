/**
 * Connecteur Open System — Toussuire, Dévoluy, Ax, Valmorel, La Bresse…
 *
 * JSONP etape-rest puis HTML de la zone. Prix séjour uniquement.
 */

import { CircuitBreaker, withTimeout } from '../resilience'
import type {
  Accommodation,
  AccommodationProvider,
  ProviderHealth,
  SearchParams
} from '../types'
import { nowIso } from '../types'
import { opensystemSiteOf } from './hosts'
import { extractOpenSystem } from './extract'
import type { OpenSystemListing } from './parse'

export const OPENSYSTEM_PROVIDER_NAME = 'opensystem'

const TIMEOUT_MS = 45_000
const breakersByHost = new Map<string, CircuitBreaker>()

function breakerFor(host: string): CircuitBreaker {
  let b = breakersByHost.get(host)
  if (!b) {
    b = new CircuitBreaker(3, 60_000)
    breakersByHost.set(host, b)
  }
  return b
}

function toAccommodation(item: OpenSystemListing, params: SearchParams): Accommodation {
  return {
    source: OPENSYSTEM_PROVIDER_NAME,
    sourceId: item.id,
    title: item.title,
    url: item.url,
    latitude: item.lat ?? undefined,
    longitude: item.lon ?? undefined,
    city: item.city ?? undefined,
    country: 'France',
    checkIn: item.priceCheckIn || params.checkIn,
    checkOut: item.priceCheckOut || params.checkOut,
    // Ni `etape-rest` ni `vueinfo` ne publient de capacité.
    guests: undefined,
    totalPrice: item.total,
    currency: item.currency,
    priceConfidence: item.priceConfidence === 'partial' ? 'partial' : 'total_confirmed',
    images: item.image ? [item.image] : undefined,
    availability: item.total > 0,
    availabilityStatus: item.total > 0 ? 'available' : 'unknown',
    retrievedAt: nowIso(),
    rawProviderData: item
  }
}

export function createOpenSystemProvider(): AccommodationProvider {
  const name = OPENSYSTEM_PROVIDER_NAME
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const central = params.officialUrl?.trim()
      if (!central) return []
      const site = opensystemSiteOf(central)
      if (!site) return []
      const breaker = breakerFor(site.host)
      if (breaker.open) throw new Error(`${name} : ${breaker.reason}`)
      const from = params.checkIn
      const to = params.checkOut
      if (!from || !to) throw new Error(`${name} : dates de séjour requises.`)

      try {
        const result = await withTimeout(
          extractOpenSystem({
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
      const open = [...breakersByHost.entries()].filter(([, b]) => b.open)
      return {
        name,
        reachable: open.length === 0,
        detail: open.length
          ? open.map(([h, b]) => `${h} : ${b.reason}`).join(' ; ')
          : 'Centrale Open System — JSONP etape-rest / HTML zone, disjoncteur par hôte'
      }
    }
  }
}
