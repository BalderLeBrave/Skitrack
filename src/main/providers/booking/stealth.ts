/**
 * Booking via worker Python stealth (invisible_playwright → Camoufox →
 * SeleniumBase UC). Isolé de Playwright Node, Gîtes, Airbnb.
 *
 * Si les trois moteurs échouent (binaires absents / défi), on rend null :
 * Omkar / Bright Data / Chromium local prennent la suite.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { app } from 'electron'
import type { Accommodation, SearchParams } from '../types'
import { nowIso } from '../types'
import { brightDataResidentialFromBrowserWs, resolveBrightDataBrowserWs } from './brightdata'
import { resolveCrawlbaseToken } from './crawlbase'
import { resolveScrapingBeeKey } from './scrapingbee'

const SPAWN_TIMEOUT_MS = 180_000

function repoRoot(): string {
  const env = process.env.SKITRACK_ROOT?.trim()
  if (env) return env
  try {
    return app.getAppPath()
  } catch {
    return process.cwd()
  }
}

export function bookingStealthCliPath(root = repoRoot()): string | null {
  const env = process.env.SKITRACK_BOOKING_CLI?.trim()
  if (env && existsSync(env)) return env
  for (const candidate of [
    join(root, 'scrape', 'booking', 'cli.py'),
    join(process.cwd(), 'scrape', 'booking', 'cli.py')
  ]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

export function bookingStealthPython(root = repoRoot()): string | null {
  const env = process.env.SKITRACK_BOOKING_PYTHON?.trim()
  if (env && existsSync(env)) return env
  for (const name of [
    join(root, 'scrape', 'booking', '.venv', 'bin', 'python'),
    join(root, 'scrape', 'booking', '.venv', 'Scripts', 'python.exe'),
    join(root, 'sidecar', '.venv', 'bin', 'python'),
    join(root, 'sidecar', '.venv', 'Scripts', 'python.exe')
  ]) {
    if (existsSync(name)) return name
  }
  return process.platform === 'win32' ? 'python' : 'python3'
}

function looksStayTotal(row: { totalPrice?: number; priceConfidence?: string }): boolean {
  return row.priceConfidence === 'total_confirmed' && typeof row.totalPrice === 'number' && row.totalPrice > 0
}

export async function scrapeBookingViaStealth(
  params: SearchParams,
  vault?: (key: string) => string | undefined
): Promise<Accommodation[] | null> {
  const cli = bookingStealthCliPath()
  const python = bookingStealthPython()
  if (!cli || !python) return null

  const ws = resolveBrightDataBrowserWs(
    vault ? { brightdata_browser: vault('brightdata_browser') } : {},
    process.env
  )
  const derived = ws ? brightDataResidentialFromBrowserWs(ws) : undefined
  const crawlbase = resolveCrawlbaseToken(
    vault ? { crawlbase_token: vault('crawlbase_token') } : {},
    process.env
  )
  const bee = resolveScrapingBeeKey(
    vault ? { scrapingbee_key: vault('scrapingbee_key') } : {},
    process.env
  )

  const body = JSON.stringify({
    destination: params.destination,
    city: params.destination,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    adults: params.adults,
    children: params.children,
    bedrooms: params.bedrooms,
    maxPages: 15
  })

  const raw = await new Promise<string>((resolve, reject) => {
    const bin = join(dirname(cli), '.venv', 'bin')
    const chromeDir = join(dirname(cli), '.browsers', 'chrome-linux64')
    const chrome = join(chromeDir, 'chrome')
    const child = spawn(python, [cli], {
      env: {
        ...process.env,
        PYTHONPATH: dirname(cli),
        PYTHONUNBUFFERED: '1',
        PATH: [bin, chromeDir, process.env.PATH || ''].join(delimiter),
        ...(existsSync(chrome) ? { SKITRACK_CHROME: chrome, CHROME_BIN: chrome } : {}),
        ...(ws && !process.env.BRIGHTDATA_BROWSER_WS ? { BRIGHTDATA_BROWSER_WS: ws } : {}),
        ...(derived && !process.env.SKITRACK_PROXY ? { SKITRACK_PROXY: derived } : {}),
        ...(crawlbase && !process.env.CRAWLBASE_TOKEN ? { CRAWLBASE_TOKEN: crawlbase } : {}),
        ...(bee && !process.env.SCRAPINGBEE_API_KEY ? { SCRAPINGBEE_API_KEY: bee } : {})
      },
      windowsHide: true
    })
    const chunks: Buffer[] = []
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`booking-stealth timeout ${SPAWN_TIMEOUT_MS}ms`))
    }, SPAWN_TIMEOUT_MS)
    child.stdout.on('data', (c: Buffer) => chunks.push(c))
    child.stderr.on('data', () => undefined)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', () => {
      clearTimeout(timer)
      resolve(Buffer.concat(chunks).toString('utf8').trim())
    })
    child.stdin.write(body)
    child.stdin.end()
  }).catch(() => null)

  if (!raw) return null
  const line = raw.split('\n').filter((l) => l.startsWith('{')).pop()
  if (!line) return null
  try {
    const parsed = JSON.parse(line) as { ok?: boolean; results?: Accommodation[] }
    if (!parsed?.ok || !Array.isArray(parsed.results)) return null
    const list = parsed.results.filter(looksStayTotal).map((row) => ({
      ...row,
      source: 'booking-web',
      retrievedAt: row.retrievedAt ?? nowIso()
    }))
    return list.length ? list : null
  } catch {
    return null
  }
}
