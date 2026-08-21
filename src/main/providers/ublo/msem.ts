/**
 * Client MSEM — liste des meublés + offres datées.
 *
 * Vérifié 2026-08-20 :
 *   GET  services.msem.tech/api/lodging/resort/125/OT-125 → 949 logements
 *   POST …/resort/125/offers {start,end,adults,channel} → 378 tarifs séjour
 */

import { ubloListingPath } from '@shared/ubloUrl'
import type { UbloSite } from './hosts'

const MSEM_API = 'https://services.msem.tech/api/lodging'

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export interface MsemAccommodation {
  id: number
  slug: string
  name: string
  merchant?: string
  kind?: string | null
  nbRooms?: number | null
  maxCapacity?: number | null
  lat?: number | null
  lng?: number | null
  stars?: number | null
  image?: string | null
  location?: {
    city?: string | null
    cp?: string | null
    lat?: number | null
    lng?: number | null
    address1?: string | null
  } | null
}

export interface MsemListPayload {
  accomodations?: MsemAccommodation[]
}

export interface MsemOffer {
  price?: number | null
  publicPrice?: number | null
}

export type MsemOffersMap = Record<string, MsemOffer>

export interface UbloListing {
  id: string
  title: string
  url: string
  total: number
  currency: 'EUR'
  lat: number | null
  lon: number | null
  city: string | null
  image: string | null
  rooms: number | null
  capacity: number | null
  merchant: string | null
  slug: string
  priceCheckIn: string
  priceCheckOut: string
  priceConfidence: 'total_confirmed'
}

export interface UbloExtractResult {
  ok: boolean
  error?: string
  count: number
  listings: UbloListing[]
}

function roundEuro(n: number): number {
  return Math.round(n * 100) / 100
}

export function lodgingUrl(site: UbloSite, slug: string, from: string, to: string, adults: number, children: number): string {
  const path = ubloListingPath(site.pathPrefix, slug)
  const url = new URL(path, site.origin)
  url.searchParams.set('from', from)
  url.searchParams.set('to', to)
  url.searchParams.set('adults', String(adults))
  if (children > 0) url.searchParams.set('children', String(children))
  return url.href
}

/**
 * Fusionne le catalogue (noms, GPS, photos) et les offres datées.
 * Un logement sans tarif > 0 pour *ces* dates n’est pas importé.
 */
export function mergeListAndOffers(
  list: MsemListPayload,
  offers: MsemOffersMap,
  site: UbloSite,
  from: string,
  to: string,
  adults: number,
  children: number
): UbloListing[] {
  const acc = list.accomodations ?? []
  const out: UbloListing[] = []
  for (const item of acc) {
    if (item.id == null || !item.slug || !item.name) continue
    const offer = offers[String(item.id)]
    const raw = offer?.price
    if (raw == null || !Number.isFinite(raw) || raw <= 0) continue
    const loc = item.location
    out.push({
      id: String(item.id),
      title: item.name,
      url: lodgingUrl(site, item.slug, from, to, adults, children),
      total: roundEuro(raw),
      currency: 'EUR',
      lat: item.lat ?? loc?.lat ?? null,
      lon: item.lng ?? loc?.lng ?? null,
      city: loc?.city ?? null,
      image: item.image ?? null,
      rooms: item.nbRooms ?? null,
      capacity: item.maxCapacity ?? null,
      merchant: item.merchant ?? null,
      slug: item.slug,
      priceCheckIn: from,
      priceCheckOut: to,
      priceConfidence: 'total_confirmed'
    })
  }
  out.sort((a, b) => a.total - b.total)
  return out
}

async function fetchJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const timeoutMs = init.timeoutMs ?? 25_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const { timeoutMs: _t, ...rest } = init
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': UA,
        'Accept-Language': 'fr-FR,fr;q=0.9',
        ...(rest.headers as Record<string, string> | undefined)
      }
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} for ${url}` }
    }
    return { ok: true, data: (await res.json()) as T }
  } catch (err) {
    const msg =
      err instanceof Error && err.name === 'AbortError'
        ? `timeout ${timeoutMs}ms`
        : String(err instanceof Error ? err.message : err)
    return { ok: false, error: `${msg} (${url})` }
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchMsemList(site: UbloSite): Promise<
  { ok: true; data: MsemListPayload } | { ok: false; error: string }
> {
  const url = `${MSEM_API}/resort/${site.resort}/${site.channel}?language=${site.lang}&facet=0`
  return fetchJson<MsemListPayload>(url, {
    headers: { Origin: site.origin, Referer: `${site.origin}/` },
    timeoutMs: 30_000
  })
}

export async function fetchMsemOffers(
  site: UbloSite,
  from: string,
  to: string,
  adults: number,
  children: number
): Promise<{ ok: true; data: MsemOffersMap } | { ok: false; error: string }> {
  const url = `${MSEM_API}/resort/${site.resort}/offers`
  return fetchJson<MsemOffersMap>(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Origin: site.origin,
      Referer: `${site.origin}/`
    },
    body: JSON.stringify({
      channel: site.channel,
      preview: false,
      adults,
      children,
      agesChildren: [],
      start: from,
      end: to
    }),
    timeoutMs: 25_000
  })
}

export async function extractUblo(opts: {
  site: UbloSite
  from: string
  to: string
  adults: number
  children: number
}): Promise<UbloExtractResult> {
  const [list, offers] = await Promise.all([
    fetchMsemList(opts.site),
    fetchMsemOffers(opts.site, opts.from, opts.to, opts.adults, opts.children)
  ])
  if (!list.ok) return { ok: false, error: list.error, count: 0, listings: [] }
  if (!offers.ok) return { ok: false, error: offers.error, count: 0, listings: [] }
  const listings = mergeListAndOffers(
    list.data,
    offers.data,
    opts.site,
    opts.from,
    opts.to,
    opts.adults,
    opts.children
  )
  return { ok: true, count: listings.length, listings }
}
