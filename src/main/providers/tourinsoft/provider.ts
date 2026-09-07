/**
 * Connecteur Tourinsoft — Les Angles.
 *
 * Catalogue `/tous-les-hebergements/` : cartes `tsc-card` dumpées 2026-09-02.
 * Tarif « à partir de » → partial. Open System 1395 n’est pas ce connecteur.
 */

import { CircuitBreaker, withTimeout } from '../resilience'
import type {
  Accommodation,
  AccommodationProvider,
  ProviderHealth,
  SearchParams
} from '../types'
import { nowIso } from '../types'
import { tourinsoftSiteOf } from './hosts'
import { extractTourinsoft } from './extract'

export const TOURINSOFT_PROVIDER_NAME = 'tourinsoft'

const TIMEOUT_MS = 45_000
const breaker = new CircuitBreaker(3, 60_000)

export function createTourinsoftProvider(): AccommodationProvider {
  const name = TOURINSOFT_PROVIDER_NAME
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const central = params.officialUrl?.trim()
      if (!central) return []
      const site = tourinsoftSiteOf(central)
      if (!site) return []
      if (breaker.open) throw new Error(`${name} : ${breaker.reason}`)
      const from = params.checkIn
      const to = params.checkOut
      if (!from || !to) throw new Error(`${name} : dates de séjour requises.`)
      try {
        const result = await withTimeout(extractTourinsoft({ site }), TIMEOUT_MS, name)
        if (!result.ok) {
          breaker.fail()
          throw new Error(`${name} : ${result.error ?? 'échec extracteur'}`)
        }
        breaker.succeed()
        return result.listings
          .filter((item) => item.url && item.title)
          .map((item, rank) => ({
            source: name,
            sourceId: item.id,
            title: item.title,
            url: item.url,
            city: 'Les Angles',
            country: 'France',
            checkIn: from,
            checkOut: to,
            guests: item.guests ?? undefined,
            bedrooms: item.bedrooms ?? undefined,
            totalPrice: item.weekMin ?? undefined,
            currency: 'EUR',
            priceConfidence: 'partial' as const,
            images: item.image ? [item.image] : undefined,
            availability: true,
            availabilityStatus: 'available' as const,
            searchPageIndex: 0,
            searchRank: rank,
            retrievedAt: nowIso(),
            rawProviderData: item
          }))
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
          : 'Tourinsoft — tsc-card Les Angles (dump 2026-09-02)'
      }
    }
  }
}
