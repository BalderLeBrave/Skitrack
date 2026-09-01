/**
 * Connecteur Diffusio — Super Besse + Mont-Dore (www.sancy.com).
 *
 * SERP datée : capacité. Fiche : chambres + tarif semaine (fourchette → partial).
 */

import { CircuitBreaker, withTimeout } from '../resilience'
import type {
  Accommodation,
  AccommodationProvider,
  ProviderHealth,
  SearchParams
} from '../types'
import { nowIso } from '../types'
import { diffusioSiteOf } from './hosts'
import { extractDiffusio } from './extract'

export const DIFFUSIO_PROVIDER_NAME = 'diffusio'

const TIMEOUT_MS = 45_000
const breaker = new CircuitBreaker(3, 60_000)

export function createDiffusioProvider(): AccommodationProvider {
  const name = DIFFUSIO_PROVIDER_NAME
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const central = params.officialUrl?.trim()
      if (!central) return []
      const site = diffusioSiteOf(central)
      if (!site) return []
      if (breaker.open) throw new Error(`${name} : ${breaker.reason}`)
      const from = params.checkIn
      const to = params.checkOut
      if (!from || !to) throw new Error(`${name} : dates de séjour requises.`)
      try {
        const result = await withTimeout(
          extractDiffusio({
            site,
            from,
            to,
            minGuests: params.adults ?? 0
          }),
          TIMEOUT_MS,
          name
        )
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
            city: item.city ?? undefined,
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
          : 'Diffusio — SERP datée + fiche chambres (dump 2026-09-01)'
      }
    }
  }
}
