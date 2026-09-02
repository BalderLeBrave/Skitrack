/**
 * Extraction Airbnb via Cheerio (HTML déjà obtenu, y compris snapshots dynamiques).
 *
 * Cheerio ne exécute pas le JS : il parse le HTML final fourni par Playwright
 * (`page.content()`) après hydration. Gère plusieurs nœuds
 * `data-deferred-state-0`, `-1`, … que Airbnb peut injecter au fil du scroll.
 */

import * as cheerio from 'cheerio'
import {
  extractFromDeferredStateText,
  extractListingsFromDeferredState,
  type AirbnbClipListing,
  type AirbnbClipPayload
} from './extract'

export interface CheerioAirbnbMeta {
  checkIn?: string
  checkOut?: string
  destination?: string
}

function mergeListings(items: AirbnbClipListing[]): AirbnbClipListing[] {
  const map = new Map<string, AirbnbClipListing>()
  for (const item of items) {
    const prev = map.get(item.id)
    if (!prev) {
      map.set(item.id, item)
      continue
    }
    map.set(item.id, {
      ...prev,
      ...item,
      priceLabel: item.priceLabel || prev.priceLabel,
      image: item.image || prev.image,
      lat: item.lat ?? prev.lat,
      lon: item.lon ?? prev.lon,
      ratingLabel: item.ratingLabel || prev.ratingLabel,
      guests: item.guests ?? prev.guests,
      bedrooms: item.bedrooms ?? prev.bedrooms
    })
  }
  return [...map.values()]
}

/** Récupère tous les textes JSON candidats dans le HTML. */
function collectDeferredJsonTexts($: ReturnType<typeof cheerio.load>): string[] {
  const texts: string[] = []
  const seen = new Set<string>()

  const push = (raw: string | null | undefined): void => {
    const text = raw?.trim()
    if (!text || text.length < 50) return
    if (!(text.startsWith('{') || text.startsWith('['))) return
    // Empreinte courte pour dédupliquer snapshots identiques
    const key = `${text.length}:${text.slice(0, 64)}:${text.slice(-32)}`
    if (seen.has(key)) return
    seen.add(key)
    texts.push(text)
  }

  const selectors = [
    '[id^="data-deferred-state"]',
    'script#data-deferred-state-0',
    'script[id^="data-deferred-state"]',
    'script[data-deferred-state]',
    'script[type="application/json"][id*="deferred"]'
  ]

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      push($(el).html() || $(el).text())
    })
  }

  // Scripts contenant la signature GraphQL Airbnb search
  if (texts.length === 0) {
    $('script').each((_, el) => {
      const t = $(el).html() || $(el).text() || ''
      if (t.includes('StaySearchResult') && t.includes('demandStayListing')) {
        push(t)
      }
    })
  }

  return texts
}

/**
 * Lit tous les blocs deferred du HTML et fusionne les annonces par id.
 */
export function extractAirbnbFromHtml(
  html: string,
  meta?: CheerioAirbnbMeta
): AirbnbClipPayload {
  const $ = cheerio.load(html)
  const jsonTexts = collectDeferredJsonTexts($)

  if (jsonTexts.length === 0) {
    throw new Error(
      'Aucun bloc data-deferred-state trouvé dans le HTML. ' +
        'La page n’est peut-être pas une recherche Airbnb complètement chargée (HTML dynamique non hydraté).'
    )
  }

  let all: AirbnbClipListing[] = []
  for (const raw of jsonTexts) {
    try {
      const payload = extractFromDeferredStateText(raw, meta)
      all = all.concat(payload.listings)
    } catch {
      // Un des blocs peut être un fragment non search : ignorer
      try {
        const root = JSON.parse(raw) as unknown
        const partial = extractListingsFromDeferredState(root, meta)
        all = all.concat(partial.listings)
      } catch {
        // ignore
      }
    }
  }

  const listings = mergeListings(all)
  if (listings.length === 0) {
    throw new Error(
      'Blocs deferred trouvés mais aucune annonce StaySearchResult. ' +
        'HTML peut-être encore partiel (chargement dynamique en cours).'
    )
  }

  const pageUrl =
    $('link[rel="canonical"]').attr('href') ||
    $('meta[property="og:url"]').attr('content') ||
    ''
  let checkIn = meta?.checkIn
  let checkOut = meta?.checkOut
  if (pageUrl) {
    try {
      const u = new URL(pageUrl)
      checkIn = checkIn || u.searchParams.get('checkin') || u.searchParams.get('check_in') || undefined
      checkOut =
        checkOut || u.searchParams.get('checkout') || u.searchParams.get('check_out') || undefined
    } catch {
      // ignore
    }
  }

  return {
    source: 'airbnb',
    destination: meta?.destination,
    checkIn,
    checkOut,
    listings
  }
}

export function extractOpenGraph(html: string): {
  title: string | null
  description: string | null
  image: string | null
  url: string | null
} {
  const $ = cheerio.load(html)
  const prop = (name: string): string | null => {
    const v =
      $(`meta[property="${name}"]`).attr('content') ||
      $(`meta[name="${name}"]`).attr('content') ||
      null
    return v?.trim() || null
  }
  return {
    title: prop('og:title') || $('title').first().text().trim() || null,
    description: prop('og:description') || prop('description'),
    image: prop('og:image'),
    url: prop('og:url')
  }
}

export function extractJsonLd(html: string): unknown[] {
  const $ = cheerio.load(html)
  const out: unknown[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).html()?.trim()
    if (!text) return
    try {
      out.push(JSON.parse(text))
    } catch {
      // ignore
    }
  })
  return out
}
