/**
 * Socle commun des scrapers web (Playwright + Cheerio + backoff).
 *
 * ⚠ Contourne robots.txt / CGU des plateformes. Usage personnel à vos risques.
 * Préférer les API officielles (Booking Demand, Expedia Rapid, LiteAPI) quand
 * des clés sont configurées : ces scrapers sont un repli, pas le chemin nominal.
 */

import { chromium, type BrowserContext, type Page } from 'playwright'
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
  await blockHeavyResources(sharedContext)
  return sharedContext
}

/**
 * Images / polices / média / analytics : le parseur lit des URL et du JSON,
 * pas les pixels. Mapbox et les tuiles n'entrent dans aucun critère.
 * Les XHR métier (search, quote, Apollo) passent.
 */
export async function blockHeavyResources(context: BrowserContext): Promise<void> {
  await context.route(
    (url) => {
      const href = url.toString()
      if (
        /\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|m4a|avi)(?:\?|$)/i.test(
          href
        )
      ) {
        return true
      }
      return /google-analytics|googletagmanager|doubleclick|facebook\.net|hotjar|mapbox|tiles\.openstreetmap|clarity\.ms|scorecardresearch/i.test(
        href
      )
    },
    (route) => route.abort()
  )
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
    weeklyPrice?: number
    currency?: string
    latitude?: number
    longitude?: number
    city?: string
    rating?: number
    reviewCount?: number
    images?: string[]
    bedrooms?: number
    /** Nombre de lits annoncé — « 6 lits (4 simples, 2 doubles) » chez Booking. */
    beds?: number
    /** Pièces, quand la source compte ainsi — voir `Accommodation.rooms`. */
    rooms?: number
    /** Surface habitable en m², telle que la source l'annonce. */
    areaSqm?: number
    guests?: number
    amenities?: string[]
    country?: string
    searchPageIndex?: number
    searchRank?: number
    propertyType?: string
  },
  params: SearchParams
): Accommodation {
  const hasTotal = typeof partial.totalPrice === 'number' && partial.totalPrice > 0
  const hasNightly = typeof partial.nightlyPrice === 'number' && partial.nightlyPrice > 0
  const hasWeekly = typeof partial.weeklyPrice === 'number' && partial.weeklyPrice > 0
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
    // Ce que l'extracteur a lu sur la carte, ou rien : le repli sur
    // `params.adults` renvoyait la demande en guise de capacite annoncee.
    guests: partial.guests,
    bedrooms: partial.bedrooms,
    // Recopié comme le reste : le champ existait au modèle pivot et n'était
    // relayé par aucun connecteur, si bien qu'un extracteur qui le lisait le
    // voyait disparaître ici sans un mot.
    beds: partial.beds,
    rooms: partial.rooms,
    areaSqm: partial.areaSqm,
    nightlyPrice: partial.nightlyPrice,
    weeklyPrice: partial.weeklyPrice,
    totalPrice: partial.totalPrice,
    currency: partial.currency ?? 'EUR',
    rating: partial.rating,
    reviewCount: partial.reviewCount,
    amenities: partial.amenities,
    images: partial.images,
    propertyType: partial.propertyType,
    searchPageIndex: partial.searchPageIndex,
    searchRank: partial.searchRank,
    availabilityStatus: hasTotal ? 'available' : 'unknown',
    priceConfidence: hasTotal ? 'total_confirmed' : hasNightly || hasWeekly ? 'partial' : 'unknown',
    retrievedAt: nowIso()
  }
}

/**
 * URL de photo publiée, rendue absolue. Les tuiles Gîtes (et d'autres SERP)
 * portent un chemin `/sites/default/files/…` : collé tel quel dans la
 * vignette, il pointe vers l'app et la carte s'affiche sans image.
 *
 * Pictos, SVG de thème et pixels lazysizes ne sont pas des photos de logement.
 */
