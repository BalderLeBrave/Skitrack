/**
 * Connecteur Deskline — La Clusaz (DW5). Contournement dumpé 2026-09-01.
 */

import { CircuitBreaker, withTimeout } from '../resilience'
import type {
  Accommodation,
  AccommodationProvider,
  ProviderHealth,
  SearchParams
} from '../types'
import { nowIso } from '../types'
import { desklineSiteOf } from './hosts'
import { extractDeskline } from './extract'

export const DESKLINE_PROVIDER_NAME = 'deskline'

const TIMEOUT_MS = 45_000
const breaker = new CircuitBreaker(3, 60_000)

export function createDesklineProvider(): AccommodationProvider {
  const name = DESKLINE_PROVIDER_NAME
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const central = params.officialUrl?.trim()
      if (!central) return []
      const site = desklineSiteOf(central)
      if (!site) return []
      if (breaker.open) throw new Error(`${name} : ${breaker.reason}`)
      const from = params.checkIn
      const to = params.checkOut
      if (!from || !to) throw new Error(`${name} : dates de séjour requises.`)
      try {
        const result = await withTimeout(
          extractDeskline({
            site,
            from,
            to,
            adults: params.adults ?? 2,
            bedrooms: params.bedrooms ?? 0
          }),
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
          country: 'France',
          checkIn: from,
          checkOut: to,
          // Plancher appliqué par POST /filters bedrooms[] — pas un décompte publié.
          bedrooms: item.bedroomsFloor ?? undefined,
          totalPrice: item.total,
          currency: 'EUR',
          priceConfidence: 'total_confirmed' as const,
          availability: true,
          availabilityStatus: 'available' as const,
          searchPageIndex: Math.floor(rank / 24),
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
          : 'Deskline DW5 — POST /searches + bedrooms[] (dump 2026-09-01)'
      }
    }
  }
}
