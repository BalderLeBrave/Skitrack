/**
 * Contrat HTTP des workers de relevé isolés.
 *
 * Un process = une source. Booking ne charge pas le parseur Gîtes.
 * Les ports hôtes ne sont publiés que sur la boucle locale.
 */

export const WORKER_SOURCES = [
  'booking-web',
  'gites-web',
  'vrbo-web',
  'airbnb',
  'station-web'
] as const

export type WorkerSource = (typeof WORKER_SOURCES)[number]

const PORTS: Record<WorkerSource, number> = {
  'booking-web': 18701,
  'gites-web': 18702,
  'vrbo-web': 18703,
  airbnb: 18704,
  'station-web': 18705
}

export function isWorkerSource(value: string | undefined | null): value is WorkerSource {
  return WORKER_SOURCES.includes(value as WorkerSource)
}

export function defaultWorkerPort(source: WorkerSource): number {
  return PORTS[source]
}

export function defaultWorkerBaseUrl(source: WorkerSource): string {
  return `http://127.0.0.1:${defaultWorkerPort(source)}`
}

/** SKITRACK_SCRAPE_URL_GITES_WEB → http://… */
export function workerUrlEnvKey(source: WorkerSource): string {
  return `SKITRACK_SCRAPE_URL_${source.replace(/-/g, '_').toUpperCase()}`
}

export interface WorkerHealth {
  ok: true
  source: WorkerSource
  isolated: true
}

export interface LodgingSearchOk {
  ok: true
  results: unknown[]
}

export interface WorkerError {
  ok: false
  error: string
}
