/**
 * Booking.com via Omkar.cloud (HTTP JSON) — même clé que Airbnb.
 *
 * Endpoints : autocomplete + /booking/hotels/search (25 / page, 40 max).
 * Fiches `/hotels/details` : hors walk (1 req / hôtel).
 * Plafond : SEARCH_WALK.maxPages (15), comme Playwright.
 */

import { SEARCH_WALK, isPrivateOrSharedListing } from '@shared/searchWalk'
import { stampPagination, type StoppedReason } from '@shared/reasonCodes'
import type { Accommodation, SearchParams } from '../types'
import { baseAccommodation, listingPhotoUrl, stampStayOnUrl } from '../webscrape/shared'

const BASE = 'https://booking-scraper.omkar.cloud'
const PAGE_CONCURRENCY = 3
const REQUEST_TIMEOUT_MS = 25_000
const LOCALE = 'fr'
const CURRENCY = 'EUR'

export function resolveOmkarBookingKey(
  vault: Record<string, string | undefined> = {},
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const raw =
    vault.omkar_booking ??
    vault.omkar_airbnb ??
    env.OMKAR_BOOKING_KEY ??
    env.OMKAR_AIRBNB_KEY ??
    env.OMKAR_API_KEY
  const key = typeof raw === 'string' ? raw.trim() : ''
  return key || undefined
}

export type OmkarBookingOk = {
  ok: true
  list: Accommodation[]
  url: string
  meta: {
    pagesFetched: number
    advertised: number | null
    stoppedReason: StoppedReason
    destId?: string
    destType?: string
    query?: string
    ms: number
  }
}

export type OmkarBookingFail = {
  ok: false
  error: string
  url?: string
  blocked: boolean
}

export type OmkarBookingOutcome = OmkarBookingOk | OmkarBookingFail

export type OmkarBookingHit = {
  id?: string | number
  name?: string
  link?: string
  page_name?: string
  accommodation_type?: string | null
  image?: string
  location?: {
    address?: string
    city?: string
    country_code?: string
    latitude?: number
    longitude?: number
  }
  rating?: { score?: number; count?: number; stars?: number }
  unit?: { name?: string | null; beds?: number | null; bedrooms?: number | null }
  price?: {
    currency?: string
    total?: number | null
    per_night?: number | null
  }
  is_sold_out?: boolean
}

type OmkarSearchJson = {
  query?: string
  destination?: { dest_id?: string | number; dest_type?: string; name?: string; label?: string }
  /** Schéma README (parfois absent). */
  pagination?: {
    page?: number
    items_per_page?: number
    total_results?: number
    total_pages?: number
  }
  /** Schéma réel 2026-09-05 : count / per_page / total_pages au 1er niveau. */
  count?: number
  per_page?: number
  current_page?: number
  total_pages?: number
  next?: string | null
  results?: OmkarBookingHit[]
  error?: string
  detail?: string
  message?: string
}

type OmkarAutoHit = {
  dest_id?: string | number
  dest_type?: string
  name?: string
  label?: string
  country_code?: string
  nr_homes?: number
  nr_hotels?: number
}

type OmkarAutoJson = {
  results?: OmkarAutoHit[]
  error?: string
}

async function omkarGet(
  path: string,
  query: Record<string, string | number | undefined>,
  apiKey: string
): Promise<{ status: number; json: unknown; ms: number }> {
  const url = new URL(path, BASE)
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === '') continue
    url.searchParams.set(k, String(v))
  }
  const started = Date.now()
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'API-Key': apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    json = { error: `Réponse non JSON (${res.status})` }
  }
  return { status: res.status, json, ms: Date.now() - started }
}

function failMessage(status: number, json: unknown): string {
  const rec = json && typeof json === 'object' ? (json as Record<string, unknown>) : {}
  const msg = [rec.error, rec.detail, rec.message].find((x) => typeof x === 'string' && x.trim()) as
    | string
    | undefined
  if (status === 401 || status === 403) {
    return 'Clé Omkar Booking refusée. Réglages → Clés d’API → Omkar Booking.'
  }
  if (status === 429) return 'Quota Omkar Booking dépassé (429). Réessayez plus tard.'
  if (status === 402) return 'Quota Omkar Booking épuisé (plan).'
  return msg ? `Omkar Booking HTTP ${status} : ${msg}` : `Omkar Booking HTTP ${status}`
}

async function pool<T>(n: number, tasks: Array<() => Promise<T>>): Promise<T[]> {
  const out: T[] = new Array(tasks.length)
  let i = 0
  const worker = async (): Promise<void> => {
    while (i < tasks.length) {
      const j = i++
      out[j] = await tasks[j]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, n), tasks.length) }, () => worker()))
  return out
}

