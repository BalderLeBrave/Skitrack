/**
 * Connecteur LocVacances — Pralognan-la-Vanoise.
 *
 * Contournement dumpé : cookies + getListe paginé + getFiche si pièces absentes.
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
import { extractLocvacances } from './extract'

export const LOCVACANCES_PROVIDER_NAME = 'locvacances'

const TIMEOUT_MS = 45_000
const breaker = new CircuitBreaker(3, 60_000)

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
        const result = await withTimeout(
          extractLocvacances({ site, from, to }),
          TIMEOUT_MS,
          name
        )
        if (!result.ok) {
          breaker.fail()
          throw new Error(`${name} : ${result.error ?? 'échec extracteur'}`)
        }
        breaker.succeed()
        return result.listings.map((item, rank) => ({
          source: name,
          sourceId: item.id,
          title: item.title,
          url: item.url,
          latitude: item.lat ?? undefined,
          longitude: item.lon ?? undefined,
          city: item.city ?? undefined,
          country: 'France',
          checkIn: from,
          checkOut: to,
          guests: item.guests ?? undefined,
          rooms: item.rooms ?? undefined,
          totalPrice: item.total,
          currency: 'EUR',
          priceConfidence: 'total_confirmed' as const,
          images: item.image ? [item.image] : undefined,
          availability: true,
          availabilityStatus: 'available' as const,
          searchPageIndex: Math.floor(rank / 12),
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
          : 'LocVacances — getListe + getFiche (dump 2026-09-01)'
      }
    }
  }
}
