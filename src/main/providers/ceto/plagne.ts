/**
 * Connecteur Orchestra — La Plagne (laplagneresort.com).
 *
 * Dates : s_dd + s_dmy + s_minMan. Village : s_c.location (A2, BP, PC…).
 * Grille d'occupation de la fiche ; sans elle, tarif SERP = `partial`.
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
import { occupancyGridsForSerp } from './ficheOccupancy'
import { priceForGroupIn, type FicheOccupancy } from './occupancy'

export const CETO_PLAGNE_PROVIDER_NAME = 'ceto-plagne'

const TIMEOUT_MS = 45_000
const breaker = new CircuitBreaker(3, 60_000)

function toAccommodation(
  item: ChamonixListing,
  params: SearchParams,
  grid?: FicheOccupancy | null,
  groupPrice?: number | null
): Accommodation {
  const total = grid ? (groupPrice ?? undefined) : (item.total ?? undefined)
  const confidence =
    grid != null
      ? groupPrice != null
        ? 'total_confirmed'
        : 'unknown'
      : item.priceConfidence === 'partial' || total != null
        ? 'partial'
        : 'unknown'
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
    guests: grid?.maxPax,
    priceOptions: grid?.options.map((o) => ({
      guests: o.pax,
      total: o.total,
      condition: o.condition,
      policy: o.policy
    })),
    totalPrice: total,
    currency: item.currency || 'EUR',
    priceConfidence: confidence,
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
        const priced = result.listings.filter(
          (l) => l.total != null && l.total > 0 && l.url && l.title
        )
        const pax = (params.adults ?? 2) + (params.children ?? 0)
        const byUrl = await occupancyGridsForSerp(priced, from, to, '')
        const offers = priced.map((l) => {
          const grid = l.url ? (byUrl.get(l.url) ?? null) : null
          const groupPrice = grid ? priceForGroupIn(grid, pax) : null
          return toAccommodation(l, params, grid, groupPrice)
        })
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
          : 'Centrale La Plagne (Orchestra) — SERP + grille d’occupation'
      }
    }
  }
}
