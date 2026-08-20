/**
 * Extracteur Orchestra — booking.chamonix.com (HTML SERP + ajax/more).
 *
 * Pas de Playwright : SSR + fragments HTML. Filtre village via ref_c.LOCATION.
 */

export type SerpType = 'hotel' | 'apartment' | 'residence'

export interface ChamonixSearchOpts {
  type: SerpType
  from: string
  to: string
  adults: number
  children: number
  /** Code Orchestra cmb.* ou nom de station (résolu via LOCATION_MAP). */
  location: string | null
  maxPages?: number
  byPage?: number
  /** N'importer que les fiches avec prix > 0 (défaut true). */
  pricedOnly?: boolean
}

export interface ChamonixListing {
  id: string | null
  title: string | null
  city: string | null
  total: number | null
  currency: string
  pricePrefix: string | null
  priceUnit: string | null
  url: string | null
  image: string | null
  address: string | null
  lat: number | null
  lon: number | null
  stars: number | string | null
  tripadvisorLocationId: string | null
  priceCheckIn: string
  priceCheckOut: string
  priceConfidence: 'total_confirmed' | 'partial' | null
}

export interface ChamonixExtractResult {
  ok: boolean
  error?: string
  count: number
  nbResultReported: number | null
  paginationComplete: boolean
  warnings: string[]
  byCity: Record<string, number>
  listings: ChamonixListing[]
  requestUrl?: string
}

const BASE = 'https://booking.chamonix.com'

const SERP: Record<
  SerpType,
  { path: string; morePath: string; baseQuery: string }
> = {
  hotel: {
    path: '/fr/serpHotel',
    morePath: '/fr/ajax/more/serpHotel',
    baseQuery: 's_c.ACCOMMODATION=hotel'
  },
  apartment: {
    path: '/fr/serp',
    morePath: '/fr/ajax/more/serp',
    baseQuery: 's_c.ACCOMMODATION=chalet,apartment'
  },
  residence: {
    path: '/fr/serpResidence',
    morePath: '/fr/ajax/more/serpResidence',
    baseQuery: 's_c.ACCOMMODATION=residence'
  }
}

/** Destination app → ref_c.LOCATION */
export const LOCATION_MAP: Record<string, string> = {
  chamonix: 'cmb.chamonix',
  'chamonix-mont-blanc': 'cmb.chamonix',
  'les-houches': 'cmb.houches',
  houches: 'cmb.houches',
  vallorcine: 'cmb.vallorcine',
  argentiere: 'cmb.argentiere',
  argentière: 'cmb.argentiere',
  servoz: 'cmb.servoz'
}

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export function resolveLocationCode(destination: string | null | undefined): string | null {
  if (!destination) return null
  const raw = destination.trim()
  if (raw.startsWith('cmb.')) return raw
  const key = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (LOCATION_MAP[key]) return LOCATION_MAP[key]
  // fuzzy: "Les Houches" → les-houches
  const compact = key.replace(/-/g, '')
  for (const [k, v] of Object.entries(LOCATION_MAP)) {
    if (k.replace(/-/g, '') === compact) return v
  }
  // token "chamonix" / "houches" / "vallorcine"
  for (const [k, v] of Object.entries(LOCATION_MAP)) {
    if (key.includes(k) || k.includes(key)) return v
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchText(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<{ ok: true; text: string } | { ok: false; status: number | null; error: string }> {
  const timeoutMs = init.timeoutMs ?? 25_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const { timeoutMs: _t, ...rest } = init
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        ...(rest.headers as Record<string, string> | undefined)
      },
      redirect: 'follow'
    })
    const text = await res.text()
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `HTTP ${res.status} for ${url}`
      }
    }
    return { ok: true, text }
  } catch (err) {
    const msg =
      err instanceof Error && err.name === 'AbortError'
        ? `timeout ${timeoutMs}ms`
        : String(err instanceof Error ? err.message : err)
    return { ok: false, status: null, error: `${msg} (${url})` }
  } finally {
    clearTimeout(timer)
  }
}

