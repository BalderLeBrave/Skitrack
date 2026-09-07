/**
 * Client des workers isolés. L’app Electron POST le séjour ;
 * le worker rend les offres. Pas de secret dans le corps : les clés Omkar
 * vivent dans l’environnement du worker.
 */

import type { AirbnbScrapeOutcome, AirbnbScrapeParams } from '../airbnb/scrape'
import type { Accommodation, SearchParams } from '../types'
import {
  defaultWorkerBaseUrl,
  isWorkerSource,
  workerUrlEnvKey,
  type WorkerSource
} from './protocol'

const SEARCH_TIMEOUT_MS = 180_000
const HEALTH_TIMEOUT_MS = 400
const HEALTH_TTL_MS = 30_000

type Probe = { at: number; base: string | null }
const probes = new Map<WorkerSource, Probe>()

export function scrapeDockerForcedOff(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SKITRACK_SCRAPE_DOCKER === '0' || env.SKITRACK_SCRAPE_DOCKER === 'false'
}

export function scrapeDockerRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SKITRACK_SCRAPE_DOCKER === '1' || env.SKITRACK_SCRAPE_DOCKER === 'true'
}

export async function resolveWorkerBase(
  source: string,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now()
): Promise<string | null> {
  if (!isWorkerSource(source)) return null
  const explicit = env[workerUrlEnvKey(source)]?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  if (scrapeDockerForcedOff(env)) return null

  const want = defaultWorkerBaseUrl(source)
  if (!scrapeDockerRequired(env)) {
    const hit = probes.get(source)
    if (hit && now - hit.at < HEALTH_TTL_MS) return hit.base
    const base = (await workerHealthy(want)) ? want : null
    probes.set(source, { at: now, base })
    return base
  }
  return want
}

export async function workerHealthy(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) })
    if (!res.ok) return false
    const body = (await res.json()) as { ok?: boolean }
    return body.ok === true
  } catch {
    return false
  }
}

export async function searchLodgingOnWorker(
  base: string,
  params: SearchParams
): Promise<Accommodation[]> {
  const res = await fetch(`${base}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS)
  })
  const body = (await res.json()) as { ok?: boolean; results?: Accommodation[]; error?: string }
  if (!res.ok || body.ok === false) {
    throw new Error(body.error ?? `worker ${base} HTTP ${res.status}`)
  }
  return Array.isArray(body.results) ? body.results : []
}

export async function scrapeAirbnbOnWorker(
  base: string,
  params: AirbnbScrapeParams
): Promise<AirbnbScrapeOutcome> {
  const res = await fetch(`${base}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS)
  })
  const body = (await res.json()) as AirbnbScrapeOutcome
  if (!body || typeof body !== 'object' || !('ok' in body)) {
    throw new Error(`worker Airbnb ${base} : réponse illisible`)
  }
  return body
}

/** Tests : oublier le cache de sonde. */
export function resetWorkerProbes(): void {
  probes.clear()
}
