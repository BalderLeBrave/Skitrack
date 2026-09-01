/**
 * LocVacances getListe / getFiche — dump 2026-09-01, getFiche 2026-09-02.
 *
 * Carte `.Card.Card_Lots` : tarif séjour daté, « N pièces - P personnes ».
 * Chalet sans pièces sur la carte : getFiche (`<h5>5 pièces … | 12 personnes</h5>`).
 * On ne traduit pas « lits doubles » en chambres.
 */

import type { LocvacancesSite } from './hosts'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const MAX_PAGES = 10

export interface LocvacancesListing {
  id: string
  title: string
  url: string
  total: number
  guests: number | null
  rooms: number | null
  city: string | null
  image: string | null
  lat: number | null
  lon: number | null
}

export interface LocvacancesExtractResult {
  ok: boolean
  error?: string
  count: number
  listings: LocvacancesListing[]
}

export function isoToDmy(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return `${m[3]}/${m[2]}/${m[1]}`
}

export function parseEuro(raw: string): number | null {
  const cleaned = raw.replace(/&nbsp;|\u00a0/gi, ' ').replace(/\s+/g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

export function parseGetNb(html: string): number | null {
  const none = /plus de disponibilit/i.test(html)
  if (none) return 0
  const m = html.match(/(\d+)\s*R[eé]sultats?/i)
  if (!m) return null
  return Number(m[1])
}

function decodeHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&euro;/gi, '€')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&/gi, '&')
    .replace(/&#039;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseListeCards(html: string, origin: string): LocvacancesListing[] {
  const out: LocvacancesListing[] = []
  const seen = new Set<string>()
  const parts = html.split(/class="Card Card_Lots"/)
  for (const part of parts.slice(1)) {
    const chunk = `class="Card Card_Lots"${part}`
    const href = chunk.match(/href="(\/reservation\/resultats\/(\d+)\/)"/)
    if (!href) continue
    const id = href[2]!
    if (seen.has(id)) continue
    const priceRaw = chunk.match(/Card_Price[^>]*>\s*(?:<span><\/span>)?\s*([\d\s\u00a0]+)\s*(?:&euro;|€)/i)
    const total = priceRaw ? parseEuro(priceRaw[1]!) : null
    if (total == null) continue
    const h4 = chunk.match(/<h4>([\s\S]*?)<\/h4>/i)
    const titleBlock = h4 ? decodeHtml(h4[1]!) : ''
    const titleParts = titleBlock.split('\n').map((s) => s.trim()).filter(Boolean)
    const title = titleParts[0] || `Lot ${id}`
    const city = titleParts[1] || null
    const desc = chunk.match(/(\d+)\s*pi[eè]ces?[^\d]{0,20}(\d+)\s*personnes?/i)
    const guestsOnly = chunk.match(/(?:Chalet|Appartement|Studio)[^\d]{0,40}(\d+)\s*personnes?/i)
    const rooms = desc ? Number(desc[1]) : null
    const guests = desc ? Number(desc[2]) : guestsOnly ? Number(guestsOnly[1]) : null
    const img = chunk.match(/<img[^>]+src="([^"]+)"/i)
    seen.add(id)
    out.push({
      id,
      title,
      url: `${origin}${href[1]}`,
      total,
      guests: guests && guests > 0 ? guests : null,
      rooms: rooms && rooms > 0 ? rooms : null,
      city,
      image: img?.[1] ?? null,
      lat: null,
      lon: null
    })
  }
  return out
}

