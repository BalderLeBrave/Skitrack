/**
 * Airbnb via pyairbnb (process Python dédié).
 *
 * Isolé de Playwright, d’Omkar, et des extracteurs Booking/Gîtes/Abritel.
 * Pas de decryptAll Electron : le worker Python n’en a pas besoin.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { app } from 'electron'
import { buildAirbnbSearchUrl } from './airbnb'
import type { AirbnbScrapeOutcome, AirbnbScrapeParams } from './scrape'

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

export function pyairbnbCliPath(root = repoRoot()): string | null {
  const env = process.env.SKITRACK_PYAIRBNB_CLI?.trim()
  if (env && existsSync(env)) return env
  for (const candidate of [
    join(root, 'scrape', 'airbnb', 'cli.py'),
    join(process.cwd(), 'scrape', 'airbnb', 'cli.py')
  ]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

export function pyairbnbPython(root = repoRoot()): string | null {
  const env = process.env.SKITRACK_PYAIRBNB_PYTHON?.trim()
  if (env && existsSync(env)) return env
  const names = [
    join(root, 'sidecar', '.venv', 'Scripts', 'python.exe'),
    join(root, 'sidecar', '.venv', 'bin', 'python'),
    join(root, 'scrape', 'airbnb', '.venv', 'Scripts', 'python.exe'),
    join(root, 'scrape', 'airbnb', '.venv', 'bin', 'python')
  ]
  for (const name of names) {
    if (existsSync(name)) return name
  }
  return process.platform === 'win32' ? 'python' : 'python3'
}

function looksStayTotal(listing: { priceLabel?: string }): boolean {
  const label = listing.priceLabel ?? ''
  if (!label) return false
  if (/(?:à|a)\s+partir\s+de/i.test(label)) return false
  if (/\/\s*nuit|par\s+nuit/i.test(label) && !/au\s+total|pour\s+\d+\s+nuits?/i.test(label)) {
    return false
  }
  return /au\s+total|pour\s+\d+\s+nuits?|\d/.test(label)
}

export async function scrapeAirbnbViaPyairbnb(
  params: AirbnbScrapeParams
): Promise<AirbnbScrapeOutcome | null> {
  const cli = pyairbnbCliPath()
  const python = pyairbnbPython()
  if (!cli || !python) return null

  const url = buildAirbnbSearchUrl(params)
  const body = JSON.stringify({
    city: params.city,
    url,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    adults: params.adults,
    children: params.children,
    infants: params.infants,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    bedrooms: params.bedrooms,
    bounds: params.bounds,
    maxPages: params.scrollCount,
    timeoutMs: params.timeoutMs
  })

  const timeoutMs = Math.max(20_000, params.timeoutMs ?? SPAWN_TIMEOUT_MS)
  const raw = await new Promise<string>((resolve, reject) => {
    const child = spawn(python, [cli], {
      env: {
        ...process.env,
        PYTHONPATH: dirname(cli),
        PYTHONUNBUFFERED: '1'
      },
      windowsHide: true
    })
    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`pyairbnb timeout ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.on('data', (c: Buffer) => chunks.push(c))
    child.stderr.on('data', (c: Buffer) => errChunks.push(c))
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (!text) {
        reject(new Error(Buffer.concat(errChunks).toString('utf8').trim() || `pyairbnb exit ${code}`))
        return
      }
      resolve(text)
    })
    child.stdin.write(body)
    child.stdin.end()
  }).catch(() => null)

  if (!raw) return null
  const line = raw.split('\n').filter((l) => l.startsWith('{')).pop()
  if (!line) return null
  try {
    const parsed = JSON.parse(line) as AirbnbScrapeOutcome
    if (!parsed || typeof parsed !== 'object' || !('ok' in parsed)) return null
    if (!parsed.ok) return parsed
    const listings = parsed.payload.listings.filter(looksStayTotal)
    if (listings.length === 0) {
      return { ok: false, error: 'pyairbnb: aucune annonce avec total de séjour', url: parsed.url, attempts: 1 }
    }
    return {
      ...parsed,
      payload: { ...parsed.payload, listings },
      count: listings.length,
      via: parsed.via === 'pyairbnb+stl' ? 'pyairbnb+stl' : 'pyairbnb',
      attempts: parsed.attempts ?? 1
    }
  } catch {
    return null
  }
}
