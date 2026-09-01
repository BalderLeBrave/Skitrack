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
import { trySolveVisibleCaptcha } from '../../captchaBridge'

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
 * Init scripts anti-détection orientés reCAPTCHA v3.
 * Cohérence > exhaustivité : des patches contradictoires baissent le score.
 */
const STEALTH_INIT = `
(() => {
  // --- webdriver ---
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  } catch {}

  // --- chrome runtime minimal ---
  if (!window.chrome) {
    window.chrome = {
      runtime: {
        connect: function() {},
        sendMessage: function() {},
        id: undefined
      },
      loadTimes: function() { return {} },
      csi: function() { return {} },
      app: { isInstalled: false }
    }
  }

  // --- plugins (longueur > 0, structure plausible) ---
  try {
    const makePlugin = (name, filename, description) => {
      const p = { name, filename, description, length: 1 }
      p[0] = { type: 'application/pdf', suffixes: 'pdf', description }
      return p
    }
    const plugins = [
      makePlugin('Chrome PDF Plugin', 'internal-pdf-viewer', 'Portable Document Format'),
      makePlugin('Chrome PDF Viewer', 'mhjfbmdgcfjbbpaeojofohoefgiehjai', ''),
      makePlugin('Native Client', 'internal-nacl-plugin', '')
    ]
    plugins.item = (i) => plugins[i] || null
    plugins.namedItem = (n) => plugins.find(p => p.name === n) || null
    plugins.refresh = () => {}
    Object.defineProperty(navigator, 'plugins', { get: () => plugins })
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => {
        const m = [{ type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' }]
        m.item = (i) => m[i] || null
        m.namedItem = (n) => m.find(x => x.type === n) || null
        return m
      }
    })
  } catch {}

  try {
    Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr', 'en-US', 'en'] })
  } catch {}

  // hardware : valeurs typiques d'un PC portable récent (cohérentes entre elles)
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
  } catch {}
  try {
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
  } catch {}
  try {
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 })
  } catch {}
  try {
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' })
  } catch {}

  // permissions
  const originalQuery = window.navigator.permissions && window.navigator.permissions.query
  if (originalQuery) {
    window.navigator.permissions.query = (parameters) => {
      if (parameters && parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission, onchange: null })
      }
      return originalQuery.call(window.navigator.permissions, parameters)
    }
  }

  // iframe.contentWindow : certains checks v3 passent par là
  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')
    if (desc && desc.get) {
      // laisser le getter natif ; ne pas casser
    }
  } catch {}

  // Retirer traces Playwright injectées
  try {
    delete window.__pwInitScripts
    delete window.__playwright__binding__
  } catch {}
})()
`

async function pageHasVisibleCaptcha(page: Page): Promise<boolean> {
  if (await page.$('#data-deferred-state-0')) return false
  for (const sel of VISIBLE_CAPTCHA_INDICATORS) {
    try {
      if (await page.$(sel)) return true
    } catch {
      // ignore
    }
  }
  try {
    const title = (await page.title()).toLowerCase()
    if (
      /just a moment|attention required|access denied|captcha/.test(title)
    ) {
      return true
    }
  } catch {
    // ignore
  }
  return false
}

async function pageLooksLikeV3SoftBlock(page: Page): Promise<boolean> {
  if (await page.$('#data-deferred-state-0')) return false
  if (await pageHasVisibleCaptcha(page)) return false
  for (const sel of V3_SOFT_BLOCK_INDICATORS) {
    try {
      if (await page.$(sel)) return true
    } catch {
      // ignore
    }
  }
  try {
    const bodyText = await page.evaluate(() => (document.body?.innerText || '').trim().length)
    if (bodyText < 80) return true
  } catch {
    // ignore
  }
  return false
}

async function waitForCaptchaSolved(
  page: Page,
  timeoutMs: number
): Promise<'solved' | 'timeout'> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (page.isClosed()) return 'timeout'
    try {
      if (await page.$('#data-deferred-state-0')) return 'solved'
      if (!(await pageHasVisibleCaptcha(page)) && !(await pageLooksLikeV3SoftBlock(page))) {
        try {
          await page.waitForSelector('#data-deferred-state-0', { timeout: 8_000 })
          return 'solved'
        } catch {
          // continue
        }
      }
    } catch {
      // navigation
    }
    await sleep(800)
  }
  return 'timeout'
}

