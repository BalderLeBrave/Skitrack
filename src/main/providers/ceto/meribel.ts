/**
 * Connecteur Orchestra — Méribel (reservations.meribel.net).
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

export const CETO_MERIBEL_PROVIDER_NAME = 'ceto-meribel'

const TIMEOUT_MS = 45_000
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

function toAccommodation(item: ChamonixListing, params: SearchParams): Accommodation {
  const total = item.total ?? undefined
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
            maxPages: 2,
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
        const offers = result.listings
          .filter((l) => l.total != null && l.total > 0 && l.url && l.title)
          .filter((l) => cityMatches(l.city, dest))
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
        detail: breaker.open ? breaker.reason : 'Centrale Méribel (Orchestra) — SERP HTML'
      }
    }
  }
}
