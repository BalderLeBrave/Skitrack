/**
 * Relevé Airbnb live — Les 2 Alpes, 6→13 fév. 2027, 8 pers.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { scrapeAirbnbSearch, closeAirbnbBrowser } from '../src/main/providers/airbnb/scrape'
import { buildAirbnbSearchUrl } from '../src/main/providers/airbnb/airbnb'
import { searchZone } from '../src/shared/geo'
import { occupancyFromStaySearchResult } from '../src/main/providers/airbnb/extract'

const CHECK_IN = '2027-02-06'
const CHECK_OUT = '2027-02-13'
const ADULTS = 8
const OUT = 'docs/diagnostics/dumps/live-airbnb-d2a-2027-02-06.json'

async function main(): Promise<void> {
  const zone = searchZone(45.0067, 6.1228, 12)
  const params = {
    city: 'Les 2 Alpes, Isère',
    bounds: {
      north: zone.north,
      south: zone.south,
      east: zone.east,
      west: zone.west
    },
    checkIn: CHECK_IN,
    checkOut: CHECK_OUT,
    adults: ADULTS,
    children: 0,
    scrollCount: 10,
    maxRetries: 2,
    timeoutMs: 90_000,
    headless: true,
    optimizeScore: true
  }
  const url = buildAirbnbSearchUrl(params)
  console.log('[live-airbnb] url', url)
  const started = Date.now()
  const outcome = await scrapeAirbnbSearch(params)
  const ms = Date.now() - started
  const listings = outcome.ok ? outcome.payload.listings : []
  const samples = listings.slice(0, 10).map((l) => {
    const occ = occupancyFromStaySearchResult({
      __typename: 'StaySearchResult',
      subtitle: l.subtitle,
      title: l.name
    })
    return {
      name: l.name,
      priceLabel: l.priceLabel ?? null,
      guests: l.guests ?? occ.guests ?? null,
      bedrooms: l.bedrooms ?? occ.bedrooms ?? null,
      lat: l.lat ?? null,
      lon: l.lon ?? null,
      url: l.url ?? null,
      photo: l.image ?? null
    }
  })
  const report = {
    at: new Date().toISOString(),
    ms,
    url,
    ok: outcome.ok,
    error: outcome.ok ? null : outcome.error,
    attempts: outcome.attempts ?? null,
    fetched: listings.length,
    captchaSolved: outcome.ok ? outcome.captchaSolved ?? false : false,
    samples
  }
  mkdirSync('docs/diagnostics/dumps', { recursive: true })
  writeFileSync(join(OUT), JSON.stringify(report, null, 2))
  console.log('[live-airbnb] station_run', JSON.stringify({
    provider: 'airbnb',
    fetched: listings.length,
    parsed: listings.length,
    shown: listings.length,
    pages_fetched: outcome.ok ? 1 : 0,
    stopped_reason: outcome.ok ? 'exhausted' : /captcha|challenge|robot/i.test(outcome.error) ? 'blocked' : 'empty_page',
    reason_code: outcome.ok && listings.length > 0 ? 'ok' : outcome.ok ? '0_after_parse' : 'blocked',
    error: outcome.ok ? null : outcome.error,
    ms
  }))
  console.log('[live-airbnb] listings', listings.length)
  await closeAirbnbBrowser()
}

main().catch(async (err) => {
  console.error('[live-airbnb] FAIL', err)
  try {
    await closeAirbnbBrowser()
  } catch {
    /* */
  }
  process.exitCode = 1
})