/** Courbe de souris type humain (pas une ligne droite). */
async function mouseCurve(
  page: Page,
  toX: number,
  toY: number,
  steps = 20
): Promise<void> {
  const pos = await page.evaluate(() => ({ x: 0, y: 0 }))
  // Playwright ne expose pas la position courante de la souris ; on part d’un point plausible.
  let x = 80 + Math.random() * 200
  let y = 100 + Math.random() * 150
  const midX = (x + toX) / 2 + (Math.random() - 0.5) * 120
  const midY = (y + toY) / 2 + (Math.random() - 0.5) * 80
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    // quadratique Bezier
    const bx = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * midX + t * t * toX
    const by = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * midY + t * t * toY
    await page.mouse.move(bx, by)
    await sleep(rand(8, 22))
  }
  void pos
}

/**
 * Interactions courtes qui font monter le score v3 :
 * focus, mouvements, micro-scroll, pause irrégulière.
 */
async function humanize(page: Page, intensity: 'light' | 'full' = 'full'): Promise<void> {
  try {
    await page.bringToFront().catch(() => undefined)
    await mouseCurve(page, rand(200, 500), rand(150, 350), intensity === 'full' ? 24 : 12)
    await sleep(rand(120, 320))
    await mouseCurve(page, rand(400, 900), rand(250, 500), intensity === 'full' ? 18 : 10)
    await sleep(rand(80, 200))

    if (intensity === 'full') {
      // petit scroll puis retour partiel (pattern humain)
      await page.evaluate((dy) => {
        window.scrollBy({ top: dy, behavior: 'smooth' })
      }, rand(120, 280))
      await sleep(rand(350, 700))
      await page.evaluate((dy) => {
        window.scrollBy({ top: -dy, behavior: 'smooth' })
      }, rand(40, 100))
      await sleep(rand(200, 450))
      // hover aléatoire sur un élément cliquable s’il existe
      const box = await page.evaluate(() => {
        const el =
          document.querySelector('a[href], button, [role="button"]') ||
          document.body
        const r = el.getBoundingClientRect()
        return { x: r.x + Math.min(r.width / 2, 80), y: r.y + Math.min(r.height / 2, 20) }
      })
      if (box && box.x > 0 && box.y > 0) {
        await mouseCurve(page, box.x, box.y, 14)
        await sleep(rand(100, 250))
      }
    }
  } catch {
    // page fermée / naviguée
  }
}

/**
 * Warm-up : homepage Airbnb avant la recherche.
 * Construit cookies + historique de navigation dans le profil persistant.
 */
async function warmupAirbnb(page: Page): Promise<void> {
  try {
    await page.goto(AIRBNB_HOME, {
      waitUntil: 'domcontentloaded',
      timeout: 25_000
    })
    await sleep(rand(800, 1500))
    await humanize(page, 'full')
    await sleep(rand(400, 900))
    // un second micro-scroll
    await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'smooth' }))
    await sleep(rand(300, 600))
  } catch {
    // warm-up non bloquant : on continue vers la recherche
  }
}

async function waitForRecaptchaV3IfPresent(page: Page): Promise<void> {
  try {
    const has = await page.evaluate(() => {
      const w = window as unknown as { grecaptcha?: unknown }
      return typeof w.grecaptcha !== 'undefined'
    })
    if (!has) {
      // attendre un peu au cas où le script charge en différé
      await sleep(600)
      return
    }
    await page.evaluate(async () => {
      const w = window as unknown as {
        grecaptcha?: { ready?: (cb: () => void) => void }
      }
      await new Promise<void>((resolve) => {
        if (w.grecaptcha?.ready) w.grecaptcha.ready(() => resolve())
        else resolve()
      })
    })
    // laisser Airbnb consommer le token
    await sleep(rand(1800, 2800))
  } catch {
    // ignore
  }
}

