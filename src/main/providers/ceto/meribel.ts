/**
 * Connecteur Orchestra — Méribel (reservations.meribel.net).
 *
 * SERP + grille d'occupation de la fiche. Sans grille, tarif SERP = `partial`.
 */

import { CircuitBreaker, withTimeout } from '../resilience'
import type {
  Accommodation,
  AccommodationProvider,
  ProviderHealth,
  SearchParams
} from '../types'
import { nowIso } from '../types'
import { isMeribelCentral } from './hosts'
import { extractChamonixMulti, type ChamonixListing } from './chamonixExtract'
import { occupancyGridsForSerp } from './ficheOccupancy'
import { priceForGroupIn, type FicheOccupancy } from './occupancy'

export const CETO_MERIBEL_PROVIDER_NAME = 'ceto-meribel'

/**
 * Délai de l'extraction SERP.
 *
 * Quatre-vingt-dix secondes depuis que la pagination va au bout : Méribel
 * rend ses 835 fiches en 20 s un bon jour, et 45 s ne laissaient plus de
 * marge. Ce délai ne couvre que la SERP ; les grilles d'occupation ont leur
 * propre budget dans `ficheOccupancy`.
 */
const TIMEOUT_MS = 90_000
const breaker = new CircuitBreaker(3, 60_000)

function cityMatches(city: string | null | undefined, destination: string): boolean {
  if (!city || !destination) return true
  const n = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const c = n(city)
  const d = n(destination)
  if (c.includes(d) || d.includes(c)) return true
  if (d.includes('mottaret') && !c.includes('mottaret')) return false
  return true
}

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
    source: CETO_MERIBEL_PROVIDER_NAME,
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

export function createCetoMeribelProvider(): AccommodationProvider {
  const name = CETO_MERIBEL_PROVIDER_NAME
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const central = params.officialUrl?.trim()
      if (!central || !isMeribelCentral(central)) return []
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
            // Pas de plafond ici : `chamonixParse` en tient un, mesuré, et un
            // second réglage au même endroit finirait par le contredire.
            pricedOnly: true,
            types: ['hotel', 'apartment', 'residence'],
            site: 'meribel'
          }),
          TIMEOUT_MS,
          name
        )
        if (!result.ok) {
          breaker.fail()
          throw new Error(`${name} : ${result.error ?? 'échec extracteur'}`)
        }
        const dest = params.destination ?? ''
        const priced = result.listings
          .filter((l) => l.total != null && l.total > 0 && l.url && l.title)
          .filter((l) => cityMatches(l.city, dest))
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
          : 'Centrale Méribel (Orchestra) — SERP + grille d’occupation'
      }
    }
  }
}