function buildQuery(opts: ChamonixSearchOpts): string {
  const parts = [SERP[opts.type].baseQuery]
  if (opts.from) parts.push(`s_checkinDate=${opts.from}`)
  if (opts.to) parts.push(`s_checkoutDate=${opts.to}`)
  if (opts.type !== 'hotel') {
    parts.push(`s_c.PAX.adultsNumber=${opts.adults}`)
    parts.push(`s_c.PAX.childrenNumber=${opts.children}`)
  }
  if (opts.location) parts.push(`ref_c.LOCATION=${opts.location}`)
  return parts.join('&')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function splitArticles(html: string): string[] {
  const articles: string[] = []
  const re = /<article\b[^>]*class="[^"]*cpt-result[^"]*"[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const start = m.index
    const end = html.indexOf('</article>', start)
    if (end === -1) continue
    articles.push(html.slice(start, end + '</article>'.length))
  }
  return articles
}

function attr(openTag: string, name: string): string | null {
  const re = new RegExp(name + `=(["'])([\\s\\S]*?)\\1`, 'i')
  const m = openTag.match(re)
  return m ? m[2] : null
}

function parsePrice(text: string | null): number | null {
  if (!text) return null
  const cleaned = text.replace(/\s/g, '').replace(/€|EUR/gi, '').replace(/,/g, '.')
  const m = cleaned.match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function parseArticle(block: string, from: string, to: string): ChamonixListing {
  const openEnd = block.indexOf('>')
  const openTag = block.slice(0, openEnd + 1)
  const body = block.slice(openEnd + 1)

  const dataLink = attr(openTag, 'data-link')
  let geo: {
    geometry?: { coordinates?: number[] }
    properties?: { code?: number | string; location?: string }
  } | null = null
  const geoRaw = attr(openTag, 'data-geolocation')
  if (geoRaw) {
    try {
      geo = JSON.parse(geoRaw)
    } catch {
      geo = null
    }
  }

  let productMeta: {
    id?: string | number
    title?: string
    stationLocation?: string
    url?: string
    img?: string
    stars?: string | number
    accommodation?: string
  } | null = null
  const fav = body.match(/data-product=(['"])(\{[\s\S]*?\})\1/)
  if (fav) {
    try {
      productMeta = JSON.parse(fav[2].replace(/\n/g, ''))
    } catch {
      productMeta = null
    }
  }

  const titleM =
    body.match(/class="result-title[^"]*"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
    body.match(/class="result-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i)
  const subM = body.match(/class="result-subtitle"[^>]*>([\s\S]*?)<\/h4>/i)
  const priceM = body.match(/class="price"[^>]*>([\s\S]*?)<\/span>/i)
  const fromM = body.match(/class="from"[^>]*>([\s\S]*?)<\/span>/i)
  const typeM = body.match(/class="type"[^>]*>([\s\S]*?)<\/span>/i)

  const taM =
    body.match(/data-id="(\d+)"\s+data-reviews-api="([^"]*reviews[^"]*)"/i) ||
    body.match(/data-reviews-api="([^"]*reviews[^"]*)"[^>]*data-id="(\d+)"/i) ||
    body.match(/class="[^"]*tripadvisor[^"]*"[^>]*data-id="(\d+)"/i)
  let tripadvisorLocationId: string | null = null
  if (taM) {
    if (taM[2] && /^\d+$/.test(taM[1])) tripadvisorLocationId = taM[1]
    else if (taM[2] && /^\d+$/.test(taM[2])) tripadvisorLocationId = taM[2]
    else tripadvisorLocationId = taM[1]
  }

  const title = titleM ? stripTags(titleM[1]) : productMeta?.title || null
  const city =
    (subM ? stripTags(subM[1]) : null) || productMeta?.stationLocation || null
  const priceText = priceM ? stripTags(priceM[1]) : null
  const total = parsePrice(priceText)
  const pricePrefix = fromM ? stripTags(fromM[1]) : null

  const rel = dataLink || productMeta?.url || null
  let listingUrl: string | null = null
  if (rel) {
    try {
      listingUrl = new URL(rel, BASE).href
    } catch {
      listingUrl = null
    }
  }
  if (listingUrl && from && to && !listingUrl.includes('s_checkinDate')) {
    const baseUrl = listingUrl.split('#')[0]
    listingUrl = `${baseUrl}#s_checkinDate=${from}&s_checkoutDate=${to}&s_channel=CMB`
  }

  let lat: number | null = null
  let lon: number | null = null
  if (geo?.geometry?.coordinates && geo.geometry.coordinates.length >= 2) {
    lon = geo.geometry.coordinates[0]
    lat = geo.geometry.coordinates[1]
  }

  const id =
    productMeta?.id != null
      ? String(productMeta.id)
      : geo?.properties?.code != null
        ? String(geo.properties.code)
        : listingUrl?.match(/\/(?:hotel|product|residence)-(\d+)/)?.[1] || null

  return {
    id,
    title,
    city,
    total,
    currency: 'EUR',
    pricePrefix,
    priceUnit: typeM ? stripTags(typeM[1]) : null,
    url: listingUrl,
    image: productMeta?.img || null,
    address: geo?.properties?.location || null,
    lat,
    lon,
    stars: productMeta?.stars ?? null,
    tripadvisorLocationId,
    priceCheckIn: from,
    priceCheckOut: to,
    // « / séjour » = total du séjour ; « à partir de » → partial mais montant affiché
    priceConfidence:
      total != null
        ? pricePrefix && /partir/i.test(pricePrefix)
          ? 'partial'
          : 'total_confirmed'
        : null
  }
}

function parseNbResult(html: string): number | null {
  const m = html.match(/class="nb_result[^"]*"[^>]*>([\s\S]*?)<\//i)
  if (!m) return null
  const n = stripTags(m[1]).match(/(\d+)/)
  return n ? Number(n[1]) : null
}

function hasMoreButton(html: string): boolean {
  return /see-more-results/i.test(html) || /data-ajax-url="\/fr\/ajax\/more\//i.test(html)
}

/**
 * Recherche SERP Chamonix (un type d’hébergement).
 */
export async function extractChamonix(
  opts: ChamonixSearchOpts
): Promise<ChamonixExtractResult> {
  const cfg = SERP[opts.type]
  const maxPages = opts.maxPages ?? 2
  const byPage = opts.byPage ?? 20
  const pricedOnly = opts.pricedOnly !== false
  const location = opts.location ? resolveLocationCode(opts.location) || opts.location : null

  const query = buildQuery({ ...opts, location })
  const firstUrl = `${BASE}${cfg.path}?${query}`
  const warnings: string[] = []
  const listings: ChamonixListing[] = []
  const seen = new Set<string>()

  const page1 = await fetchText(firstUrl)
  if (!page1.ok) {
    return {
      ok: false,
      error: page1.error,
      count: 0,
      nbResultReported: null,
      paginationComplete: false,
      warnings: [page1.error],
      byCity: {},
      listings: [],
      requestUrl: firstUrl
    }
  }

  const nbResult = parseNbResult(page1.text)
  for (const block of splitArticles(page1.text)) {
    const item = parseArticle(block, opts.from, opts.to)
    const key = item.id || item.url
    if (!key || seen.has(key)) continue
    if (pricedOnly && (item.total == null || item.total <= 0)) continue
    if (!item.title || !item.url) continue
    seen.add(key)
    listings.push(item)
  }

  let page = 2
  let canMore = hasMoreButton(page1.text)
  let paginationComplete = !canMore || maxPages < 2
  let consecutiveErrors = 0

  while (canMore && page <= maxPages) {
    const moreUrl = `${BASE}${cfg.morePath}?${query}&page=${page}&byPage=${byPage}`
    const result = await fetchText(moreUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: firstUrl
      },
      body: cfg.path,
      timeoutMs: 20_000
    })

    if (!result.ok) {
      consecutiveErrors++
      warnings.push(`pagination page ${page}: ${result.error}`)
      if (result.status && result.status >= 400 && result.status < 500 && result.status !== 429) {
        paginationComplete = false
        break
      }
      if (consecutiveErrors >= 2) {
        warnings.push(`pagination arrêtée après ${consecutiveErrors} échecs`)
        paginationComplete = false
        break
      }
      await sleep(600)
      page++
      continue
    }

    consecutiveErrors = 0
    const fragment = result.text
    if (!fragment || fragment.length < 40) {
      paginationComplete = true
      break
    }
    if (/<!doctype html>/i.test(fragment) && !/cpt-result/i.test(fragment)) {
      warnings.push(`pagination page ${page}: HTML inattendu`)
      paginationComplete = false
      break
    }

    const arts = splitArticles(fragment)
    for (const block of arts) {
      const item = parseArticle(block, opts.from, opts.to)
      const key = item.id || item.url
      if (!key || seen.has(key)) continue
      if (pricedOnly && (item.total == null || item.total <= 0)) continue
      if (!item.title || !item.url) continue
      seen.add(key)
      listings.push(item)
    }

    if (arts.length === 0) {
      paginationComplete = true
      break
    }
    if (arts.length < byPage && !hasMoreButton(fragment)) {
      paginationComplete = true
      canMore = false
    } else {
      canMore = hasMoreButton(fragment) || arts.length >= byPage
    }
    page++
    await sleep(350)
  }

  if (page > maxPages && canMore) {
    warnings.push(`max-pages=${maxPages} atteint`)
    paginationComplete = false
  }

  const byCity: Record<string, number> = {}
  for (const l of listings) {
    const c = l.city || '(unknown)'
    byCity[c] = (byCity[c] || 0) + 1
  }

  return {
    ok: true,
    count: listings.length,
    nbResultReported: nbResult,
    paginationComplete,
    warnings,
    byCity,
    listings,
    requestUrl: firstUrl
  }
}

/**
 * Multi-type : hotel + apartment (+ residence), dédupliqués par id.
 */
export async function extractChamonixMulti(
  opts: Omit<ChamonixSearchOpts, 'type'> & { types?: SerpType[] }
): Promise<ChamonixExtractResult> {
  const types = opts.types ?? (['hotel', 'apartment'] as SerpType[])
  const seen = new Set<string>()
  const listings: ChamonixListing[] = []
  const warnings: string[] = []
  let paginationComplete = true
  let nbResultReported = 0

  for (const type of types) {
    const r = await extractChamonix({ ...opts, type })
    if (!r.ok) {
      warnings.push(`${type}: ${r.error}`)
      continue
    }
    warnings.push(...r.warnings.map((w) => `${type}: ${w}`))
    if (!r.paginationComplete) paginationComplete = false
    if (r.nbResultReported) nbResultReported += r.nbResultReported
    for (const item of r.listings) {
      const key = item.id || item.url
      if (!key || seen.has(key)) continue
      seen.add(key)
      listings.push(item)
    }
  }

  const byCity: Record<string, number> = {}
  for (const l of listings) {
    const c = l.city || '(unknown)'
    byCity[c] = (byCity[c] || 0) + 1
  }

  return {
    ok: true,
    count: listings.length,
    nbResultReported: nbResultReported || null,
    paginationComplete,
    warnings,
    byCity,
    listings
  }
}