async function launchBrowser(headless: boolean, proxy?: ProxyConfig | null): Promise<Browser> {
  const args = [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-default-browser-check',
    '--no-first-run',
    '--disable-infobars',
    '--disable-background-timer-throttling'
  ]
  const proxyOpt = proxy ? { proxy: toPlaywrightProxy(proxy) } : {}
  try {
    return await chromium.launch({ channel: 'chrome', headless, args, ...proxyOpt })
  } catch {
    return chromium.launch({ headless, args: [...args, '--no-sandbox'], ...proxyOpt })
  }
}

async function openPersistentContext(
  headless: boolean,
  proxy?: ProxyConfig | null
): Promise<BrowserContext> {
  const common: Parameters<typeof chromium.launchPersistentContext>[1] = {
    headless,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 1440, height: 900 },
    screen: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    colorScheme: 'light' as const,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-default-browser-check',
      '--no-first-run'
    ]
  }

  if (proxy) {
    common.proxy = toPlaywrightProxy(proxy)
  }

  try {
    const context = await chromium.launchPersistentContext(profileDir(), {
      ...common,
      channel: 'chrome'
    })
    await context.addInitScript(STEALTH_INIT)
    return context
  } catch {
    const context = await chromium.launchPersistentContext(profileDir(), {
      ...common,
      args: [...((common.args as string[]) || []), '--no-sandbox']
    })
    await context.addInitScript(STEALTH_INIT)
    return context
  }
}

async function getSharedContext(headless: boolean, rotate = false): Promise<BrowserContext> {
  if (sharedContext && !rotate) {
    try {
      void sharedContext.pages()
      return sharedContext
    } catch {
      sharedContext = null
    }
  }
  if (sharedContext && rotate) {
    try {
      await sharedContext.close()
    } catch {
      // ignore
    }
    sharedContext = null
  }
  const proxy = nextProxy()
  sharedContext = await openPersistentContext(headless, proxy)
  return sharedContext
}

export async function closeAirbnbBrowser(): Promise<void> {
  try {
    await sharedContext?.close()
  } catch {
    // ignore
  }
  sharedContext = null
}

async function extractFromPage(
  page: Page,
  params: AirbnbScrapeParams,
  scrollCount: number
): Promise<AirbnbClipPayload> {
  await humanize(page, 'full')
  await waitForRecaptchaV3IfPresent(page)

  // Stabiliser le HTML dynamique avant la première lecture
  try {
    await waitForStableDeferredState(page, { timeoutMs: 15_000, stableMs: 500 })
  } catch {
    // continuer : extractProgressive retentera
  }

  return extractProgressive(page, {
    meta: {
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      destination: params.city
    },
    scrollCount,
    scrollPauseMs: 1200
  })
}

async function openVisibleForChallenge(
  url: string,
  timeoutMs: number
): Promise<{ browser: Browser; page: Page }> {
  const browser = await launchBrowser(false, nextProxy())
  const context = await browser.newContext({
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
    }
  })
  await context.addInitScript(STEALTH_INIT)
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
  return { browser, page }
}


/** Erreurs pour lesquelles un nouvel essai a un sens. */
function isRetryableError(message: string): boolean {
  const m = message.toLowerCase()
  // Ne pas retenter si l’utilisateur n’a pas validé un CAPTCHA (geste humain).
  if (m.includes('captcha non résolu')) return false
  if (m.includes('délai imparti')) return false
  if (m.startsWith('date_shift:')) return true
  return (
    /timeout|timed out|net::|navigation|err_|econnreset|econnrefused|enotfound|socket|network|page fermée|sans résultats|score recaptcha|data-deferred-state|aucune annonce|html dynamique|bloc data-deferred|dates (probablement )?indisponibles/.test(
      m
    )
  )
}

/**
 * Backoff exponentiel avec jitter plein : delay ∈ [0, min(cap, base * 2^(attempt-1))].
 * Le jitter évite les retries synchronisés si plusieurs recherches partent ensemble.
 */
function exponentialBackoffMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)))
  return Math.floor(Math.random() * (exp + 1))
}

/**
 * Corps d’une tentative unique (sans retry). Factorisé pour que
 * `scrapeAirbnbSearch` puisse enchaîner les essais proprement.
 */
async function scrapeAirbnbSearchOnce(params: AirbnbScrapeParams): Promise<AirbnbScrapeOutcome> {
  const url = buildAirbnbSearchUrl(params)
  const timeoutMs = params.timeoutMs ?? 45_000
  const scrollCount = params.scrollCount ?? 2
  // Pour le score v3, le headed est nettement meilleur ; on garde headless par
  // défaut pour l’UX, mais optimizeScore force plus de warm-up / humanisation.
  // Headless par défaut : pas de fenêtre Chrome surprise pendant la recherche.
  // CAPTCHA / soft-block → openVisibleForChallenge (fenêtre ciblée uniquement).
  const preferHeadless = params.headless !== false
  const optimizeScore = params.optimizeScore !== false
  const captchaTimeoutMs = params.captchaTimeoutMs ?? 3 * 60_000

  let page: Page | null = null
  let challengeBrowser: Browser | null = null
  let captchaSolved = false
  let recaptchaV3Fallback = false

  const cleanupPage = async (): Promise<void> => {
    if (page) {
      try {
        await page.close()
      } catch {
        // ignore
      }
      page = null
    }
  }

  try {
    const context = await getSharedContext(preferHeadless)
    page = await context.newPage()

    // 1. Warm-up homepage (cookies + signaux comportementaux)
    if (optimizeScore) {
      await warmupAirbnb(page)
    }

    // 2. Page de recherche
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs
    })
    await sleep(rand(1000, 1800))
    await humanize(page, optimizeScore ? 'full' : 'light')
    await waitForRecaptchaV3IfPresent(page)

    // 3. CAPTCHA visible ?
    if (await pageHasVisibleCaptcha(page)) {
      const stuckUrl = page.url() || url
      await cleanupPage()
      const visible = await openVisibleForChallenge(stuckUrl, timeoutMs)
      challengeBrowser = visible.browser
      page = visible.page
      if ((await waitForCaptchaSolved(page, captchaTimeoutMs)) === 'timeout') {
        const auto = await trySolveVisibleCaptcha(page)
        if (!auto) {
          return {
            ok: false,
            error:
              'CAPTCHA non résolu (3 min) [challenge_unresolved]. Validez le défi dans la fenêtre Chrome, ou renseignez CAPTCHA_API_KEY pour le solveur sidecar, puis relancez.',
            url
          }
        }
        captchaSolved = true
      }
      captchaSolved = true
    } else {
      try {
        const shell = await waitForSearchResultsShell(page, timeoutMs)
        if (shell === 'timeout') throw new Error('timeout waiting for dynamic results')
      } catch {
        const soft = await pageLooksLikeV3SoftBlock(page)
        const visibleCap = await pageHasVisibleCaptcha(page)
        if (soft || visibleCap || !(await page.$('#data-deferred-state-0'))) {
          const stuckUrl = page.url() || url
          await cleanupPage()
          recaptchaV3Fallback = true
          const visible = await openVisibleForChallenge(stuckUrl, timeoutMs)
          challengeBrowser = visible.browser
          page = visible.page
          if ((await waitForCaptchaSolved(page, captchaTimeoutMs)) === 'timeout') {
            const auto = await trySolveVisibleCaptcha(page)
            if (!auto) {
              return {
                ok: false,
                error:
                  'Page sans résultats (souvent score reCAPTCHA v3 trop bas) [challenge_unresolved]. ' +
                  'Fenêtre Chrome ouverte : laissez les annonces apparaître, ou renseignez CAPTCHA_API_KEY, puis relancez.',
                url
              }
            }
            captchaSolved = true
          }
          if (visibleCap) captchaSolved = true
        }
      }
    }

    if (!page || page.isClosed()) {
      return { ok: false, error: 'Page fermée avant extraction.', url }
    }

    await sleep(rand(400, 800))
    const payload = await extractFromPage(page, params, scrollCount)

    if (payload.listings.length === 0) {
      const cin = params.checkIn ?? ''
      const cout = params.checkOut ?? ''
      let dateHint = ''
      try {
        if (cin && cout && page && !page.isClosed()) {
          const diag = await diagnoseEmptySearch(page, cin, cout)
          if (diag.blocked) {
            const sug = diag.suggestion
            dateHint =
              (diag.message ? ` « ${diag.message} ».` : ' Dates probablement indisponibles.') +
              (sug
                ? ` Suggestion : ${sug.checkIn} → ${sug.checkOut}` +
                  (sug.weeksShifted ? ` (+${sug.weeksShifted} sem.)` : '') +
                  '.'
                : '')
            // Auto-shift : une seule fois, signalé via error code préfixe
            if (params.autoShiftDates && sug && !(params as { __shifted?: boolean }).__shifted) {
              return {
                ok: false,
                error: `DATE_SHIFT:${sug.checkIn}:${sug.checkOut}:${dateHint.trim()}`,
                url
              }
            }
          }
        }
      } catch {
        // diagnostic non bloquant
      }
      return {
        ok: false,
        error:
          'Aucune annonce dans les données.' +
          (dateHint || ' Vérifiez les dates ou augmentez les scrolls.'),
        url
      }
    }

    return {
      ok: true,
      payload,
      url,
      count: payload.listings.length,
      captchaSolved: captchaSolved || undefined,
      recaptchaV3Fallback: recaptchaV3Fallback || undefined
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/Timeout|timeout/i.test(message)) {
      return {
        ok: false,
        error:
          'Délai dépassé (reCAPTCHA v3 / anti-bot possible). Relancez : une fenêtre visible s’ouvrira si besoin.',
        url
      }
    }
    if (/net::|Navigation|ERR_/i.test(message)) {
      return { ok: false, error: `Échec de navigation : ${message}`, url }
    }
    return { ok: false, error: message, url }
  } finally {
    await cleanupPage()
    if (challengeBrowser) {
      try {
        await challengeBrowser.close()
      } catch {
        // ignore
      }
    }
  }
}


