/**
 * Diffusio SERP + fiche — dump 2026-09-01, fiche Musardière 2026-09-02.
 *
 * SERP : `.list-item-TFO{id}` + `.capacite` + `.place`. Pas de chambres, pas de prix.
 * Fiche : `<li>4 chambres</li>`, « semaine à partir de 850 € », « Semaine : 850 à 1347 € ».
 * Fourchette → `priceConfidence: partial`. On ne prend pas le milieu.
 */

import type { DiffusioSite } from './hosts'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const FICHE_CONCURRENCY = 4

export interface DiffusioSerpCard {
  id: string
  title: string
  href: string
  guests: number | null
  city: string | null
  image: string | null
}

export interface DiffusioListing {
  id: string
  title: string
  url: string
  guests: number | null
  bedrooms: number | null
  city: string | null
  image: string | null
  weekMin: number | null
  weekMax: number | null
}

export interface DiffusioExtractResult {
  ok: boolean
  error?: string
  count: number
  listings: DiffusioListing[]
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
    .replace(/&#039;/g, "'")
    .replace(/"/g, '"')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseSerpCards(html: string): DiffusioSerpCard[] {
  const out: DiffusioSerpCard[] = []
  const seen = new Set<string>()
  const re = /list-item-TFO(\d+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const id = m[1]!
    if (seen.has(id)) continue
    const chunk = html.slice(Math.max(0, m.index - 80), m.index + 2800)
    const hrefM = chunk.match(/href="([^"]*TFO[^"]*)"/i)
    const titleM =
      chunk.match(/title="Voir l'offre\s+([^"]+)"/i) ||
      chunk.match(/<h3>\s*<a[^>]*>([\s\S]*?)<\/a>/i)
    const persM = chunk.match(/Capacit[eé]\s*:\s*(\d+)\s*personnes?/i)
    const placeM = chunk.match(/<p class="place">([\s\S]*?)<\/p>/i)
    const imgM = chunk.match(/data-src="([^"]+)"/i) || chunk.match(/src="([^"]+)"/i)
    seen.add(id)
    const href = hrefM?.[1] ?? `/fr/fiche/hebergement-locatif/_TFO${id}/`
    const title = titleM ? decodeHtml(titleM[1]!) : `TFO${id}`
    const city = placeM ? decodeHtml(placeM[1]!).replace(/^[^A-Za-zÀ-ÿ]+/, '').trim() || null : null
    out.push({
      id,
      title,
      href,
      guests: persM ? Number(persM[1]) : null,
      city,
      image: imgM?.[1] ?? null
    })
  }
  return out
}

export function parseFiche(html: string): {
  bedrooms: number | null
  guests: number | null
  weekMin: number | null
  weekMax: number | null
} {
  const liBed = html.match(/<li[^>]*>\s*(\d+)\s*chambres?\s*<\/li>/i)
  const proseBed = html.match(/(\d+)\s*chambres?/i)
  const liGuests = html.match(/<li[^>]*>\s*Capacit[eé]\s*:\s*(\d+)\s*personnes?\s*<\/li>/i)
  const range = html.match(
    /Semaine\s*:\s*(?:de\s*)?([\d\s\u00a0]+)\s*(?:€|&euro;)?\s*à\s*([\d\s\u00a0]+)\s*(?:€|&euro;)/i
  )
  const from = html.match(
    /semaine\s*à partir de\s*([\d\s\u00a0]+)\s*(?:€|&euro;)/i
  )
  const weekMin = range ? parseEuro(range[1]!) : from ? parseEuro(from[1]!) : null
  const weekMax = range ? parseEuro(range[2]!) : null
  return {
    bedrooms: liBed ? Number(liBed[1]) : proseBed ? Number(proseBed[1]) : null,
    guests: liGuests ? Number(liGuests[1]) : null,
    weekMin,
    weekMax
  }
}

function absUrl(origin: string, href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href
  if (href.startsWith('//')) return `https:${href}`
  return `${origin}${href.startsWith('/') ? href : `/${href}`}`
}

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9'
    },
    redirect: 'follow'
  })
  return { status: res.status, text: await res.text() }
}

async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size)
    out.push(...(await Promise.all(slice.map(fn))))
  }
  return out
}

export function datedSerpUrl(site: DiffusioSite, from: string, to: string): string {
  const q = `id1[d]=~${from}~${to}&id1[prestation]=resa`
  return `${site.origin}${site.serpPath}?${q}`
}

export async function extractDiffusio(opts: {
  site: DiffusioSite
  from: string
  to: string
  minGuests?: number
}): Promise<DiffusioExtractResult> {
  try {
    const serpUrl = datedSerpUrl(opts.site, opts.from, opts.to)
    const serp = await fetchText(serpUrl)
    if (serp.status !== 200 && serp.status !== 500) {
      // Dump 2026-09-01 : la SERP datée a répondu 500 avec le HTML des cartes.
      return { ok: false, error: `serp HTTP ${serp.status}`, count: 0, listings: [] }
    }
    const cards = parseSerpCards(serp.text)
    if (cards.length === 0) {
      return { ok: true, count: 0, listings: [] }
    }
    const floor = opts.minGuests && opts.minGuests > 0 ? opts.minGuests : 0
    const needed = floor > 0 ? cards.filter((c) => (c.guests ?? 0) >= floor) : cards
    const enriched = await mapPool(needed, FICHE_CONCURRENCY, async (card) => {
      const url = absUrl(opts.site.origin, card.href)
      const fiche = await fetchText(url)
      const extra = fiche.status === 200 ? parseFiche(fiche.text) : {
        bedrooms: null,
        guests: null,
        weekMin: null,
        weekMax: null
      }
      const listing: DiffusioListing = {
        id: card.id,
        title: card.title,
        url,
        guests: extra.guests ?? card.guests,
        bedrooms: extra.bedrooms,
        city: card.city,
        image: card.image,
        weekMin: extra.weekMin,
        weekMax: extra.weekMax
      }
      return listing
    })
    return { ok: true, count: enriched.length, listings: enriched }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      count: 0,
      listings: []
    }
  }
}
