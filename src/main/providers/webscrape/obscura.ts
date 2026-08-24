/**
 * Moteur headless Obscura (CDP) — remplace Chromium pour les scrapers
 * Playwright (Ingénie, occupancy Ceto, Booking/Expedia web, Airbnb).
 *
 * Les connecteurs JSON (MSEM, Open System, Ceto HTML, LocVacances) restent
 * en `fetch` : un navigateur n’y ajoute aucun TOTAL.
 *
 * Pas de `--stealth` : robots.txt des centrales est toujours lu avant
 * `withPage`. Le script d’init (UA) reste au niveau Playwright.
 *
 * Binaire : `SKITRACK_OBSCURA`, `vendor/obscura/`, ou
 * `process.resourcesPath/obscura/` (build Electron).
 * Défaut : Obscura dès que le binaire est là. Repli Chromium seulement si
 * `SKITRACK_BROWSER=chromium`. Les scripts Maps / pixels qui SIGSEGV 0.2.1
 * sont coupés (`abort`) pour garder le formulaire Ingénie.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type BrowserContext } from 'playwright'
import type { ProxyConfig } from '../proxy'
import { toPlaywrightProxy } from '../proxy'

const BIN_NAME = process.platform === 'win32' ? 'obscura.exe' : 'obscura'

export function obscuraForcedChromium(): boolean {
  const v = (process.env.SKITRACK_BROWSER || '').trim().toLowerCase()
  return v === 'chromium' || v === 'chrome' || v === 'playwright'
}

/** true si le binaire est là et que l’utilisateur n’a pas forcé Chromium/Firefox. */
export function shouldUseObscura(): boolean {
  const v = (process.env.SKITRACK_BROWSER || '').trim().toLowerCase()
  if (v === 'chromium' || v === 'chrome' || v === 'playwright' || v === 'firefox') return false
  return resolveObscuraBinary() != null
}

function here(): string {
  try {
    return dirname(fileURLToPath(import.meta.url))
  } catch {
    return process.cwd()
  }
}

function projectVendor(): string {
  // …/src/main/providers/webscrape → repo root
  return join(here(), '..', '..', '..', '..', 'vendor', 'obscura', BIN_NAME)
}

let extraRoots: string[] = []

/** Chemins additionnels (app.getAppPath(), resourcesPath) — appelé depuis le pont Electron. */
export function setObscuraSearchRoots(roots: string[]): void {
  extraRoots = roots.filter(Boolean)
}

export function resolveObscuraBinary(): string | null {
  const env = process.env.SKITRACK_OBSCURA?.trim()
  if (env && existsSync(env)) return env
  const candidates: string[] = []
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resources) candidates.push(join(resources, 'obscura', BIN_NAME))
  for (const root of extraRoots) {
    candidates.push(join(root, 'vendor', 'obscura', BIN_NAME))
    candidates.push(join(root, 'obscura', BIN_NAME))
  }
  candidates.push(projectVendor())
  candidates.push(join(process.cwd(), 'vendor', 'obscura', BIN_NAME))
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      s.close(() => {
        if (addr && typeof addr === 'object') resolve(addr.port)
        else reject(new Error('obscura: pas de port libre'))
      })
    })
    s.on('error', reject)
  })
}

async function waitCdp(port: number, timeoutMs = 12_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(800)
      })
      if (res.ok || res.status === 404) return
      last = String(res.status)
    } catch (e) {
      last = e instanceof Error ? e.message : String(e)
    }
    await new Promise((r) => setTimeout(r, 120))
  }
  throw new Error(`obscura: CDP injoignable sur 127.0.0.1:${port} (${last})`)
}

interface ServerState {
  proc: ChildProcess
  port: number
  proxyRaw: string | null
  bin: string
}

let server: ServerState | null = null
let cdpBrowser: Browser | null = null