/**
 * Recherche Airbnb avec retries et backoff exponentiel + jitter.
 *
 * Tentative 1 immédiate ; puis attente base*2^(n-1) (plafonnée) avant chaque
 * nouvel essai. Les échecs CAPTCHA non résolus par l’utilisateur ne sont pas
 * retentés automatiquement.
 */
export async function scrapeAirbnbSearch(
  params: AirbnbScrapeParams
): Promise<AirbnbScrapeOutcome> {
  const maxRetries = Math.max(1, params.maxRetries ?? 3)
  const baseDelayMs = params.retryBaseDelayMs ?? 1_500
  const maxDelayMs = params.retryMaxDelayMs ?? 20_000

  let last: AirbnbScrapeOutcome | null = null

  let workingParams: AirbnbScrapeParams = { ...params }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    last = await scrapeAirbnbSearchOnce(workingParams)

    if (last.ok) {
      return { ...last, attempts: attempt }
    }

    // Décalage calendrier : une retente avec nouvelles dates
    if (last.error.startsWith('DATE_SHIFT:') && workingParams.autoShiftDates) {
      const parts = last.error.split(':')
      const newIn = parts[1]
      const newOut = parts[2]
      if (newIn && newOut) {
        workingParams = {
          ...workingParams,
          checkIn: newIn,
          checkOut: newOut,
          autoShiftDates: false // une seule bascule
        }
        await closeAirbnbBrowser()
        await sleep(800)
        continue
      }
    }

    const retryable = isRetryableError(last.error)
    if (!retryable || attempt >= maxRetries) {
      return { ...last, attempts: attempt }
    }

    // Nouveau proxy résidentiel au prochain essai
    await closeAirbnbBrowser()
    const delay = exponentialBackoffMs(attempt, baseDelayMs, maxDelayMs)
    await sleep(delay)
  }

  return last ?? { ok: false, error: 'Échec inconnu après retries.', attempts: maxRetries }
}