export function pickDestination(hits: OmkarAutoHit[], query: string): OmkarAutoHit | undefined {
  const list = hits.filter((h) => h.dest_id != null && h.dest_type)
  if (list.length === 0) return undefined
  const q = query.toLowerCase()
  const notHotel = list.filter((h) => h.dest_type !== 'hotel')
  const pool = notHotel.length > 0 ? notHotel : list
  const frCity = pool.find(
    (h) => h.dest_type === 'city' && (h.country_code ?? '').toLowerCase() === 'fr'
  )
  if (frCity) return frCity
  const city = pool.find((h) => h.dest_type === 'city')
  if (city) return city
  const landmark = pool.find(
    (h) => h.dest_type === 'landmark' && (h.name ?? '').toLowerCase().includes(q)
  )
  if (landmark) return landmark
  const named = pool.find((h) => (h.name ?? '').toLowerCase().includes(q))
  return named ?? pool[0]
}

const destCache = new Map<string, { destId: string; destType: string; query: string }>()

async function resolveDestination(
  city: string,
  apiKey: string
): Promise<{ destId?: string; destType?: string; query: string }> {
  const key = city.trim().toLowerCase()
  const cached = destCache.get(key)
  if (cached) return cached
  const { status, json } = await omkarGet(
    '/booking/hotels/autocomplete',
    { query: city, locale: LOCALE },
    apiKey
  )
  if (status !== 200) return { query: city }
  const body = json as OmkarAutoJson
  const pick = pickDestination(Array.isArray(body.results) ? body.results : [], city)
  if (!pick?.dest_id || !pick.dest_type) return { query: city }
  const resolved = {
    destId: String(pick.dest_id),
    destType: pick.dest_type,
    query: (pick.label || pick.name || city).trim()
  }
  destCache.set(key, resolved)
  return resolved
}

/** Hôtel / auberge : pas un logement entier. Type absent → on garde. */
export function isBookingHotelListing(type?: string | null): boolean {
  if (!type || !type.trim()) return false
  if (isPrivateOrSharedListing(type)) return true
  const t = type
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (/aparthotel|appart[- ]?hotel|residence/.test(t)) return false
  return /^(hotel|hostel|motel|inn|riad)\b/.test(t)
}

export function mapOmkarBookingHit(
  hit: OmkarBookingHit,
  params: SearchParams,
  pageIndex = 1,
  rank = 0
): Accommodation | null {
  const id = hit.id != null ? String(hit.id).trim() : ''
  const title = (hit.name ?? '').trim()
  const url = typeof hit.link === 'string' ? hit.link.trim() : ''
  if (!id || !title || !url) return null
  if (hit.is_sold_out) return null
  if (isBookingHotelListing(hit.accommodation_type) || isPrivateOrSharedListing(title)) return null

  const total = hit.price?.total
  const hasTotal = typeof total === 'number' && Number.isFinite(total) && total > 0
  if (!hasTotal && params.checkIn && params.checkOut) return null

  const nightly = hit.price?.per_night
  const bedrooms = hit.unit?.bedrooms
  const beds = hit.unit?.beds
  const lat = hit.location?.latitude
  const lon = hit.location?.longitude
  const photo = listingPhotoUrl(hit.image, url)
  const currency =
    typeof hit.price?.currency === 'string' && hit.price.currency.trim()
      ? hit.price.currency.trim()
      : CURRENCY

  const acc = baseAccommodation(
    'booking-web',
    {
      sourceId: id,
      title,
      url: stampStayOnUrl(url, params),
      latitude: typeof lat === 'number' && Number.isFinite(lat) ? lat : undefined,
      longitude: typeof lon === 'number' && Number.isFinite(lon) ? lon : undefined,
      city: hit.location?.city,
      country: hit.location?.country_code,
      totalPrice: hasTotal ? Math.round(total * 100) / 100 : undefined,
      nightlyPrice:
        typeof nightly === 'number' && Number.isFinite(nightly) && nightly > 0
          ? Math.round(nightly * 100) / 100
          : undefined,
      currency,
      rating:
        typeof hit.rating?.score === 'number' && Number.isFinite(hit.rating.score)
          ? hit.rating.score
          : undefined,
      reviewCount:
        typeof hit.rating?.count === 'number' && hit.rating.count > 0 ? hit.rating.count : undefined,
      images: photo ? [photo] : undefined,
      bedrooms: typeof bedrooms === 'number' && bedrooms >= 0 ? bedrooms : undefined,
      beds: typeof beds === 'number' && beds > 0 ? beds : undefined,
      propertyType: hit.accommodation_type ?? undefined,
      searchPageIndex: pageIndex,
      searchRank: rank
    },
    params
  )
  return {
    ...acc,
    ratingScale: acc.rating != null ? 10 : undefined
  }
}

export function mapOmkarBookingPage(
  json: OmkarSearchJson,
  params: SearchParams,
  pageIndex = 1
): Accommodation[] {
  const rows = Array.isArray(json.results) ? json.results : []
  const out: Accommodation[] = []
  const seen = new Set<string>()
  rows.forEach((hit, i) => {
    const mapped = mapOmkarBookingHit(hit, params, pageIndex, i)
    if (!mapped || seen.has(mapped.sourceId)) return
    seen.add(mapped.sourceId)
    out.push(mapped)
  })
  return out
}

