/**
 * Providers AccommodationProvider basés sur Playwright (repli hors API).
 *
 * ⚠ Scraping — robots.txt / CGU souvent interdisent. Les connecteurs API
 * (Booking Demand, Expedia Rapid, LiteAPI) restent prioritaires quand une clé
 * est présente : ces providers web sont destinés au mode « scrape » explicite.
 */

import type { Page } from 'playwright'
import type { Accommodation, AccommodationProvider, ProviderHealth, SearchParams } from '../types'
import {
  extractBookingCards,
  extractCozycozyCards,
  extractExpediaFamilyCards,
  extractGitesCards,
  type RawCard
} from './extractors'
import {
  baseAccommodation,
  parsePrice,
  scrollPage,
  sleep,
  withPage,
  withRetries,
  type ScrapeAttemptOptions
} from './shared'
import {
  bookingSearchUrl,
  cozycozySearchUrl,
  expediaSearchUrl,
  gitesSearchUrl
} from './urls'

function mapCards(
  source: string,
  cards: RawCard[],
  params: SearchParams
): Accommodation[] {
  const out: Accommodation[] = []
  for (const c of cards) {
    if (!c.title || !c.url) continue
    const price = parsePrice(c.priceText)
    const rating = c.ratingText ? parseFloat(c.ratingText.replace(',', '.')) : undefined
    out.push(
      baseAccommodation(
        source,
        {
          sourceId: c.sourceId,
          title: c.title,
          url: c.url,
          totalPrice: price,
          currency: 'EUR',
          rating: Number.isFinite(rating) ? rating : undefined,
          images: c.image ? [c.image] : undefined
        },
        params
      )
    )
  }
  return out
}

async function loadAndExtract(
  page: Page,
  url: string,
  timeoutMs: number,
  extract: () => RawCard[],
  scrolls = 2
): Promise<RawCard[]> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
  await sleep(1500 + Math.random() * 800)
  await scrollPage(page, scrolls)
  try {
    await page.waitForLoadState('networkidle', { timeout: 6_000 })
  } catch {
    // ignore
  }
  await sleep(500)
  return page.evaluate(extract)
}

function makeProvider(
  name: string,
  buildUrl: (p: SearchParams) => string,
  extract: () => RawCard[],
  opts?: ScrapeAttemptOptions
): AccommodationProvider {
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const timeoutMs = opts?.timeoutMs ?? 45_000
      const headless = opts?.headless !== false
      return withRetries(name, opts ?? {}, async (attempt) => {
        const cards = await withPage(
          headless,
          (page) => loadAndExtract(page, buildUrl(params), timeoutMs, extract, 2),
          attempt > 1
        )
        const list = mapCards(name, cards, params)
        if (list.length === 0) {
          throw new Error(`${name}: aucune carte extraite (page dynamique ou blocage anti-bot)`)
        }
        return list
      })
    },
    async health(): Promise<ProviderHealth> {
      return {
        name,
        reachable: true,
        detail: 'scraper Playwright (repli web — préférer API si disponible)'
      }
    }
  }
}

export function createBookingWebProvider(opts?: ScrapeAttemptOptions): AccommodationProvider {
  return makeProvider('booking-web', bookingSearchUrl, extractBookingCards, opts)
}

export function createExpediaWebProvider(opts?: ScrapeAttemptOptions): AccommodationProvider {
  return makeProvider('expedia-web', expediaSearchUrl, extractExpediaFamilyCards, opts)
}

export function createGitesWebProvider(opts?: ScrapeAttemptOptions): AccommodationProvider {
  return makeProvider('gites-web', gitesSearchUrl, extractGitesCards, opts)
}

export function createCozycozyWebProvider(opts?: ScrapeAttemptOptions): AccommodationProvider {
  return makeProvider('cozycozy-web', cozycozySearchUrl, extractCozycozyCards, opts)
}

export const WEB_SCRAPE_PROVIDER_NAMES = [
  'booking-web',
  'expedia-web',
  'gites-web',
  'cozycozy-web'
] as const
