/**
 * Socle commun des scrapers web (Playwright + Cheerio + backoff).
 *
 * ⚠ Contourne robots.txt / CGU des plateformes. Usage personnel à vos risques.
 * Préférer les API officielles (Booking Demand, Expedia Rapid, LiteAPI) quand
 * des clés sont configurées : ces scrapers sont un repli, pas le chemin nominal.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { join } from 'node:path'
import { app } from 'electron'
import type { Accommodation, SearchParams } from '../types'
import { nextProxy, toPlaywrightProxy, type ProxyConfig } from '../proxy'
import { nowIso } from '../types'

export interface ScrapeAttemptOptions {
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  timeoutMs?: number
  headless?: boolean
}

const STEALTH_INIT = `
(() => {
  try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) } catch {}
  if (!window.chrome) {
    window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} }
  }
  try {
    Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr', 'en-US', 'en'] })
  } catch {}
  try { delete window.__pwInitScripts } catch {}
})()
`

let sharedContext: BrowserContext | null = null

function profileDir(): string {
  return join(app.getPath('userData'), 'webscrape-browser-profile')
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function exponentialBackoffMs(attempt: number, base: number, cap: number): number {
  const exp = Math.min(cap, base * Math.pow(2, Math.max(0, attempt - 1)))
  return Math.floor(Math.random() * (exp + 1))
}

let activeProxyRaw: string | null = null

export async function getScrapeContext(
  headless = true,
  proxy?: ProxyConfig | null
): Promise<BrowserContext> {
  const desiredProxy = proxy === undefined ? nextProxy() : proxy
  const desiredRaw = desiredProxy?.raw ?? null

  // Recréer le contexte si le proxy change (Playwright ne permet pas de switcher à chaud).
  if (sharedContext && activeProxyRaw !== desiredRaw) {
    try {
      await sharedContext.close()
    } catch {
      // ignore
    }
    sharedContext = null
  }

  if (sharedContext) {
    try {
      void sharedContext.pages()
      return sharedContext
    } catch {
      sharedContext = null
    }
  }

  const common: Parameters<typeof chromium.launchPersistentContext>[1] = {
    headless,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    },
    args: ['--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--no-first-run']
  }

  if (desiredProxy) {
    common.proxy = toPlaywrightProxy(desiredProxy)
  }

  try {
    sharedContext = await chromium.launchPersistentContext(profileDir(), {
      ...common,
      channel: 'chrome'
    })
  } catch {
    sharedContext = await chromium.launchPersistentContext(profileDir(), {
      ...common,
      args: [...(common.args as string[]), '--no-sandbox']
    })
  }
  activeProxyRaw = desiredRaw
  await sharedContext.addInitScript(STEALTH_INIT)
  return sharedContext
}

export async function closeWebscrapeBrowser(): Promise<void> {
  try {
    await sharedContext?.close()
  } catch {
    // ignore
  }
  sharedContext = null
}

export async function withPage<T>(
  headless: boolean,
  fn: (page: Page) => Promise<T>,
  /** Si true, tire un nouveau proxy (rotation) avant d’ouvrir le contexte. */
  rotateProxy = false
): Promise<T> {
  const proxy = rotateProxy ? nextProxy() : undefined
  const ctx = await getScrapeContext(headless, proxy === null ? null : proxy)
  const page = await ctx.newPage()
  try {
    return await fn(page)
  } finally {
    try {
      await page.close()
    } catch {
      // ignore
    }
  }
}

export async function withRetries<T>(
  label: string,
  options: ScrapeAttemptOptions,
  run: (attempt: number) => Promise<T>
): Promise<T> {
  const maxRetries = Math.max(1, options.maxRetries ?? 3)
  const base = options.baseDelayMs ?? 1_500
  const cap = options.maxDelayMs ?? 20_000
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await run(attempt)
    } catch (err) {
      lastErr = err
      if (attempt >= maxRetries) break
      // Force rotation proxy au prochain essai
      try {
        await closeWebscrapeBrowser()
      } catch {
        // ignore
      }
      const delay = exponentialBackoffMs(attempt, base, cap)
      await sleep(delay)
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`${label}: échec après ${maxRetries} essai(s)`)
}

export function baseAccommodation(
  source: string,
  partial: {
    sourceId: string
    title: string
    url: string
    totalPrice?: number
    nightlyPrice?: number
    currency?: string
    latitude?: number
    longitude?: number
    city?: string
    rating?: number
    reviewCount?: number
    images?: string[]
    bedrooms?: number
    guests?: number
    country?: string
  },
  params: SearchParams
): Accommodation {
  const hasTotal = typeof partial.totalPrice === 'number' && partial.totalPrice > 0
  const hasNightly = typeof partial.nightlyPrice === 'number' && partial.nightlyPrice > 0
  return {
    source,
    sourceId: partial.sourceId,
    title: partial.title,
    url: partial.url,
    latitude: partial.latitude,
    longitude: partial.longitude,
    // Ni ville ni pays inventés. Écrire `city: params.destination` faisait dire
    // « Val Thorens » à une annonce que la source avait trouvée ailleurs, et
    // « FR » à un logement dont personne n'avait vérifié le pays : c'est
    // exactement ce qui rendait un résultat hors zone indiscernable d'un bon.
    city: partial.city,
    country: partial.country,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    guests: partial.guests ?? params.adults,
    bedrooms: partial.bedrooms,
    nightlyPrice: partial.nightlyPrice,
    totalPrice: partial.totalPrice,
    currency: partial.currency ?? 'EUR',
    rating: partial.rating,
    reviewCount: partial.reviewCount,
    images: partial.images,
    availabilityStatus: 'unknown',
    priceConfidence: hasTotal ? 'total_confirmed' : hasNightly ? 'partial' : 'unknown',
    retrievedAt: nowIso()
  }
}

/** Parse un prix FR/EN typique : « 1 234 € », « €123 », « 123,50 ». */
export function parsePrice(text: string | null | undefined): number | undefined {
  if (!text) return undefined
  const m = text.match(/\d[\d\u00a0\u202f .,]*\d|\d/)
  if (!m) return undefined
  let token = m[0].replace(/[\u00a0\u202f ]/g, '')
  const lastComma = token.lastIndexOf(',')
  const lastDot = token.lastIndexOf('.')
  if (lastComma > lastDot) token = token.replace(/\./g, '').replace(',', '.')
  else token = token.replace(/,/g, '')
  const n = Number(token)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

export async function scrollPage(page: Page, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => window.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' }))
    await sleep(800 + Math.random() * 400)
  }
}
