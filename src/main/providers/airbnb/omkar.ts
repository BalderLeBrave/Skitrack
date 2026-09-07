/**
 * Airbnb via Omkar.cloud (HTTP JSON) — plus rapide que Playwright.
 *
 * Preuve 2026-09-04, Les 2 Alpes 6–13 fév. 2027, 8 pers., domain=airbnb.fr :
 *   autocomplete 0,30 s · search p.1 0,66 s · 18 cartes · count=270 · 15 pages
 *   price.amount = total séjour EUR (ex. 2695 « au total »)
 *   details 1,00 s / id (donc interdit en boucle : 270 fiches ≈ 270 s + quota)
 *
 * Plafond : SEARCH_WALK.airbnbMaxPages pages (toutes, jusqu'au garde-fou).
 * Fiches `/rooms/details` : seulement hors de ce module, jamais pendant le walk.
 */

import { SEARCH_WALK, isPrivateOrSharedListing } from '@shared/searchWalk'
import { occupancyFromPublishedText, type AirbnbClipListing, type AirbnbClipPayload } from './extract'

const BASE = 'https://airbnb-scraper-api.omkar.cloud'
const DOMAIN = 'airbnb.fr'
const PAGE_CONCURRENCY = 3
const REQUEST_TIMEOUT_MS = 20_000

export function resolveOmkarAirbnbKey(
  vault: Record<string, string | undefined> = {},
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const raw = vault.omkar_airbnb ?? env.OMKAR_AIRBNB_KEY ?? env.OMKAR_API_KEY
  const key = typeof raw === 'string' ? raw.trim() : ''
  return key || undefined
}

export interface OmkarSearchParams {
  city: string
  checkIn?: string
  checkOut?: string
  adults?: number
  children?: number
  infants?: number
  pets?: number
  minPrice?: number
  maxPrice?: number
  maxPages?: number
}

export interface OmkarWalkMeta {
  pagesFetched: number
  advertised: number | null
  stoppedReason: 'exhausted' | 'max_pages' | 'empty'
  placeId?: string
  query?: string
  ms: number
}

export type OmkarSearchOk = {
  ok: true
  payload: AirbnbClipPayload
  url: string
  meta: OmkarWalkMeta
}

export type OmkarSearchFail = {
  ok: false
  error: string
  url?: string
  /** auth / quota / 429 : ne pas retomber sur Playwright « liste vide ». */
  blocked: boolean
}

export type OmkarSearchOutcome = OmkarSearchOk | OmkarSearchFail

type OmkarHit = {
  id?: string | number
  name?: string
  title?: string
  link?: string
  summary?: unknown
  bedrooms?: number | null
  beds?: number | null
  price?: { amount?: number; currency?: string; qualifier?: string } | null
  coordinates?: { latitude?: number; longitude?: number } | null
  images?: unknown
}

type OmkarSearchJson = {
  count?: number
  per_page?: number
  current_page?: number
  total_pages?: number
  next?: string | null
  results?: OmkarHit[]
  error?: string
  detail?: string
  message?: string
}

type OmkarAutoJson = {
  results?: { full_name?: string; name?: string; google_place_id?: string }[]
  error?: string
}

function summaryText(summary: unknown): string {
  if (typeof summary === 'string') return summary
  if (Array.isArray(summary)) return summary.filter((x) => typeof x === 'string').join(' · ')
  return ''
}