export function listingPhotoUrl(
  raw: string | undefined,
  baseUrl?: string
): string | undefined {
  if (!raw) return undefined
  const first = raw.split(',')[0]?.trim().split(/\s+/)[0]?.replace(/&/gi, '&')
  if (!first || /^(data:|blob:)/i.test(first)) return undefined
  if (
    /placeholder|blank\.gif|spacer|1x1|pixel|\.svg(?:$|\?)|\/themes\/|pictos|favicon|ajax-loader|sprite|\.html?(?:$|\?)|\/search[/?]/i.test(
      first
    )
  ) {
    return undefined
  }
  const base =
    baseUrl ||
    (/^\/sites\/default\/files\//i.test(first)
      ? 'https://www.gites-de-france.com/'
      : /^\/photos\/|^https?:\/\/widget-fngf\.itea\.fr/i.test(first)
        ? 'https://widget-fngf.itea.fr/'
        : undefined)
  try {
    const abs = new URL(first, base).href
    return /^https?:\/\//i.test(abs) ? abs : undefined
  } catch {
    return undefined
  }
}

/**
 * Photo d'une tuile Gîtes, lue dans le HTML (src, srcset lazy, innerHTML).
 *
 * Dump `gites-discovery/search-d2a-0613.html` : le swiper pose `data-src` /
 * `data-srcset` tant que la slide n'est pas chargée, et `?itok=` fait partie
 * de l'URL Drupal. On ne fabrique pas le chemin.
 */
