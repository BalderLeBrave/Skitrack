/**
 * Booking via Bright Data Scraping Browser (CDP).
 *
 * Le sample utilisateur (puppeteer-core + formulaire NYC J+1) est adapté :
 * - Playwright `connectOverCDP` (déjà dans le dépôt, pas de puppeteer-core)
 * - URL datée `bookingSearchUrl` (station, check-in/out, adultes) au lieu du
 *   calendrier « demain »
 * - extractBookingCards (prix, photo, GPS Apollo, chambres) au lieu du
 *   $$eval minimal
 * - walk 15 pages / offset déjà testé
 *
 * Le WS complet (customer + zone + mot de passe) va au coffre
 * `brightdata_browser` ou à `BRIGHTDATA_BROWSER_WS` / `BOOKING_BROWSER_WS`.
 * Jamais dans git.
 */

import { chromium, type Page } from 'playwright'
import { SEARCH_WALK } from '@shared/searchWalk'

export function resolveBrightDataBrowserWs(
  vault: Record<string, string | undefined> = {},
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const raw =
    vault.brightdata_browser ??
    env.BRIGHTDATA_BROWSER_WS ??
    env.BOOKING_BROWSER_WS
  const ws = typeof raw === 'string' ? raw.trim() : ''
  if (!ws) return undefined
  if (!/^wss:\/\//i.test(ws)) return undefined
  return ws
}

export function isBrightDataAuthError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err)
  return /401|403|407|unauthorized|authentication|invalid.*(password|token|key)|login failed/i.test(
    m
  )
}

const POPUP_SELECTORS = [
  '[aria-label="Dismiss sign-in info."]',
  '[aria-label="Ignorer les informations de connexion."]',
  '[aria-label="Dismiss sign-in info"]',
  'button[aria-label="Close"]',
  'button[aria-label="Fermer"]'
]

/** Sample Bright Data : fermer le bandeau compte. Timeout court (pas 25 s / page). */
export async function closeBookingPopup(page: Page): Promise<boolean> {
  for (const sel of POPUP_SELECTORS) {
    try {
      const btn = await page.waitForSelector(sel, { timeout: 2_500, state: 'visible' })
      if (!btn) continue
      await btn.click({ timeout: 1_500 })
      return true
    } catch {
      /* sélecteur absent */
    }
  }
  return false
}

export async function withBrightDataPage<T>(
  ws: string,
  fn: (page: Page) => Promise<T>
): Promise<T> {
  const browser = await chromium.connectOverCDP(ws, { timeout: 60_000 })
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext())
    const page = context.pages()[0] ?? (await context.newPage())
    page.setDefaultTimeout(60_000)
    return await fn(page)
  } finally {
    try {
      await browser.close()
    } catch {
      /* session distante déjà coupée */
    }
  }
}

export const BRIGHTDATA_BOOKING_HOME = 'https://www.booking.com/'
export const BRIGHTDATA_MAX_PAGES = SEARCH_WALK.maxPages
