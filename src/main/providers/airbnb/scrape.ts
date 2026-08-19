/**
 * TEMPORARY STUB — full body available in agent session artifacts.
 *
 * Restore options:
 * 1. git checkout 81cba3a -- src/main/providers/airbnb/scrape.ts
 * 2. Or use the patched file from the agent (diagnoseEmptySearch + autoShiftDates)
 *
 * calendarBlocks.ts is already complete on master.
 */

import { buildAirbnbSearchUrl, type AirbnbUrlParams } from './airbnb'
import type { AirbnbClipPayload } from './extract'

export interface AirbnbScrapeParams extends AirbnbUrlParams {
  timeoutMs?: number
  scrollCount?: number
  headless?: boolean
  captchaTimeoutMs?: number
  optimizeScore?: boolean
  maxRetries?: number
  retryBaseDelayMs?: number
  retryMaxDelayMs?: number
  autoShiftDates?: boolean
}

export interface AirbnbScrapeResult {
  ok: true
  payload: AirbnbClipPayload
  url: string
  count: number
  captchaSolved?: boolean
  recaptchaV3Fallback?: boolean
  attempts?: number
}

export interface AirbnbScrapeError {
  ok: false
  error: string
  url?: string
  attempts?: number
}

export type AirbnbScrapeOutcome = AirbnbScrapeResult | AirbnbScrapeError

export async function scrapeAirbnbSearch(
  params: AirbnbScrapeParams
): Promise<AirbnbScrapeOutcome> {
  const url = buildAirbnbSearchUrl(params)
  return {
    ok: false,
    error:
      'scrape.ts body incomplete on remote. Restore: git checkout 81cba3a -- src/main/providers/airbnb/scrape.ts then apply calendarBlocks patch (see docs/INTEGRATION-calendar-blocks.md)',
    url
  }
}

export async function closeAirbnbBrowser(): Promise<void> {}
