/**
 * Deskline searchresults — dump 2026-09-01 23:05.
 *
 * POST /searches + POST /filters bedrooms[] + GET searchresults.
 * `fromPrice.value` = tarif séjour des dates, pas la nuit (8 p. / 7 n. Clusaz).
 * Chambres : la source filtre, elle ne publie pas le décompte sur la carte.
 */

import type { DesklineSite } from './hosts'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const API = 'https://webapi.deskline.net'
const PAGE_SIZE = 24
const MAX_PAGES = 8
const FIELDS =
  'id,name,urlFriendlyName,fromPrice{value,meal,isBestPrice},categories{id,name},location{coordinate{lat,long,name}}'

export interface DesklineListing {
  id: string
  title: string
  url: string
  total: number
  lat: number | null
  lon: number | null
  bedroomsFloor: number | null
}

export interface DesklineExtractResult {
  ok: boolean
  error?: string
  count: number
  listings: DesklineListing[]
}

function sessionId(): string {
  return `Q${Date.now()}`
}

function bedroomFloorList(min: number): number[] {
  const out: number[] = []
  for (let n = min; n <= 16; n++) out.push(n)
  return out
}

async function call(
  method: string,
  url: string,
  session: string,
  origin: string,
  body?: unknown
): Promise<{ status: number; text: string }> {
  const res = await fetch(url, {
    method,
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'DW-Source': 'desklineweb',
      'DW-SessionId': session,
      Origin: origin,
      Referer: `${origin}/`
    },
    body: body == null ? undefined : JSON.stringify(body)
  })
  return { status: res.status, text: await res.text() }
}

export async function extractDeskline(opts: {
  site: DesklineSite
  from: string
  to: string
  adults: number
  bedrooms: number
}): Promise<DesklineExtractResult> {
  const session = sessionId()
  const origin = opts.site.origin
  try {
    const search = await call('POST', `${API}/searches`, session, origin, {
      searchObject: {
        searchGeneral: {
          dateFrom: `${opts.from}T00:00:00.000`,
          dateTo: `${opts.to}T00:00:00.000`
        },
        searchAccommodation: {
          searchLines: [{ units: 1, adults: opts.adults, children: 0, childrenAges: [] }],
          searchSPRCriteria: [],
          searchSRCriteria: []
        }
      }
    })
    if (search.status !== 201) {
      return { ok: false, error: `searches HTTP ${search.status}`, count: 0, listings: [] }
    }
    const searchId = (JSON.parse(search.text) as { id?: string }).id
    if (!searchId) return { ok: false, error: 'searches sans id', count: 0, listings: [] }

    let filterId = ''
    const floor = opts.bedrooms > 0 ? opts.bedrooms : 0
    if (floor > 0) {
      const filter = await call('POST', `${API}/filters`, session, origin, {
        filterObject: {
          id: '00000000-0000-0000-0000-000000000000',
          filterGeneral: {},
          filterAddServices: { name: '' },
          filterAccommodation: {
            name: '',
            bestPrice: false,
            specialPrice: false,
            specialOffer: false,
            bedrooms: bedroomFloorList(floor)
          },
          filterEvent: {},
          filterInfrastructure: {},
          filterBrochure: {},
          filterPackage: {},
          filterTour: {}
        }
      })
      if (filter.status !== 201) {
        return { ok: false, error: `filters HTTP ${filter.status}`, count: 0, listings: [] }
      }
      filterId = (JSON.parse(filter.text) as { id?: string }).id ?? ''
    }

    const listings: DesklineListing[] = []
    const seen = new Set<string>()
    for (let page = 1; page <= MAX_PAGES; page++) {
      const u =
        `${API}/${opts.site.client}/fr/accommodations/searchresults/${searchId}` +
        `?filterId=${encodeURIComponent(filterId)}&fields=${FIELDS}` +
        `&currency=EUR&pageNo=${page}&pageSize=${PAGE_SIZE}`
      const list = await call('GET', u, session, origin)
      if (list.status !== 200) {
        return { ok: false, error: `searchresults HTTP ${list.status}`, count: 0, listings: [] }
      }
      const payload = JSON.parse(list.text) as {
        paging?: { pageCount?: number }
        data?: Array<{
          id?: string
          name?: string
          urlFriendlyName?: string
          fromPrice?: { value?: number }
          location?: { coordinate?: { lat?: number; long?: number } | null }
        }>
      }
      for (const row of payload.data ?? []) {
        if (!row.id || !row.name || seen.has(row.id)) continue
        const total = row.fromPrice?.value
        if (!(typeof total === 'number') || !(total > 0)) continue
        seen.add(row.id)
        const slug = row.urlFriendlyName ? `/${row.urlFriendlyName}` : ''
        listings.push({
          id: row.id,
          title: row.name,
          url: `${opts.site.origin}${opts.site.listPath}${slug}`,
          total,
          lat: row.location?.coordinate?.lat ?? null,
          lon: row.location?.coordinate?.long ?? null,
          bedroomsFloor: floor > 0 ? floor : null
        })
      }
      const pages = payload.paging?.pageCount ?? 1
      if (page >= pages) break
    }
    return { ok: true, count: listings.length, listings }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      count: 0,
      listings: []
    }
  }
}