export function gitesPhotoFromTileHtml(html: string, baseUrl?: string): string | undefined {
  if (!html) return undefined
  const candidates: string[] = []
  const attrRe =
    /\s(?:src|data-src|data-lazy-src|data-original|data-bg|srcset|data-srcset)=["']([^"']+)["']/gi
  let attrHit: RegExpExecArray | null
  while ((attrHit = attrRe.exec(html)) !== null) {
    const raw = attrHit[1]
    if (raw) candidates.push(raw)
  }
  const bg = html.match(/url\(["']?([^"')]+)["']?\)/i)?.[1]
  if (bg) candidates.push(bg)
  const fileRe = /\/sites\/default\/files\/[^"'\s>]+\.(?:jpe?g|png|webp)(?:\?[^"'\s>]*)?/gi
  let fileHit: RegExpExecArray | null
  while ((fileHit = fileRe.exec(html)) !== null) candidates.push(fileHit[0])
  const iteaRe = /https?:\/\/widget-fngf\.itea\.fr\/photos\/[^"'\s>]+\.(?:jpe?g|png|webp)/gi
  while ((fileHit = iteaRe.exec(html)) !== null) candidates.push(fileHit[0])
  const decoded = candidates.map((u) => u.replace(/&/gi, '&'))
  const preferred = decoded.find((u) => /\/sites\/default\/files|itea\.fr\/photos/i.test(u))
  return listingPhotoUrl(preferred || decoded[0], baseUrl)
}

const GITES_SITE_ORIGIN = 'https://www.gites-de-france.com'

function stripHtmlText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function gitesCodeIn(url: string): string | undefined {
  const m = url.match(/(\d{2}g\d{3,})/i)
  return m ? m[1].toUpperCase() : undefined
}

function positiveInt(m: RegExpMatchArray | null): number | undefined {
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Tuile SERP dump-lue : photo Drupal, capacité, typologie. Pas un devis. */
export type GitesSearchHtmlTile = {
  code: string
  url: string
  title?: string
  image?: string
  guests?: number
  bedrooms?: number
  priceText?: string
  propertyType?: string
}

/**
 * Tuiles `.js-search-tile` d'une SERP Gîtes, lues dans le HTML.
 *
 * Dump `gites-discovery/search-d2a-0613.html` : 20 tuiles, chacune avec
 * `/sites/default/files/…jpg?itok=` + « N chambres N personnes ».
 * `page.evaluate` peut renvoyer `currentSrc` = l'URL HTML de la recherche
 * (swiper lazy) : on relit le HTML ici, hors du navigateur.
 */
export function gitesTilesFromSearchHtml(html: string): GitesSearchHtmlTile[] {
  if (!html) return []
  const blocks =
    html.match(
      /<div class="[^"]*js-search-tile[^"]*"[\s\S]*?(?=<div class="[^"]*js-search-tile|$)/gi
    ) ?? []
  const out: GitesSearchHtmlTile[] = []
  const seen = new Set<string>()
  for (const chunk of blocks) {
    const href =
      chunk.match(/href="(\/fr\/[^"]*\d{2}g\d{3,}[^"]*)"/i)?.[1] ??
      chunk.match(/href="(https?:\/\/www\.gites-de-france\.com\/fr\/[^"]*\d{2}g\d{3,}[^"]*)"/i)?.[1]
    if (!href) continue
    const abs = href.replace(/&/gi, '&')
    const url = abs.startsWith('http') ? abs : `${GITES_SITE_ORIGIN}${abs}`
    const code = gitesCodeIn(url)
    if (!code || seen.has(code)) continue
    seen.add(code)
    const propertyType =
      chunk
        .match(/g2f-accommodationTile-text-type[^>]*>([\s\S]*?)<\//i)?.[1]
        ?.replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim() || undefined
    const title =
      chunk.match(/title="([^"]+)"[^>]*class="[^"]*g2f-accommodationTile-image/i)?.[1] ||
      chunk
        .match(/g2f-accommodationTile-link[^>]*>([\s\S]*?)<\//i)?.[1]
        ?.replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim() ||
      undefined
    const capHtml =
      chunk.match(
        /g2f-accommodationTile-text-capacity[\s\S]*?(?=g2f-accommodationTile-text-2cols|g2f-accommodationTile-text-price|$)/i
      )?.[0] ?? chunk
    const cap = stripHtmlText(capHtml)
    const guests = positiveInt(/(\d+)\s*(?:personnes?|voyageurs?)/i.exec(cap))
    const bedrooms = positiveInt(/(\d+)\s*chambres?/i.exec(cap))
    const priceHtml =
      chunk.match(/g2f-accommodationTile-text-price[\s\S]{0,500}/i)?.[0] ?? ''
    const priceText = stripHtmlText(priceHtml) || undefined
    out.push({
      code,
      url,
      title,
      propertyType,
      guests,
      bedrooms,
      priceText,
      image: gitesPhotoFromTileHtml(chunk, url)
    })
  }
  return out
}

function photoLooksPublished(url: string | undefined): boolean {
  if (!url) return false
  return /\/sites\/default\/files|itea\.fr\/photos|\.(jpe?g|png|webp|avif)(?:$|\?)/i.test(url)
}

/**
 * Complète (ou remplace) les cartes Playwright par les champs lus dans le HTML.
 * Photo Drupal prioritaire. Capacité / chambres si l'évaluateur les a laissées nulles.
 */
export function mergeGitesCardsFromHtml<
  T extends {
    url: string
    sourceId?: string
    title?: string
    image?: string
    guests?: number
    bedrooms?: number
    priceText?: string
    propertyType?: string
  }
>(cards: T[], html: string): T[] {
  const tiles = gitesTilesFromSearchHtml(html)
  if (tiles.length === 0) return cards
  const byCode = new Map(tiles.map((t) => [t.code, t]))
  const seen = new Set<string>()
  const merged = cards.map((c) => {
    const code = gitesCodeIn(c.url)
    if (code) seen.add(code)
    const t = code ? byCode.get(code) : undefined
    if (!t) return c
    const keepPhoto = photoLooksPublished(listingPhotoUrl(c.image, c.url))
    return {
      ...c,
      image: keepPhoto ? c.image : t.image ?? c.image,
      guests: c.guests ?? t.guests,
      bedrooms: c.bedrooms ?? t.bedrooms,
      propertyType: c.propertyType || t.propertyType,
      priceText: c.priceText || t.priceText,
      title: c.title || t.title || c.title
    }
  })
  for (const t of tiles) {
    if (seen.has(t.code) || !t.title || !t.url) continue
    merged.push({
      sourceId: t.url.replace(/\/$/, '').split('/').pop()?.split('?')[0] || t.code,
      title: t.title,
      url: t.url,
      image: t.image,
      guests: t.guests,
      bedrooms: t.bedrooms,
      priceText: t.priceText,
      propertyType: t.propertyType
    } as T)
  }
  return merged
}

/** Parse un prix FR/EN typique : « 1 234 € », « €123 », « 123,50 ». */
export function parsePrice(text: string | null | undefined): number | undefined {
  if (!text) return undefined
  const m = text.match(/\d[\d\u00a0\u202f\u2009 .,]*\d|\d/)
  if (!m) return undefined
  let token = m[0].replace(/[\u00a0\u202f\u2009 ]/g, '')
  const lastComma = token.lastIndexOf(',')
  const lastDot = token.lastIndexOf('.')
  if (lastComma > lastDot) token = token.replace(/\./g, '').replace(',', '.')
  else token = token.replace(/,/g, '')
  const n = Number(token)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

/**
 * CozyCozy publie « À partir de N €/nuit » — un tarif **par nuit**, pas le
 * séjour. Dump 2026-09-01, cartes catalogue. Le ranger en `totalPrice`
 * faisait passer 89 €/nuit pour 89 € la semaine.
 */
export function looksNightlyPriceText(text: string | null | undefined): boolean {
  if (!text) return false
  return /\/\s*nuit|\bpar nuit\b|\/\s*night|\bper night\b/i.test(text)
}

/** Dump 2026-09-02 SERP datée : « 6692 € pour 7 nuits » = total du séjour. */
export function looksStayPriceText(text: string | null | undefined): boolean {
  if (!text) return false
  return /pour\s+\d+\s+nuits?/i.test(text)
}

/** Dump 2026-09-01 tuile Gîtes : « À partir de N € par semaine » = catalogue. */
export function looksWeeklyFromPriceText(text: string | null | undefined): boolean {
  if (!text) return false
  return /(?:à|a)\s+partir\s+de/i.test(text) && /(?:par|\/)\s*semaine/i.test(text)
}

export function webscrapePriceFields(
  source: string,
  priceText: string | undefined
): { totalPrice?: number; nightlyPrice?: number; weeklyPrice?: number } {
  const price = parsePrice(priceText)
  if (price == null) return {}
  if (looksStayPriceText(priceText)) return { totalPrice: price }
  const weekly =
    source === 'gites-web' || source === 'gites-de-france' || looksWeeklyFromPriceText(priceText)
  if (weekly) return { weeklyPrice: price }
  const nightly =
    source === 'cozycozy-web' || source === 'cozycozy' || looksNightlyPriceText(priceText)
  return nightly ? { nightlyPrice: price } : { totalPrice: price }
}

export async function scrollPage(page: Page, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => window.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' }))
    await sleep(800 + Math.random() * 400)
  }
}

/**
 * Défile jusqu'à ce que la page (ou le conteneur des cartes) cesse de grandir.
 *
 * Deux défilements fixes ne suffisaient pas : Booking charge ses cartes au fur
 * et à mesure, et une page arrêtée au deuxième écran rendait moins de vingt-cinq
 * cartes. `collectBookingPages` y lisait « page plus courte qu'une page
 * pleine », en concluait que c'était la dernière et **arrêtait le relevé**.
 *
 * On scrolle le conteneur overflow qui porte les cartes (spec : ne pas scroller
 * le body si les cards sont dans un div interne). Sélecteurs = ceux des
 * extracteurs déjà dans ce dépôt. Idle 2 cycles avant d'arrêter.
 */
export async function scrollToEnd(page: Page, maxSteps = 12): Promise<void> {
  let previous = -1
  let idle = 0
  for (let step = 0; step < maxSteps; step++) {
    const height = await page.evaluate(() => {
      const sels = [
        '[data-testid="card-container"]',
        '[data-testid="property-card"]',
        '.js-search-tile',
        '[itemprop="itemListElement"]'
      ]
      for (const sel of sels) {
        const card = document.querySelector(sel)
        if (!card) continue
        let p: HTMLElement | null = card.parentElement
        while (p && p !== document.documentElement) {
          const st = window.getComputedStyle(p)
          const oy = st.overflowY
          if (
            (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
            p.scrollHeight > p.clientHeight + 80
          ) {
            p.scrollTop += Math.max(p.clientHeight * 0.9, 400)
            return p.scrollHeight
          }
          p = p.parentElement
        }
      }
      window.scrollBy({ top: window.innerHeight * 0.85 })
      return document.body.scrollHeight
    })
    await sleep(700 + Math.random() * 400)
    if (height === previous) {
      idle++
      if (idle >= 2) return
    } else {
      idle = 0
      previous = height
    }
  }
}

/**
 * La page a-t-elle refusé le relevé ?
 *
 * « Aucune carte extraite » recouvrait deux causes opposées — des sélecteurs
 * périmés, et un blocage anti-robot — sous un seul message qui n'aidait à
 * choisir ni l'une ni l'autre. On lit ce que la page affiche : elle le dit en
 * toutes lettres quand elle bloque.
 *
 * Phrases relevées le 2026-09-01 (dumps, pas inventées) :
 * - VRBO 429, title + body : « Bot or Not? Show us your human side... »
 * - Abritel 429 : « Robot ou pas robot ? »
 * - Gîtes 2ᵉ visite : Cloudflare « Attention Required! » / « you have been blocked »
 *
 * L'ancienne regex (`are you a robot`) ne matchait aucune des trois.
 */
export function pageLooksBlocked(text: string): boolean {
  return /captcha|are you a robot|access denied|unusual traffic|vérification de sécurité|bot or not|robot ou pas robot|attention required|you have been blocked|show us your human side/i.test(
    text
  )
}

/**
 * Marqueur Gîtes de France d'une SERP sans cartes.
 *
 * Dump 2026-09-01 (`gites_p1.html`, `gites_dest.html`) : la classe
 * `.g2f-searchResult-noResults` est posée avec le texte
 * « Oups ! Vous devez affiner votre recherche de séjour en indiquant au moins
 * une destination. » — y compris quand `search[value]` ou `destination=` est
 * dans l'URL. Ce n'est pas un sélecteur de carte mort, c'est une recherche
 * qui n'a pas été exécutée (`entity_id` vide).
 *
 * Sans dump d'une SERP de résultats, on ne distingue pas un stock vraiment
 * vide d'une destination manquante autrement que par cette phrase.
 */
export function gitesSearchEmptyKind(
  html: string
): 'destination_missing' | 'no_results' | null {
  if (!html.includes('g2f-searchResult-noResults')) return null
  if (
    /vous devez affiner votre recherche de séjour en indiquant au moins une destination/i.test(
      html
    )
  ) {
    return 'destination_missing'
  }
  return 'no_results'
}

/**
 * CozyCozy — dump Playwright 2026-09-01, Les 2 Alpes.
 *
 * HTTP 200, Angular `joli-root` monté, `router-outlet` vide, 0 XHR search,
 * 0 carte. Ce n'est pas un challenge, ce n'est pas un `.gite-card` mort.
 * Appelé seulement quand l'extracteur a déjà rendu 0 carte.
 */
export function cozycozySearchEmptyKind(html: string): 'spa_unlaunched' | null {
  if (!html.toLowerCase().includes('joli-root')) return null
  if (/resultitemprice|joli-result|application\/ld\+json|hoj_seo_card/i.test(html)) return null
  if (html.includes('router-outlet')) return 'spa_unlaunched'
  return null
}

export async function looksBlocked(page: Page): Promise<boolean> {
  try {
    const text = await page.evaluate(
      () => `${document.title}\n${document.body?.innerText ?? ''}`.slice(0, 8_000)
    )
    return pageLooksBlocked(text)
  } catch {
    // Page injoignable : on ne conclut pas au blocage sur une absence de preuve.
    return false
  }
}