async function stopServer(): Promise<void> {
  if (cdpBrowser) {
    try {
      await cdpBrowser.close()
    } catch {
      /* ignore */
    }
    cdpBrowser = null
  }
  if (!server) return
  const proc = server.proc
  server = null
  if (proc.exitCode != null) return
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      resolve()
    }, 2_000)
    proc.once('exit', () => {
      clearTimeout(t)
      resolve()
    })
    try {
      proc.kill('SIGTERM')
    } catch {
      clearTimeout(t)
      resolve()
    }
  })
}

async function startServer(bin: string, proxyRaw: string | null): Promise<ServerState> {
  const port = await freePort()
  const args = ['serve', '--port', String(port), '--host', '127.0.0.1']
  if (proxyRaw) args.push('--proxy', proxyRaw)
  const proc = spawn(bin, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    cwd: dirname(bin)
  })
  let stderr = ''
  proc.stderr?.on('data', (c: Buffer) => {
    stderr += c.toString('utf8').slice(-2_000)
  })
  const died = new Promise<never>((_, reject) => {
    proc.once('exit', (code) => {
      reject(new Error(`obscura serve s’est arrêté (code ${code}) ${stderr.slice(-400)}`))
    })
  })
  await Promise.race([waitCdp(port), died])
  proc.removeAllListeners('exit')
  proc.on('exit', () => {
    if (server?.proc === proc) server = null
    cdpBrowser = null
  })
  return { proc, port, proxyRaw, bin }
}

async function ensureServer(proxyRaw: string | null): Promise<ServerState> {
  const bin = resolveObscuraBinary()
  if (!bin) {
    throw new Error(
      'Obscura introuvable — lancer `npm run obscura:fetch` ou définir SKITRACK_OBSCURA'
    )
  }
  if (server && server.bin === bin && server.proxyRaw === proxyRaw && server.proc.exitCode == null) {
    return server
  }
  await stopServer()
  server = await startServer(bin, proxyRaw)
  return server
}

export async function getObscuraBrowser(proxy?: ProxyConfig | null): Promise<Browser> {
  const st = await ensureServer(proxy?.raw ?? null)
  if (cdpBrowser) {
    try {
      cdpBrowser.contexts()
      return cdpBrowser
    } catch {
      cdpBrowser = null
    }
  }
  cdpBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${st.port}`)
  return cdpBrowser
}

const CONTEXT_OPTS = {
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
} as const

/** Scripts tiers qui font SIGSEGV Obscura 0.2.1 (Maps, pixels) — pas le formulaire. */
const OBSCURA_ABORT = [
  'maps.googleapis.com',
  'maps.gstatic.com',
  'google.com/maps',
  'connect.facebook.net',
  'facebook.com/tr',
  'googletagmanager.com',
  'google-analytics.com',
  'doubleclick.net',
  'googlesyndication.com',
  'cmp.sirdata.net',
  'cdn.sirdata.io'
]

function shouldAbort(url: string): boolean {
  const u = url.toLowerCase()
  return OBSCURA_ABORT.some((h) => u.includes(h))
}

const hardened = new WeakSet<BrowserContext>()

async function hardenObscuraContext(ctx: BrowserContext): Promise<void> {
  if (hardened.has(ctx)) return
  hardened.add(ctx)
  await ctx.route('**/*', (route) => {
    if (shouldAbort(route.request().url())) return route.abort()
    return route.continue()
  })
}

export async function getObscuraContext(
  proxy?: ProxyConfig | null,
  initScript?: string
): Promise<BrowserContext> {
  const browser = await getObscuraBrowser(proxy)
  const existing = browser.contexts()[0]
  const ctx =
    existing ??
    (await browser.newContext({
      ...CONTEXT_OPTS,
      ...(proxy ? { proxy: toPlaywrightProxy(proxy) } : {})
    }))
  if (initScript) await ctx.addInitScript(initScript)
  await hardenObscuraContext(ctx)
  return ctx
}

export async function closeObscura(): Promise<void> {
  await stopServer()
}

export function obscuraAvailable(): boolean {
  return resolveObscuraBinary() != null
}
