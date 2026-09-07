import { chromium } from 'playwright'
import {
  BRIGHTDATA_BOOKING_HOME,
  closeBookingPopup,
  resolveBrightDataBrowserWs
} from '../src/main/providers/booking/brightdata'
import { extractBookingCards } from '../src/main/providers/webscrape/extractors'
import { bookingSearchUrl } from '../src/main/providers/webscrape/urls'

const ws = resolveBrightDataBrowserWs({}, process.env)
if (!ws) {
  console.log('NO_WS')
  process.exit(1)
}

const t0 = Date.now()
const params = {
  destination: 'Les 2 Alpes, France',
  checkIn: '2027-02-06',
  checkOut: '2027-02-13',
  adults: 8,
  children: 0
}
const search = bookingSearchUrl(params, 0)

let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined
try {
  browser = await chromium.connectOverCDP(ws, { timeout: 60_000 })
  const ctx = browser.contexts()[0] ?? (await browser.newContext())
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.setDefaultTimeout(60_000)
  await page.goto(BRIGHTDATA_BOOKING_HOME, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const popped = await closeBookingPopup(page)
  await page.goto(search, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await closeBookingPopup(page)
  try {
    await page.waitForSelector('[data-testid="property-card"]', { timeout: 20_000 })
  } catch {
    /* extract still runs */
  }
  const cards = await page.evaluate(extractBookingCards)
  const withPrice = cards.filter((c) => c.priceText).length
  console.log(
    JSON.stringify(
      {
        ok: true,
        ms: Date.now() - t0,
        n: cards.length,
        withPrice,
        popped,
        advertised: cards[0]?.advertisedTotal ?? null,
        sample: cards.slice(0, 3).map((c) => ({
          title: (c.title || '').slice(0, 50),
          price: c.priceText,
          type: c.propertyType,
          guests: c.guests,
          bedrooms: c.bedrooms
        }))
      },
      null,
      2
    )
  )
} catch (e) {
  console.log(
    JSON.stringify({
      ok: false,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e)
    })
  )
  process.exitCode = 1
} finally {
  try {
    await browser?.close()
  } catch {
    /* ignore */
  }
}
