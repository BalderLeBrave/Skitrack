/**
 * Parsing de HTML dynamique (SPA Airbnb).
 *
 * Airbnb injecte et met à jour `data-deferred-state-*` après le premier paint,
 * puis à chaque scroll / page de résultats. Ce module :
 *
 * 1. Attend que le DOM se stabilise (nœud présent + taille stable).
 * 2. Re-parse après chaque action (scroll) et fusionne les annonces par id.
 * 3. Utilise Cheerio sur des snapshots HTML successifs.
 */

import type { Page } from 'playwright'
import {
  extractAirbnbFromHtml,
  type CheerioAirbnbMeta
} from './cheerioExtract'
import {
  extractListingsFromDeferredState,
  type AirbnbClipListing,
  type AirbnbClipPayload
} from './extract'
import { SEARCH_WALK } from '@shared/searchWalk'

export interface DynamicWaitOptions {
  /** Sélecteur principal. Défaut #data-deferred-state-0 */
  selector?: string
  /** Timeout global ms. Défaut 45s */
  timeoutMs?: number
  /** Fenêtre de stabilité (pas de changement de longueur du JSON). Défaut 600ms */
  stableMs?: number
}

/**
 * Attend un contenu dynamique utilisable :
 * - le nœud existe
 * - son textContent a une longueur stable pendant `stableMs`
 * (évite de parser un JSON encore en cours d’injection).
 */
export async function waitForStableDeferredState(
  page: Page,
  options: DynamicWaitOptions = {}
): Promise<void> {
  const selector = options.selector ?? '#data-deferred-state-0'
  const timeoutMs = options.timeoutMs ?? 45_000
  const stableMs = options.stableMs ?? 600

  await page.waitForFunction(
    ({ sel, stable }) => {
      const el = document.querySelector(sel)
      if (!el || !el.textContent || el.textContent.length < 80) return false

      const len = el.textContent.length
      const key = '__skitrackDeferredLen'
      const tsKey = '__skitrackDeferredTs'
      const w = window as unknown as Record<string, number>
      const prev = w[key]
      const prevTs = w[tsKey]
      const now = Date.now()

      if (prev !== len) {
        w[key] = len
        w[tsKey] = now
        return false
      }
      return prevTs != null && now - prevTs >= stable
    },
    { sel: selector, stable: stableMs },
    { timeout: timeoutMs }
  )
}

/**
 * Attend soit le sélecteur, soit une condition « résultats visibles »
 * (cartes / listes), utile quand l’id du script change.
 */
export async function waitForSearchResultsShell(
  page: Page,
  timeoutMs: number
): Promise<'deferred' | 'cards' | 'timeout'> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const kind = await page.evaluate(() => {
        if (document.querySelector('#data-deferred-state-0')) return 'deferred'
        if (document.querySelector('[data-testid="card-container"], [itemprop="itemListElement"], a[href*="/rooms/"]'))
          return 'cards'
        return null
      })
      if (kind === 'deferred') {
        try {
          await waitForStableDeferredState(page, {
            timeoutMs: Math.min(12_000, deadline - Date.now())
          })
        } catch {
          // nœud présent mais pas encore stable : on accepte quand même
        }
        return 'deferred'
      }
      if (kind === 'cards') return 'cards'
    } catch {
      // navigation
    }
    await page.waitForTimeout(400)
  }
  return 'timeout'
}

function mergeListings(
  a: AirbnbClipListing[],
  b: AirbnbClipListing[]
): AirbnbClipListing[] {
  const map = new Map<string, AirbnbClipListing>()
  for (const item of [...a, ...b]) {
    const prev = map.get(item.id)
    if (!prev) {
      map.set(item.id, item)
      continue
    }
    // Enrichir : garder le prix / image si le nouveau snapshot est plus complet
    map.set(item.id, {
      ...prev,
      ...item,
      priceLabel: item.priceLabel || prev.priceLabel,
      image: item.image || prev.image,
      lat: item.lat ?? prev.lat,
      lon: item.lon ?? prev.lon,
      ratingLabel: item.ratingLabel || prev.ratingLabel
    })
  }
  return [...map.values()]
}

/**
 * Snapshot HTML → Cheerio. En cas d’échec, retourne null (pas d’exception).
 */
export function tryParseHtmlSnapshot(
  html: string,
  meta?: CheerioAirbnbMeta
): AirbnbClipPayload | null {
  try {
    return extractAirbnbFromHtml(html, meta)
  } catch {
    return null
  }
}

export interface ProgressiveExtractOptions {
  meta?: CheerioAirbnbMeta
  /** Scrolls additionnels après le premier snapshot. */
  scrollCount?: number
  /** Pause entre scrolls (ms). */
  scrollPauseMs?: number
}

