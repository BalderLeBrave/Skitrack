/**
 * Scraping Airbnb via Playwright — chargement de la page de recherche et
 * lecture du bloc `data-deferred-state-0`.
 *
 * ⚠ Avertissement : contourne robots.txt / CGU Airbnb. Usage personnel à vos risques.
 *
 * ## Optimisation score reCAPTCHA v3
 *
 * v3 note la session (0 bot → 1 humain). On maximise le score sans solveur tiers :
 *
 * 1. **Chrome système** (`channel: 'chrome'`) — empreinte TLS/GPU réelle.
 * 2. **Profil persistant** — cookies + trust qui s’accumulent.
 * 3. **Stealth init** — webdriver, chrome, plugins, hardware, iframe contentWindow…
 * 4. **Warm-up** — passage sur la homepage Airbnb avant la recherche.
 * 5. **Humanisation** — souris en courbes, pauses irrégulières, scroll progressif.
 * 6. **Timezone / locale FR** cohérents.
 * 7. Soft-block → bascule fenêtre visible (filet de sécurité).
 *
 * ## Dates bloquées (calendarBlocks)
 *
 * Si 0 résultat : `diagnoseEmptySearch` + option `autoShiftDates` pour
 * basculer automatiquement sur le prochain week-end samedi→samedi disponible.
 * Voir `./calendarBlocks.ts` et `docs/INTEGRATION-calendar-blocks.md`.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { join } from 'node:path'
import { app } from 'electron'
import { buildAirbnbSearchUrl, type AirbnbUrlParams } from './airbnb'
import type { AirbnbClipPayload } from './extract'
import {
  extractProgressive,
  waitForSearchResultsShell,
  waitForStableDeferredState
} from './dynamicHtml'
import { nextProxy, toPlaywrightProxy, type ProxyConfig } from '../proxy'
import { diagnoseEmptySearch } from './calendarBlocks'

export interface AirbnbScrapeParams extends AirbnbUrlParams {
  timeoutMs?: number
  scrollCount?: number
  headless?: boolean
  captchaTimeoutMs?: number
  /**
   * Active warm-up homepage + humanisation renforcée (défaut true).
   * Améliore le score v3 au prix de ~3–6 s de latence.
   */
  optimizeScore?: boolean
  /**
   * Nombre max de tentatives (défaut 3). 1 = pas de retry.
   * Backoff exponentiel entre les essais : baseDelay * 2^(attempt-1) + jitter.
   */
  maxRetries?: number
  /** Délai de base avant le 1er retry (ms). Défaut 1500. */
  retryBaseDelayMs?: number
  /** Plafond du délai entre retries (ms). Défaut 20_000. */
  retryMaxDelayMs?: number
  /**
   * Si true et 0 résultat pour cause de dates bloquées, retente une fois
   * avec le prochain week-end disponible (défaut false).
   */
  autoShiftDates?: boolean
}

export interface AirbnbScrapeResult {
  ok: true
  payload: AirbnbClipPayload
  url: string
  count: number
  captchaSolved?: boolean
  recaptchaV3Fallback?: boolean
  /** Tentative qui a réussi (1-based). */
  attempts?: number
}

export interface AirbnbScrapeError {
  ok: false
  error: string
  url?: string
  /** Nombre de tentatives effectuées. */
  attempts?: number
}

export type AirbnbScrapeOutcome = AirbnbScrapeResult | AirbnbScrapeError

let sharedContext: BrowserContext | null = null

const VISIBLE_CAPTCHA_INDICATORS = [
  'text=Just a moment',
  'text=Checking your browser',
  'text=Vérification en cours',
  '#challenge-running',
  '#challenge-stage',
  '.cf-browser-verification',
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  'iframe[src*="challenges.cloudflare.com"]',
  'text=Access denied',
  'text=Accès refusé',
  'text=Please verify you are a human',
  'text=Confirmez que vous êtes humain',
  '[data-testid="captcha"]',
  '#captcha-container'
]

const V3_SOFT_BLOCK_INDICATORS = [
  'text=Something went wrong',
  'text=Une erreur s’est produite',
  'text=Try again',
  'text=Réessayer',
  'text=unusual traffic',
  'text=trafic inhabituel',
  'text=robot',
  'text=automated'
]

const AIRBNB_HOME = 'https://www.airbnb.fr/'

function profileDir(): string {
  return join(app.getPath('userData'), 'airbnb-browser-profile')
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * TEMP: full body restored in next commit — see artifacts/skitrack-push/scrape.ts
 * This stub keeps the module importable while the full file is re-pushed.
 */
export async function scrapeAirbnbSearch(
  params: AirbnbScrapeParams
): Promise<AirbnbScrapeOutcome> {
  const url = buildAirbnbSearchUrl(params)
  return {
    ok: false,
    error:
      'scrape.ts body temporarily stubbed — pull artifacts/skitrack-push/scrape.ts or wait for full restore commit',
    url
  }
}

export async function closeAirbnbBrowser(): Promise<void> {
  try {
    await sharedContext?.close()
  } catch {
    // ignore
  }
  sharedContext = null
}