export function parseFiche(html: string): {
  rooms: number | null
  guests: number | null
  lat: number | null
  lon: number | null
} {
  const h5 = html.match(/<h5>([\s\S]*?)<\/h5>/i)
  const line = h5 ? decodeHtml(h5[1]!) : decodeHtml(html.slice(0, 4000))
  const roomsM = line.match(/(\d+)\s*pi[eè]ces?/i)
  const guestsM = line.match(/(\d+)\s*personnes?/i)
  const gps = html.match(/initGmap\('(-?\d+(?:\.\d+)?)','(-?\d+(?:\.\d+)?)'/)
  return {
    rooms: roomsM ? Number(roomsM[1]) : null,
    guests: guestsM ? Number(guestsM[1]) : null,
    lat: gps ? Number(gps[1]) : null,
    lon: gps ? Number(gps[2]) : null
  }
}

function cookieFrom(res: Response): string {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  if (list.length) return list.map((c) => c.split(';')[0]!).join('; ')
  const raw = res.headers.get('set-cookie')
  if (!raw) return ''
  return raw
    .split(/,(?=\s*[A-Za-z0-9_]+=)/)
    .map((c) => c.split(';')[0]!.trim())
    .filter(Boolean)
    .join('; ')
}

async function call(
  url: string,
  cookie: string,
  referer: string
): Promise<{ status: number; text: string; cookie: string }> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      Referer: referer,
      'X-Requested-With': 'XMLHttpRequest',
      ...(cookie ? { Cookie: cookie } : {})
    },
    redirect: 'follow'
  })
  const extra = cookieFrom(res)
  const next = extra ? (cookie ? `${cookie}; ${extra}` : extra) : cookie
  return { status: res.status, text: await res.text(), cookie: next }
}

export async function extractLocvacances(opts: {
  site: LocvacancesSite
  from: string
  to: string
}): Promise<LocvacancesExtractResult> {
  const dd = isoToDmy(opts.from)
  const df = isoToDmy(opts.to)
  if (!dd || !df) return { ok: false, error: 'dates invalides', count: 0, listings: [] }
  const origin = opts.site.origin
  const referer = `${origin}${opts.site.listPath}`
  const ajax = (id: string, extra = '') =>
    `${origin}/ajax/ajax.req.4g.php?id=${id}${extra}`
  try {
    const home = await call(referer, '', referer)
    if (home.status !== 200) {
      return { ok: false, error: `home HTTP ${home.status}`, count: 0, listings: [] }
    }
    let cookie = home.cookie
    const dates = `&dd=${encodeURIComponent(dd)}&df=${encodeURIComponent(df)}`
    const stepDd = await call(ajax('dd', `&dd=${encodeURIComponent(dd)}`), cookie, referer)
    cookie = stepDd.cookie
    const stepDf = await call(ajax('df', dates), cookie, referer)
    cookie = stepDf.cookie
    const crit = await call(ajax('criteres', dates), cookie, referer)
    cookie = crit.cookie
    if (crit.status !== 200) {
      return { ok: false, error: `criteres HTTP ${crit.status}`, count: 0, listings: [] }
    }

    const listings: LocvacancesListing[] = []
    const seen = new Set<string>()
    for (let page = 1; page <= MAX_PAGES; page++) {
      const liste = await call(
        ajax('getListe', `${dates}&page=${page}`),
        cookie,
        referer
      )
      cookie = liste.cookie
      if (liste.status !== 200) {
        return { ok: false, error: `getListe HTTP ${liste.status}`, count: 0, listings: [] }
      }
      const cards = parseListeCards(liste.text, origin)
      let added = 0
      for (const card of cards) {
        if (seen.has(card.id)) continue
        seen.add(card.id)
        listings.push(card)
        added++
      }
      if (added === 0) break
    }

    for (const item of listings) {
      if (item.rooms != null) continue
      const fiche = await call(ajax('getFiche', `&lot_no=${item.id}&page=1`), cookie, referer)
      cookie = fiche.cookie
      if (fiche.status !== 200) continue
      const extra = parseFiche(fiche.text)
      if (extra.rooms != null) item.rooms = extra.rooms
      if (item.guests == null && extra.guests != null) item.guests = extra.guests
      if (extra.lat != null) item.lat = extra.lat
      if (extra.lon != null) item.lon = extra.lon
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