/**
 * Extraction progressive : parse → scroll → re-parse → fusion par id.
 * Gère le HTML dynamique chargé au fur et à mesure du scroll infini.
 */
export async function extractProgressive(
  page: Page,
  options: ProgressiveExtractOptions = {}
): Promise<AirbnbClipPayload> {
  const scrollCount = options.scrollCount ?? SEARCH_WALK.airbnbMaxScrolls
  const scrollPauseMs = options.scrollPauseMs ?? 1100
  const meta = options.meta

  let merged: AirbnbClipListing[] = []
  let lastMeta: CheerioAirbnbMeta = { ...meta }
  const xhrBuffer: AirbnbClipListing[] = []

  // Live D2A 2026-09-03 : 23 cartes DOM vs Omkar count=270. Le catalogue
  // arrive dans POST /api/v3/StaysSearch ; on le lisait (wait) sans le parser.
  const onResponse = (res: { url: () => string; ok: () => boolean; json: () => Promise<unknown> }): void => {
    if (!/\/api\/v3\/StaysSearch/i.test(res.url()) || !res.ok()) return
    void res
      .json()
      .then((json) => {
        const extra = extractListingsFromDeferredState(json, lastMeta).listings
        if (extra.length) xhrBuffer.push(...extra)
      })
      .catch(() => undefined)
  }
  page.on('response', onResponse)

  const snapshot = async (): Promise<void> => {
    // Laisser un tick au moteur pour flusher le DOM
    await page.waitForTimeout(150)
    const html = await page.content()
    const parsed = tryParseHtmlSnapshot(html, lastMeta)
    if (parsed) {
      merged = mergeListings(merged, parsed.listings)
      lastMeta = {
        checkIn: parsed.checkIn ?? lastMeta.checkIn,
        checkOut: parsed.checkOut ?? lastMeta.checkOut,
        destination: parsed.destination ?? lastMeta.destination
      }
    }
    if (xhrBuffer.length) merged = mergeListings(merged, xhrBuffer)
  }

  try {
    await snapshot()

    let previous = merged.length
    let idle = 0
    for (let i = 0; i < scrollCount; i++) {
      if (merged.length >= SEARCH_WALK.maxListings) break
      await page.evaluate(() => {
        const card = document.querySelector(
          '[data-testid="card-container"], [itemprop="itemListElement"], a[href*="/rooms/"]'
        )
        let p: HTMLElement | null = card?.parentElement ?? null
        while (p && p !== document.documentElement) {
          const st = window.getComputedStyle(p)
          const oy = st.overflowY
          if (
            (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
            p.scrollHeight > p.clientHeight + 80
          ) {
            p.scrollTop += Math.max(p.clientHeight * 0.9, 400)
            return
          }
          p = p.parentElement
        }
        window.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' })
      })

      try {
        await page.waitForResponse(
          (r) => /\/api\/v3\/StaysSearch/i.test(r.url()) && r.ok(),
          { timeout: 3_500 }
        )
      } catch {
        // pas de XHR visible : on continue sur le DOM
      }
      await page.waitForTimeout(Math.min(scrollPauseMs, 500))

      try {
        await waitForStableDeferredState(page, { timeoutMs: 4_000, stableMs: 400 })
      } catch {
        // pas grave
      }

      await snapshot()
      if (merged.length === previous) {
        idle++
        if (idle >= SEARCH_WALK.idleCycles && i >= 2) break
      } else {
        idle = 0
        previous = merged.length
      }
    }
  } finally {
    page.off('response', onResponse)
  }

  if (xhrBuffer.length) merged = mergeListings(merged, xhrBuffer)

  if (merged.length === 0) {
    // Dernière tentative : evaluate direct + cheerio
    const text = await page.evaluate(() => {
      const nodes = document.querySelectorAll('[id^="data-deferred-state"]')
      for (const n of nodes) {
        if (n.textContent && n.textContent.length > 80) return n.textContent
      }
      return document.getElementById('data-deferred-state-0')?.textContent ?? null
    })
    if (text) {
      const { extractFromDeferredStateText } = await import('./extract')
      const payload = extractFromDeferredStateText(text, lastMeta)
      merged = mergeListings(merged, payload.listings)
      lastMeta = {
        checkIn: payload.checkIn ?? lastMeta.checkIn,
        checkOut: payload.checkOut ?? lastMeta.checkOut,
        destination: payload.destination ?? lastMeta.destination
      }
    }
  }

  if (merged.length === 0) {
    throw new Error(
      'Aucune annonce extraite du HTML dynamique. ' +
        'La page n’a peut-être pas fini de charger, ou le score anti-bot est trop bas.'
    )
  }

  return {
    source: 'airbnb',
    destination: lastMeta.destination,
    checkIn: lastMeta.checkIn,
    checkOut: lastMeta.checkOut,
    listings: merged
  }
}
