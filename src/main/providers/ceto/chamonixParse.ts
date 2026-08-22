/**
 * Extracteur Orchestra — booking.chamonix.com (HTML SERP + ajax/more).
 *
 * Pas de Playwright : SSR + fragments HTML. Filtre village via ref_c.LOCATION.
 */

export type SerpType = 'hotel' | 'apartment' | 'residence'

export type OrchestraSiteId = 'chamonix' | 'meribel' | 'plagne' | 'megeve' | 'praz'

export interface ChamonixSearchOpts {
  type: SerpType
  from: string
  to: string
  adults: number
  children: number
  /** Code Orchestra cmb.* / village Plagne, ou nom de station. */
  location: string | null
  maxPages?: number
  byPage?: number
  /** N'importer que les fiches avec prix > 0 (défaut true). */
  pricedOnly?: boolean
  site?: OrchestraSiteId
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

const SITES: Record<
  OrchestraSiteId,
  {
    base: string
    channel: string | null
    dateStyle: 'iso' | 'dmy'
    locationParam: 'ref_c.LOCATION' | 's_c.location' | null
    serp: Record<SerpType, { path: string; morePath: string; baseQuery: string }>
  }
> = {
  chamonix: {
    base: 'https://booking.chamonix.com',
    channel: 'CMB',
    dateStyle: 'iso',
    locationParam: 'ref_c.LOCATION',
    serp: {
      hotel: { path: '/fr/serpHotel', morePath: '/fr/ajax/more/serpHotel', baseQuery: 's_c.ACCOMMODATION=hotel' },
      apartment: { path: '/fr/serp', morePath: '/fr/ajax/more/serp', baseQuery: 's_c.ACCOMMODATION=chalet,apartment' },
      residence: { path: '/fr/serpResidence', morePath: '/fr/ajax/more/serpResidence', baseQuery: 's_c.ACCOMMODATION=residence' }
    }
  },
  meribel: {
    base: 'https://reservations.meribel.net',
    channel: null,
    dateStyle: 'iso',
    locationParam: null,
    serp: {
      hotel: { path: '/serpHotel', morePath: '/ajax/more/serpHotel', baseQuery: 'lang=fr_FR&s_c.ACCOMMODATION=hotel' },
      apartment: { path: '/serp', morePath: '/ajax/more/serp', baseQuery: 'lang=fr_FR&s_c.ACCOMMODATION=apartment,chalet' },
      residence: { path: '/serp', morePath: '/ajax/more/serp', baseQuery: 'lang=fr_FR&s_c.ACCOMMODATION=residence' }
    }
  },
  megeve: {
    base: 'https://megeve-booking.com',
    channel: null,
    dateStyle: 'iso',
    locationParam: null,
    serp: {
      hotel: { path: '/serpHotel', morePath: '/ajax/more/serpHotel', baseQuery: 'lang=fr_FR&s_c.ACCOMMODATION=hotel' },
      apartment: { path: '/serp', morePath: '/ajax/more/serp', baseQuery: 'lang=fr_FR&s_c.ACCOMMODATION=chalet,apartment' },
      residence: { path: '/serp', morePath: '/ajax/more/serp', baseQuery: 'lang=fr_FR&s_c.ACCOMMODATION=residence' }
    }
  },
  praz: {
    base: 'https://booking.prazsurarly.com',
    channel: null,
    dateStyle: 'iso',
    locationParam: null,
    serp: {
      hotel: { path: '/serpHotel', morePath: '/ajax/more/serpHotel', baseQuery: 'lang=fr_FR&s_c.ACCOMMODATION=hotel' },
      apartment: { path: '/serp', morePath: '/ajax/more/serp', baseQuery: 'lang=fr_FR&s_c.ACCOMMODATION=chalet,apartment' },
      residence: { path: '/serp', morePath: '/ajax/more/serp', baseQuery: 'lang=fr_FR&s_c.ACCOMMODATION=residence' }
    }
  },
  plagne: {
    base: 'https://www.laplagneresort.com',
    channel: null,
    dateStyle: 'dmy',
    locationParam: 's_c.location',
    serp: {
      hotel: {
        path: '/serp',
        morePath: '/ajax/more/serp',
        baseQuery: 'lang=fr_FR&s_c.type_hebergement=hotel,club,bandb'
      },
      apartment: {
        path: '/serp',
        morePath: '/ajax/more/serp',
        baseQuery: 'lang=fr_FR&s_c.type_hebergement=appartement,chalet,gite'
      },
      residence: {
        path: '/serp',
        morePath: '/ajax/more/serp',
        baseQuery: 'lang=fr_FR&s_c.type_hebergement=appartement,chalet,gite'
      }
    }
  }
}

const BASE = SITES.chamonix.base

/** Destination app → code village */
export const LOCATION_MAP: Record<string, string> = {
  chamonix: 'cmb.chamonix',
  'chamonix-mont-blanc': 'cmb.chamonix',
  'les-houches': 'cmb.houches',
  houches: 'cmb.houches',
  vallorcine: 'cmb.vallorcine',
  argentiere: 'cmb.argentiere',
  argentière: 'cmb.argentiere',
  servoz: 'cmb.servoz',
  'aime-2000': 'A2',
  'plagne-aime-2000': 'A2',
  'belle-plagne': 'BP',
  'champagny-en-vanoise': 'CV',
  champagny: 'CV',
  'plagne-montalbert': 'MB',
  montalbert: 'MB',
  'la-plagne-montalbert': 'MB',
  'montchavin-les-coches': 'MC',
  montchavin: 'MC',
  'les-coches': 'MC',
  'plagne-1800': 'P18',
  'plagne-bellecote': 'PB',
  bellecote: 'PB',
  'plagne-centre': 'PC',
  'plagne-soleil': 'PS',
  'plagne-villages': 'PV',
  'la-plagne': 'PC'
}

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export function resolveLocationCode(destination: string | null | undefined): string | null {
  if (!destination) return null
  const raw = destination.trim()
  if (raw.startsWith('cmb.')) return raw
  if (/^[A-Z0-9]{1,4}$/.test(raw) || raw === 'roche') return raw
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

function nightsBetween(from: string, to: string): number {
  const a = Date.parse(from)
  const b = Date.parse(to)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 7
  return Math.max(1, Math.round((b - a) / 86_400_000))
}

function buildQuery(opts: ChamonixSearchOpts, site: OrchestraSiteId): string {
  const cfg = SITES[site]
  const parts = [cfg.serp[opts.type].baseQuery]
  if (cfg.dateStyle === 'iso') {
    if (opts.from) parts.push(`s_checkinDate=${opts.from}`)
    if (opts.to) parts.push(`s_checkoutDate=${opts.to}`)
  } else if (opts.from) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(opts.from)
    if (m) {
      parts.push(`s_dd=${m[3]}`)
      parts.push(`s_dmy=${m[2]}/${m[1]}`)
    }
    const nights = nightsBetween(opts.from, opts.to)
    parts.push(`s_minMan=${nights},${nights}`)
  }
  const pax = Math.max(1, (opts.adults || 0) + (opts.children || 0))
  if (site === 'chamonix' && opts.type !== 'hotel') {
    parts.push(`s_c.PAX.adultsNumber=${opts.adults}`)
    parts.push(`s_c.PAX.childrenNumber=${opts.children}`)
  } else if (site === 'meribel' || site === 'megeve' || site === 'praz') {
    parts.push(`s_c.PAX=${pax}`)
  }
  if (opts.location && cfg.locationParam) {
    parts.push(`${cfg.locationParam}=${opts.location}`)
  }
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
    .replace(/&Agrave;/g, 'À')
    .replace(/&agrave;/g, 'à')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function splitArticles(html: string): string[] {
  const articles: string[] = []
  const re = /<(article|div)\b[^>]*class="[^"]*\bcpt-result(?:-item)?(?:\s|")[^"]*"[^>]*>/gi
  const matches: { start: number; tag: string }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    matches.push({ start: m.index, tag: m[1].toLowerCase() })
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start
    if (matches[i].tag === 'article') {
      const end = html.indexOf('</article>', start)
      if (end === -1) continue
      articles.push(html.slice(start, end + '</article>'.length))
    } else {
      const end = i + 1 < matches.length ? matches[i + 1].start : html.length
      articles.push(html.slice(start, end))
    }
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


function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/** Écarte logos, pictos et assets UI Orchestra qui polluent la SERP. */
function isUsefulListingImage(url: string): boolean {
  const u = url.toLowerCase()
  if (!/\.(jpe?g|png|webp)(\?|$)/i.test(u)) return false
  if (/\/(logo|icon|sprite|placeholder|whatsapp|favicon|blank)[-_.]/i.test(u)) return false
  if (/_core\/images\//i.test(u)) return false
  return true
}

/** Première image utilisable dans le bloc article SERP. */
function extractImageFromBlock(
  body: string,
  productMeta: { img?: string } | null,
  origin: string
): string | null {
  const resolve = (raw: string): string | null => {
    const u = decodeHtmlEntities(raw.trim())
    if (!u) return null
    let abs: string
    try {
      abs = new URL(u, origin).href
    } catch {
      if (!/^https?:\/\//i.test(u)) return null
      abs = u
    }
    return isUsefulListingImage(abs) ? abs : null
  }
  if (productMeta?.img) {
    const abs = resolve(productMeta.img)
    if (abs) return abs
  }
  const patterns = [
    /data-src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
    /src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
    /data-src=["'](\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
  ]
  for (const re of patterns) {
    const m = body.match(re)
    if (m?.[1]) {
      const abs = resolve(m[1])
      if (abs) return abs
    }
  }
  return null
}

function parseArticle(
  block: string,
  from: string,
  to: string,
  origin: string,
  channel: string | null
): ChamonixListing {
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
    body.match(/class="result-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i) ||
    body.match(/class="elem-product-resum[^"]*"[^>]*>[\s\S]*?class="resum"[^>]*>([\s\S]*?)<\//i)
  const subM =
    body.match(/class="result-subtitle"[^>]*>([\s\S]*?)<\/h4>/i) ||
    body.match(/class="secondTitle[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  const priceM =
    body.match(/class="price-EUR"[^>]*>([\s\S]*?)<\/span>/i) ||
    body.match(/class="price"[^>]*>([\s\S]*?)<\/span>/i)
  const fromM =
    body.match(/class="since"[^>]*>([\s\S]*?)<\/div>/i) ||
    body.match(/class="from"[^>]*>([\s\S]*?)<\/span>/i)
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
      listingUrl = new URL(rel, origin).href
    } catch {
      listingUrl = null
    }
  }
  if (listingUrl && from && to && !listingUrl.includes('s_checkinDate')) {
    const baseUrl = listingUrl.split('#')[0]
    const hash = listingUrl.includes('#') ? listingUrl.slice(listingUrl.indexOf('#') + 1) : ''
    const extra = channel ? `&s_channel=${channel}` : ''
    listingUrl = `${baseUrl}#${hash ? hash + '&' : ''}s_checkinDate=${from}&s_checkoutDate=${to}${extra}`
  }

  let lat: number | null = null
  let lon: number | null = null
  if (geo?.geometry?.coordinates && geo.geometry.coordinates.length >= 2) {
    lon = geo.geometry.coordinates[0]
    lat = geo.geometry.coordinates[1]
  }

  const productIdAttr = body.match(/data-product-id="(\d+)"/i)
  const id =
    productMeta?.id != null
      ? String(productMeta.id)
      : productIdAttr
        ? productIdAttr[1]
        : geo?.properties?.code != null
          ? String(geo.properties.code)
          : listingUrl?.match(/\/(?:hotel|product|residence|location)[^"]*?-(\d+)/)?.[1] || null

  return {
    id,
    title,
    city,
    total,
    currency: 'EUR',
    pricePrefix,
    priceUnit: typeM ? stripTags(typeM[1]) : null,
    url: listingUrl,
    image: extractImageFromBlock(body, productMeta, origin),
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


/** og:image / première photo de la fiche produit — filet si la SERP n'a rien. */
/** Cache process-local : une fiche produit n’est ouverte qu’une fois. */
const productImageCache = new Map<string, string | null>()

/** og:image / première photo de la fiche produit — filet si la SERP n’a rien. */
async function fetchProductImage(productUrl: string): Promise<string | null> {
  const pageUrl = productUrl.split('#')[0]
  if (productImageCache.has(pageUrl)) return productImageCache.get(pageUrl) ?? null
  const result = await fetchText(pageUrl, { timeoutMs: 5_000 })
  if (!result.ok) {
    productImageCache.set(pageUrl, null)
    return null
  }
  const html = result.text
  const og =
    html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
  let img: string | null = null
  if (og?.[1]) img = decodeHtmlEntities(og[1].trim())
  if (!img) {
    const m = html.match(
      /class=["'][^"']*diaporama[^"']*["'][\s\S]{0,400}?data-src=["'](https?:\/\/[^"']+)["']/i
    )
    if (m?.[1]) img = decodeHtmlEntities(m[1])
  }
  productImageCache.set(pageUrl, img)
  return img
}

/**
 * Enrichit un petit lot d’annonces sans photo.
 * - Annulé si la SERP a déjà ≥ 70 % de photos (coût réseau inutile).
 * - Cache + timeout 5 s + concurrence 2 pour ne pas freiner le relevé.
 */
async function enrichMissingImages(
  listings: ChamonixListing[],
  limit = 4
): Promise<void> {
  if (listings.length === 0) return
  const withImg = listings.filter((l) => l.image).length
  if (withImg / listings.length >= 0.7) return
  const need = listings.filter((l) => !l.image && l.url).slice(0, limit)
  if (need.length === 0) return
  const conc = 2
  for (let i = 0; i < need.length; i += conc) {
    const batch = need.slice(i, i + conc)
    const imgs = await Promise.all(batch.map((l) => fetchProductImage(l.url!)))
    for (let j = 0; j < batch.length; j++) {
      if (imgs[j]) batch[j].image = imgs[j]
    }
  }
}

function parseNbResult(html: string): number | null {
  const m =
    html.match(/class="nb_result[^"]*"[^>]*>([\s\S]*?)<\//i) ||
    html.match(/class="number"[^>]*>([\s\S]*?)</i)
  if (!m) return null
  const n = stripTags(m[1]).match(/(\d+)/)
  return n ? Number(n[1]) : null
}

function hasMoreButton(html: string): boolean {
  return (
    /see-more-results/i.test(html) ||
    /data-ajax-url="[^"]*ajax\/more/i.test(html) ||
    /ajax\/filterEngine/i.test(html)
  )
}

/**
 * Recherche SERP Chamonix (un type d’hébergement).
 */
export async function extractChamonix(
  opts: ChamonixSearchOpts
): Promise<ChamonixExtractResult> {
  const site = opts.site ?? 'chamonix'
  const siteCfg = SITES[site]
  const cfg = siteCfg.serp[opts.type]
  const maxPages = opts.maxPages ?? 2
  const byPage = opts.byPage ?? 20
  const pricedOnly = opts.pricedOnly !== false
  const location = opts.location ? resolveLocationCode(opts.location) || opts.location : null

  const query = buildQuery({ ...opts, location }, site)
  const firstUrl = `${siteCfg.base}${cfg.path}?${query}`
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
    const item = parseArticle(block, opts.from, opts.to, siteCfg.base, siteCfg.channel)
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
    const moreUrl = `${siteCfg.base}${cfg.morePath}?${query}&page=${page}&byPage=${byPage}`
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
      const item = parseArticle(block, opts.from, opts.to, siteCfg.base, siteCfg.channel)
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

  await enrichMissingImages(listings, 4)

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

  await enrichMissingImages(listings, 4)

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


/** @internal tests — parse d’un fragment SERP sans réseau. */
export function parseSerpHtmlForTest(
  html: string,
  from: string,
  to: string,
  origin: string,
  channel: string | null = null
): ChamonixListing[] {
  return splitArticles(html).map((block) => parseArticle(block, from, to, origin, channel))
}