export async function scrapeBookingViaOmkar(
  params: SearchParams,
  apiKey: string,
  maxPages = SEARCH_WALK.maxPages
): Promise<OmkarBookingOutcome> {
  const t0 = Date.now()
  const cap = Math.max(1, maxPages)
  let dest: { destId?: string; destType?: string; query: string }
  try {
    dest = await resolveDestination(params.destination, apiKey)
  } catch (err) {
    return {
      ok: false,
      blocked: false,
      error: `Omkar Booking autocomplete : ${err instanceof Error ? err.message : String(err)}`
    }
  }

  const common: Record<string, string | number | undefined> = {
    query: dest.query,
    dest_id: dest.destId,
    dest_type: dest.destType,
    checkin: params.checkIn,
    checkout: params.checkOut,
    adults: params.adults,
    rooms: 1,
    locale: LOCALE,
    currency: CURRENCY,
    sort_by: 'homes_first',
    price_min: params.minPrice,
    price_max: params.maxPrice
  }

  const searchUrl = `${BASE}/booking/hotels/search?query=${encodeURIComponent(dest.query)}`

  const fetchPage = async (page: number): Promise<{ status: number; json: OmkarSearchJson; ms: number }> => {
    const { status, json, ms } = await omkarGet('/booking/hotels/search', { ...common, page }, apiKey)
    return { status, json: json as OmkarSearchJson, ms }
  }

  let first: { status: number; json: OmkarSearchJson; ms: number }
  try {
    first = await fetchPage(1)
  } catch (err) {
    return {
      ok: false,
      blocked: false,
      url: searchUrl,
      error: `Omkar Booking search : ${err instanceof Error ? err.message : String(err)}`
    }
  }

  if (first.status === 401 || first.status === 403 || first.status === 402 || first.status === 429) {
    return { ok: false, blocked: true, url: searchUrl, error: failMessage(first.status, first.json) }
  }
  if (first.status !== 200) {
    return {
      ok: false,
      blocked: first.status >= 500,
      url: searchUrl,
      error: failMessage(first.status, first.json)
    }
  }

  const advertised =
    typeof first.json.pagination?.total_results === 'number' && first.json.pagination.total_results >= 0
      ? first.json.pagination.total_results
      : typeof first.json.count === 'number' && first.json.count >= 0
        ? first.json.count
        : null
  const totalPages = Math.max(
    1,
    Number(first.json.pagination?.total_pages) ||
      Number(first.json.total_pages) ||
      (advertised != null && advertised > 0
        ? Math.ceil(advertised / (Number(first.json.per_page) || Number(first.json.pagination?.items_per_page) || 25))
        : 1)
  )
  const target = Math.min(cap, totalPages)

  const byId = new Map<string, Accommodation>()
  for (const row of mapOmkarBookingPage(first.json, params, 1)) byId.set(row.sourceId, row)

  let pagesFetched = 1
  if (target > 1) {
    const rest = Array.from({ length: target - 1 }, (_, i) => i + 2)
    let blocked: OmkarBookingFail | null = null
    const pages = await pool(
      PAGE_CONCURRENCY,
      rest.map((page) => async () => {
        if (blocked) return { page, hits: [] as Accommodation[] }
        try {
          const res = await fetchPage(page)
          if (res.status === 401 || res.status === 403 || res.status === 402 || res.status === 429) {
            blocked = {
              ok: false,
              blocked: true,
              url: searchUrl,
              error: failMessage(res.status, res.json)
            }
            return { page, hits: [] }
          }
          if (res.status !== 200) return { page, hits: [] }
          return { page, hits: mapOmkarBookingPage(res.json, params, page) }
        } catch {
          return { page, hits: [] }
        }
      })
    )
    if (blocked) return blocked
    for (const p of pages) {
      pagesFetched++
      for (const row of p.hits) {
        if (!byId.has(row.sourceId)) byId.set(row.sourceId, row)
      }
    }
  }

  const listings = [...byId.values()]
  const stoppedReason: StoppedReason =
    listings.length === 0 ? 'empty_page' : target < totalPages ? 'max_pages' : 'exhausted'

  if (listings.length === 0) {
    return {
      ok: false,
      blocked: false,
      url: searchUrl,
      error: 'Omkar Booking : aucune annonce (dates / lieu / type).'
    }
  }

  const list = stampPagination(listings, {
    pagesFetched,
    listingsFound: listings.length,
    listingsDeduped: listings.length,
    advertised: advertised ?? undefined,
    stoppedReason
  })

  return {
    ok: true,
    url: searchUrl,
    list,
    meta: {
      pagesFetched,
      advertised,
      stoppedReason,
      destId: dest.destId,
      destType: dest.destType,
      query: dest.query,
      ms: Date.now() - t0
    }
  }
}
