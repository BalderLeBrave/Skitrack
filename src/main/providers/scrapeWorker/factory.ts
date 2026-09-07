/**
 * Fabrique du connecteur **d’un** worker. SOURCE est figé au démarrage.
 */

import { createStationProvider } from '../station/station'
import type { AccommodationProvider } from '../types'
import {
  createBookingWebProvider,
  createGitesWebProvider,
  createVrboWebProvider
} from '../webscrape/providers'
import type { WorkerSource } from './protocol'

function envVault(key: string): string | undefined {
  if (key === 'omkar_booking') {
    return firstEnv('OMKAR_BOOKING_KEY', 'OMKAR_API_KEY')
  }
  if (key === 'omkar_airbnb') {
    return firstEnv('OMKAR_AIRBNB_KEY', 'OMKAR_API_KEY')
  }
  if (key === 'brightdata_browser') {
    return firstEnv('BRIGHTDATA_BROWSER_WS')
  }
  if (key === 'crawlbase_token') {
    return firstEnv('CRAWLBASE_TOKEN', 'CRAWLBASE_JS_TOKEN')
  }
  if (key === 'scrapingbee_key') {
    return firstEnv('SCRAPINGBEE_API_KEY', 'BOOKING_SCRAPER_API_KEY')
  }
  return firstEnv(key, key.toUpperCase(), key.replace(/-/g, '_').toUpperCase())
}

function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const raw = process.env[name]
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
  }
  return undefined
}

export function createWorkerProvider(source: WorkerSource): AccommodationProvider {
  if (source === 'booking-web') {
    return createBookingWebProvider({ vault: envVault, headless: true })
  }
  if (source === 'gites-web') {
    return createGitesWebProvider({ headless: true })
  }
  if (source === 'vrbo-web') {
    return createVrboWebProvider({ headless: true })
  }
  if (source === 'station-web') {
    return createStationProvider()
  }
  throw new Error(`SOURCE ${source} : Airbnb n’est pas un connecteur logements`)
}
