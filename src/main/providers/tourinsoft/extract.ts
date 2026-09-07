/**
 * Tourinsoft Connector — cartes `article.tsc-card` dump 2026-09-02.
 *
 * Occupancy et tarif « à partir de » sont des pastilles de la carte, pas le
 * contenu marketing REST. On ne lit pas « N personnes » dans le prose.
 * Page 1 seulement : 12 cartes, compteur 100 — pagination non dumpée.
 */

import type { TourinsoftSite } from './hosts'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export interface TourinsoftListing {
  id: string
  title: string
  url: string
  guests: number | null
  bedrooms: number | null
  weekMin: number | null
  kind: string | null
  image: string | null
}

export interface TourinsoftExtractResult {
  ok: boolean
  error?: string
  count: number
  listed: number | null
  listings: TourinsoftListing[]
}

export function parseEuro(raw: string): number | null {
  const cleaned = raw.replace(/&nbsp;|\u00a0/gi, ' ').replace(/\s+/g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function decodeHtml(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&/gi, '&')
    .replace(/&rsquo;/gi, '’')
    .replace(/&#8217;/gi, '’')
    .replace(/&eacute;/gi, 'é')
    .replace(/&Eacute;/gi, 'É')
    .replace(/&#039;/g, "'")
    .replace(/"/g, '"')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseListedCount(html: string): number | null {
  const m = html.match(/tsc-count-number">\s*(\d+)\s*</i)
  if (!m) return null
  return Number(m[1])
}

export function parseTscCards(html: string): TourinsoftListing[] {
  const out: TourinsoftListing[] = []
  const seen = new Set<string>()
  const re = /<article class="tsc-card tsc-card-design" data-id="(\d+)">([\s\S]*?)<\/article>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const id = m[1]!
    if (seen.has(id)) continue
    seen.add(id)
    const chunk = m[0]
    const href = chunk.match(/href="(https?:\/\/[^"]+\/hebergement\/[^"]+)"/i)
    const titleM = chunk.match(/<h3 class="tsc-card-title">([\s\S]*?)<\/h3>/i)
    const title = titleM ? decodeHtml(titleM[1]!) : ''
    if (!href || !title) continue
    const persM = chunk.match(/tsc-pill">[\s\S]*?(\d+)\s*pers\./i)
    const chM = chunk.match(/tsc-pill">[\s\S]*?(\d+)\s*ch\./i)
    const priceM = chunk.match(/tsc-card-price-tag">\s*à partir de\s*([\d\s\u00a0]+)\s*€/i)
    const kindM = chunk.match(/tsc-card-type-pill">\s*([\s\S]*?)<\/span>/i)
    const imgM = chunk.match(/<img[^>]+src="([^"]+)"/i)
    out.push({
      id,
      title,
      url: href[1]!,
      guests: persM ? Number(persM[1]) : null,
      bedrooms: chM ? Number(chM[1]) : null,
      weekMin: priceM ? parseEuro(priceM[1]!) : null,
      kind: kindM ? decodeHtml(kindM[1]!) : null,
      image: imgM?.[1] ?? null
    })
  }
  return out
}

export async function extractTourinsoft(opts: {
  site: TourinsoftSite
}): Promise<TourinsoftExtractResult> {
  const url = `${opts.site.origin}${opts.site.cataloguePath}`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9'
      },
      redirect: 'follow'
    })
    const text = await res.text()
    if (res.status !== 200) {
      return { ok: false, error: `catalogue HTTP ${res.status}`, count: 0, listed: null, listings: [] }
    }
    const listings = parseTscCards(text)
    const listed = parseListedCount(text)
    if (listings.length === 0) {
      return {
        ok: false,
        error: '0 tsc-card (HTML 403 ou boucle JS non dumpée)',
        count: 0,
        listed,
        listings: []
      }
    }
    return { ok: true, count: listings.length, listed, listings }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      count: 0,
      listed: null,
      listings: []
    }
  }
}
