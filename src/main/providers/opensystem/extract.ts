/**
 * Relevé Open System — JSONP etape-rest (vueinfo.id) + catalogue titres.
 *
 * Pipe relevé dans osrecherche-pack-1.0 (loginAPI + Dispo) :
 *   ConversationId|page|20|login|polygone|positions|vueId|page|filtre1|filtre2|
 *   metier|nuits|YYYY-MM-DD|adultes|ages|*|nonVendable|paxAdultes|paxAges|*
 *
 * Sans `vueId` (vueinfo.id), etape-rest répond 200 items:[].
 */

import type { OpenSystemSite } from './hosts'
import {
  mergeEtapeAndVue,
  parseEtapeMeta,
  parseEtapeOffers,
  parseOpenSystemPayload,
  parseVueInfo,
  type EtapeOffer,
  type OpenSystemListing,
  type VueInfoItem
} from './parse'

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const MAP_JSONP = 'https://map-jsonp.open-system.fr'
const MAX_PAGES = 10

export interface OpenSystemExtractResult {
  ok: boolean
  error?: string
  count: number
  listings: OpenSystemListing[]
  source?: 'jsonp' | 'html'
}

function nightsBetween(from: string, to: string): number {
  const a = Date.parse(from)
  const b = Date.parse(to)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 7
  return Math.max(1, Math.round((b - a) / 86_400_000))
}

function dmyParts(iso: string): { d: string; m: string; y: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return { y: m[1]!, m: m[2]!, d: m[3]! }
}

function dmy(iso: string): string {
  const p = dmyParts(iso)
  return p ? `${p.d}/${p.m}/${p.y}` : iso
}

async function fetchText(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<{ ok: true; text: string; contentType: string } | { ok: false; error: string }> {
  const timeoutMs = init.timeoutMs ?? 20_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const { timeoutMs: _t, ...rest } = init
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/javascript,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        ...(rest.headers as Record<string, string> | undefined)
      },
      redirect: 'follow'
    })
    const text = await res.text()
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} for ${url}` }
    return { ok: true, text, contentType: res.headers.get('content-type') || '' }
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

/**
 * Pipe etape-rest — champs relevés dans osrecherche-pack (loginAPI + dispo).
 * Le 7ᵉ champ EST `vueinfo.id`. Metier 2 = hébergements (proto OsForm).
 */
export function etapeRestQuery(opts: {
  login: string
  vueId: number
  from: string
  nights: number
  adults: number
  children: number
  page?: number
  conversationId?: string
}): string {
  const page = opts.page ?? 0
  const ages = opts.children > 0 ? Array.from({ length: opts.children }, () => 8).join(',') : ''
  return [
    opts.conversationId ?? '',
    String(page),
    '20',
    opts.login,
    '',
    '',
    String(opts.vueId),
    String(page),
    '0',
    '',
    '2',
    String(opts.nights),
    opts.from,
    String(opts.adults),
    ages,
    '*',
    '0',
    '0',
    '',
    '*'
  ].join('|')
}

function listingQuery(from: string, nights: number, adults: number, children: number): string {
  const p = dmyParts(from)
  const parts = [
    `Param/DureeSejour=${nights}`,
    `Param/NbPers=${adults + children}`,
    `Globales/NbAdultes=${adults}`
  ]
  if (p) {
    parts.push(`Globales/JourDebut=${p.d}`, `Globales/MoisDebut=${p.m}`, `Globales/AnDebut=${p.y}`)
  }
  return parts.join('&')
}

const vueCache = new Map<string, VueInfoItem[]>()

export async function fetchVueInfo(site: OpenSystemSite): Promise<VueInfoItem[]> {
  if (!site.vueinfoPath) return []
  const cached = vueCache.get(site.id)
  if (cached) return cached
  const url = `${MAP_JSONP}/${site.vueinfoPath}`
  const res = await fetchText(url, {
    headers: { Origin: site.origin, Referer: `${site.origin}/` }
  })
  if (!res.ok) return []
  const items = parseVueInfo(res.text)
  if (items.length) vueCache.set(site.id, items)
  return items
}

async function fetchEtapePages(
  site: OpenSystemSite,
  from: string,
  nights: number,
  adults: number,
  children: number
): Promise<EtapeOffer[]> {
  if (!site.login || site.vueId == null) return []
  const collected: EtapeOffer[] = []
  const seen = new Set<string>()
  let conversationId = ''
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = etapeRestQuery({
      login: site.login,
      vueId: site.vueId,
      from,
      nights,
      adults,
      children,
      page,
      conversationId
    })
    const url =
      `https://etape-rest.for-system.com/index.aspx?ref=json-catalogue-etape16v5` +
      `&callback=cb&q=${encodeURIComponent(q)}`
    const res = await fetchText(url, {
      headers: { Origin: site.origin, Referer: `${site.origin}/` }
    })
    if (!res.ok) break
    const batch = parseEtapeOffers(res.text)
    const meta = parseEtapeMeta(res.text)
    if (meta.conversationId) conversationId = meta.conversationId
    for (const item of batch) {
      if (seen.has(item.cle)) continue
      seen.add(item.cle)
      collected.push(item)
    }
    if (batch.length === 0 || !meta.more) break
  }
  return collected
}

async function fetchHtmlListings(
  site: OpenSystemSite,
  from: string,
  to: string,
  nights: number,
  adults: number,
  children: number
): Promise<OpenSystemListing[]> {
  const q = listingQuery(from, nights, adults, children)
  const urls: string[] = []
  if (site.wordpressListPath) {
    const u = new URL(site.wordpressListPath, site.origin)
    u.searchParams.set('opensystem_du', dmy(from))
    u.searchParams.set('opensystem_au', dmy(to))
    u.searchParams.set('opensystem_nbpers', String(adults + children))
    urls.push(u.href)
  }
  const zones = [site.zoneRech, site.zone].filter((z): z is number => Boolean(z && z > 0))
  for (const z of zones) {
    urls.push(`${site.origin}/z${z}_fr-.aspx?${q}`)
  }
  for (const url of urls) {
    const res = await fetchText(url, { headers: { Referer: `${site.origin}/` } })
    if (!res.ok) continue
    const listings = parseOpenSystemPayload(res.text, { origin: site.origin, from, to })
    if (listings.length) return listings
  }
  return []
}

export async function extractOpenSystem(opts: {
  site: OpenSystemSite
  from: string
  to: string
  adults: number
  children: number
}): Promise<OpenSystemExtractResult> {
  const nights = nightsBetween(opts.from, opts.to)
  const stamp = (rows: OpenSystemListing[]): OpenSystemListing[] =>
    rows.map((r) => ({ ...r, priceCheckIn: opts.from, priceCheckOut: opts.to }))

  try {
    const [offers, vue] = await Promise.all([
      fetchEtapePages(opts.site, opts.from, nights, opts.adults, opts.children),
      fetchVueInfo(opts.site)
    ])
    const jsonp = stamp(
      mergeEtapeAndVue(offers, vue, {
        origin: opts.site.origin,
        from: opts.from,
        to: opts.to
      })
    )
    if (jsonp.length) {
      return { ok: true, count: jsonp.length, listings: jsonp, source: 'jsonp' }
    }
    const html = stamp(
      await fetchHtmlListings(
        opts.site,
        opts.from,
        opts.to,
        nights,
        opts.adults,
        opts.children
      )
    )
    if (html.length) {
      return { ok: true, count: html.length, listings: html, source: 'html' }
    }
    return { ok: true, count: 0, listings: [] }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      count: 0,
      listings: []
    }
  }
}