function firstImage(images: unknown): string | undefined {
  if (!Array.isArray(images) || images.length === 0) return undefined
  const x = images[0]
  if (typeof x === 'string' && /^https?:\/\//.test(x)) return x
  if (x && typeof x === 'object') {
    const link = (x as { link?: unknown }).link
    if (typeof link === 'string' && /^https?:\/\//.test(link)) return link
  }
  return undefined
}

function roomUrl(id: string, checkIn?: string, checkOut?: string, adults?: number): string {
  const q = new URLSearchParams()
  if (checkIn) q.set('check_in', checkIn)
  if (checkOut) q.set('check_out', checkOut)
  if (adults && adults > 0) q.set('adults', String(adults))
  const suffix = q.toString()
  return `https://www.airbnb.fr/rooms/${encodeURIComponent(id)}${suffix ? `?${suffix}` : ''}`
}

export function mapOmkarSearchHit(
  hit: OmkarHit,
  meta: { checkIn?: string; checkOut?: string; adults?: number }
): AirbnbClipListing | null {
  const id = hit.id != null ? String(hit.id).trim() : ''
  const name = (hit.name ?? '').trim()
  const title = (hit.title ?? '').trim()
  if (!id || !name) return null
  if (isPrivateOrSharedListing(title) || isPrivateOrSharedListing(name)) return null

  const occ = occupancyFromPublishedText(name, title, summaryText(hit.summary))
  const bedrooms =
    typeof hit.bedrooms === 'number' && hit.bedrooms > 0 ? hit.bedrooms : occ.bedrooms
  const guests = occ.guests
  const amount = hit.price?.amount
  const priceLabel =
    typeof amount === 'number' && Number.isFinite(amount) && amount > 0
      ? `${amount} € au total`
      : undefined
  if (!priceLabel && meta.checkIn && meta.checkOut) return null

  const lat = hit.coordinates?.latitude
  const lon = hit.coordinates?.longitude
  const link = typeof hit.link === 'string' ? hit.link : undefined
  const url = roomUrl(id, meta.checkIn, meta.checkOut, meta.adults)

  return {
    id,
    name,
    subtitle: title || undefined,
    priceLabel,
    lat: typeof lat === 'number' && Number.isFinite(lat) ? lat : undefined,
    lon: typeof lon === 'number' && Number.isFinite(lon) ? lon : undefined,
    image: firstImage(hit.images),
    url: link?.includes('/rooms/') ? url : url,
    guests,
    bedrooms
  }
}

export function mapOmkarSearchPage(
  json: OmkarSearchJson,
  meta: { destination?: string; checkIn?: string; checkOut?: string; adults?: number }
): AirbnbClipListing[] {
  const rows = Array.isArray(json.results) ? json.results : []
  const out: AirbnbClipListing[] = []
  const seen = new Set<string>()
  for (const hit of rows) {
    const mapped = mapOmkarSearchHit(hit, meta)
    if (!mapped || seen.has(mapped.id)) continue
    seen.add(mapped.id)
    out.push(mapped)
  }
  return out
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
    return 'Clé Omkar Airbnb refusée. Réglages → Clés d’API → Omkar Airbnb.'
  }
  if (status === 429) return 'Quota Omkar Airbnb dépassé (429). Réessayez plus tard.'
  if (status === 402) return 'Quota Omkar Airbnb épuisé (plan).'
  return msg ? `Omkar Airbnb HTTP ${status} : ${msg}` : `Omkar Airbnb HTTP ${status}`
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

const placeCache = new Map<string, { query: string; placeId?: string }>()

async function resolvePlace(
  city: string,
  apiKey: string
): Promise<{ query: string; placeId?: string }> {
  const key = city.trim().toLowerCase()
  const cached = placeCache.get(key)
  if (cached) return cached
  const { status, json } = await omkarGet(
    '/airbnb/rooms/autocomplete',
    { query: city, domain: DOMAIN },
    apiKey
  )
  if (status !== 200) {
    const fallback = { query: city }
    return fallback
  }
  const body = json as OmkarAutoJson
  const first = Array.isArray(body.results) ? body.results[0] : undefined
  const resolved = {
    query: (first?.full_name || first?.name || city).trim(),
    placeId: first?.google_place_id
  }
  placeCache.set(key, resolved)
  return resolved
}

export async function scrapeAirbnbViaOmkar(
  params: OmkarSearchParams,
  apiKey: string
): Promise<OmkarSearchOutcome> {
  const t0 = Date.now()
  const maxPages = Math.max(1, params.maxPages ?? SEARCH_WALK.airbnbMaxPages)
  let place: { query: string; placeId?: string }
  try {
    place = await resolvePlace(params.city, apiKey)
  } catch (err) {
    return {
      ok: false,
      blocked: false,
      error: `Omkar autocomplete : ${err instanceof Error ? err.message : String(err)}`
    }
  }

  const common: Record<string, string | number | undefined> = {
    query: place.query,
    place_id: place.placeId,
    checkin: params.checkIn,
    checkout: params.checkOut,
    adults: params.adults,
    children: params.children,
    infants: params.infants,
    pets: params.pets,
    price_min: params.minPrice,
    price_max: params.maxPrice,
    domain: DOMAIN
  }

  const searchUrl = `${BASE}/airbnb/rooms/search?query=${encodeURIComponent(place.query)}`

  const fetchPage = async (page: number): Promise<{ status: number; json: OmkarSearchJson; ms: number }> => {
    const { status, json, ms } = await omkarGet(
      '/airbnb/rooms/search',
      { ...common, page },
      apiKey
    )
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
      error: `Omkar search : ${err instanceof Error ? err.message : String(err)}`
    }
  }

  if (first.status === 401 || first.status === 403 || first.status === 402 || first.status === 429) {
    return { ok: false, blocked: true, url: searchUrl, error: failMessage(first.status, first.json) }
  }
  if (first.status !== 200) {
    return { ok: false, blocked: first.status >= 500, url: searchUrl, error: failMessage(first.status, first.json) }
  }

  const advertised =
    typeof first.json.count === 'number' && first.json.count >= 0 ? first.json.count : null
  const totalPages = Math.max(1, Number(first.json.total_pages) || 1)
  const target = Math.min(maxPages, totalPages)
  const clipMeta = {
    destination: place.query,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    adults: params.adults
  }

  const byId = new Map<string, AirbnbClipListing>()
  for (const row of mapOmkarSearchPage(first.json, clipMeta)) byId.set(row.id, row)

  let pagesFetched = 1
  if (target > 1) {
    const rest = Array.from({ length: target - 1 }, (_, i) => i + 2)
    let blocked: OmkarSearchFail | null = null
    const pages = await pool(PAGE_CONCURRENCY, rest.map((page) => async () => {
      if (blocked) return { page, hits: [] as AirbnbClipListing[] }
      try {
        const res = await fetchPage(page)
        if (res.status === 401 || res.status === 403 || res.status === 402 || res.status === 429) {
          blocked = { ok: false, blocked: true, url: searchUrl, error: failMessage(res.status, res.json) }
          return { page, hits: [] }
        }
        if (res.status !== 200) return { page, hits: [] }
        return { page, hits: mapOmkarSearchPage(res.json, clipMeta) }
      } catch {
        return { page, hits: [] }
      }
    }))
    if (blocked) return blocked
    for (const p of pages) {
      pagesFetched++
      for (const row of p.hits) {
        if (!byId.has(row.id)) byId.set(row.id, row)
      }
    }
  }

  const listings = [...byId.values()]
  const stoppedReason: OmkarWalkMeta['stoppedReason'] =
    listings.length === 0 ? 'empty' : target < totalPages ? 'max_pages' : 'exhausted'

  if (listings.length === 0) {
    return {
      ok: false,
      blocked: false,
      url: searchUrl,
      error: 'Omkar Airbnb : aucune annonce dans la recherche (dates / lieu).'
    }
  }

  return {
    ok: true,
    url: searchUrl,
    payload: {
      source: 'airbnb',
      destination: place.query,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      listings
    },
    meta: {
      pagesFetched,
      advertised,
      stoppedReason,
      placeId: place.placeId,
      query: place.query,
      ms: Date.now() - t0
    }
  }
}
