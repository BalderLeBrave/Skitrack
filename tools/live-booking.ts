/**
 * Relevé Booking live — Les 2 Alpes, 6→13 fév. 2027, 8 pers.
 * dest_id=-145000 (ville Booking) pour ne pas dériver sur un SERP US.
 * Walk = collectPages, 15 pages max, stop advertised.
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { extractBookingCards } from '../src/main/providers/webscrape/extractors'
import { bookingSearchUrl } from '../src/main/providers/webscrape/urls'
import { collectPages, paginationOf } from '../src/main/providers/webscrape/providers'
import { closeBookingPopup } from '../src/main/providers/booking/brightdata'
import { looksBlocked } from '../src/main/providers/webscrape/shared'
import type { SearchParams } from '../src/main/providers/types'
import type { RawCard } from '../src/main/providers/webscrape/extractors'

const params: SearchParams = {
  destination: 'Les 2 Alpes',
  checkIn: '2027-02-06',
  checkOut: '2027-02-13',
  adults: 8,
  children: 0
}

/** Ville Booking Les 2 Alpes — sans ça le datacenter US dérive (hôtels Oregon…). */
function d2aUrl(offset: number): string {
  const u = new URL(bookingSearchUrl(params, offset))
  u.searchParams.set('dest_id', '-145000')
  u.searchParams.set('dest_type', 'city')
  u.searchParams.set('lang', 'fr')
  return u.toString()
}

async function main(): Promise<void> {
  const t0 = Date.now()
  console.log('[live-booking] start', d2aUrl(0))
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']
  })
  const ctx = await browser.newContext({
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
  })
  await ctx.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    } catch {
      /* */
    }
  })
  const page = await ctx.newPage()
  page.setDefaultTimeout(45_000)
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) console.log('[console]', m.type(), m.text().slice(0, 180))
  })
  page.on('response', (res) => {
    if (res.status() >= 400) console.log('[http]', res.status(), res.url().slice(0, 140))
  })
  let urls = 0
  try {
    await page.goto('https://www.booking.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await closeBookingPopup(page)
    try {
      const btn = page.locator('#onetrust-accept-btn-handler').first()
      if (await btn.isVisible({ timeout: 2_000 })) await btn.click()
    } catch {
      /* */
    }
    await page.waitForTimeout(800)
    const cards = await collectPages(
      async (offset) => d2aUrl(offset),
      25,
      async (url) => {
        urls++
        console.log(`[live-booking] page ${urls} offset-url=${url.includes('offset=') ? 'oui' : 'non'} dest=${/dest_id=-145000/.test(url)}`)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        await closeBookingPopup(page)
        for (const sel of [
          '#onetrust-accept-btn-handler',
          'button#onetrust-accept-btn-handler',
          'button:has-text("Accepter")',
          'button:has-text("Tout accepter")'
        ]) {
          try {
            const btn = page.locator(sel).first()
            if (await btn.isVisible({ timeout: 1_200 })) {
              await btn.click({ timeout: 1_500 })
              break
            }
          } catch {
            /* */
          }
        }
        try {
          await page.waitForSelector('[data-testid="property-card"]', { timeout: 20_000 })
        } catch {
          /* extract still runs */
        }
        await page.waitForTimeout(800)
        if (urls === 1) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
          await page.waitForTimeout(1200)
        }
        const html = await page.content()
        const here = page.url()
        const batch = (await page.evaluate(extractBookingCards)) as RawCard[]
        const blocked = await looksBlocked(page)
        const snippet = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400))
        console.log(
          `[live-booking]   url=${here.slice(0, 90)} cartes=${batch.length} adv=${batch[0]?.advertisedTotal ?? '—'} blocked=${blocked} cardsAttr=${/data-testid="property-card"/.test(html)}`
        )
        console.log('[live-booking]   text:', snippet)
        if (urls === 1) {
          mkdirSync('/tmp/skitrack/.screenshots', { recursive: true })
          await page.screenshot({ path: '/tmp/skitrack/.screenshots/booking-d2a-p1.png', fullPage: false })
          writeFileSync('/tmp/skitrack/.screenshots/booking-d2a-p1.html', html.slice(0, 250_000))
        }
        if (/\/index\.(fr\.)?html$/i.test(here) && batch.length < 5) {
          throw new Error('relevé refusé par la source (captcha ou blocage anti-robot)')
        }
        return batch
      },
      15,
      180_000
    )
    const pag = paginationOf(cards)
    const report = {
      ok: cards.length > 0 && !/ashland|portland|fort lauderdale/i.test(cards[0]?.title || ''),
      ms: Date.now() - t0,
      station: 'Les 2 Alpes',
      check_in: params.checkIn,
      check_out: params.checkOut,
      guests: params.adults,
      fetched: cards.length,
      pages_fetched: pag?.pagesFetched ?? urls,
      stopped_reason: pag?.stoppedReason ?? null,
      advertised: pag?.advertised ?? cards[0]?.advertisedTotal ?? null,
      withPrice: cards.filter((c) => c.priceText).length,
      sample: cards.slice(0, 8).map((c) => ({
        title: (c.title || '').slice(0, 70),
        price: c.priceText ?? null,
        guests: c.guests ?? null,
        bedrooms: c.bedrooms ?? null,
        type: (c.propertyType || '').slice(0, 40) || null
      }))
    }
    console.log('[live-booking] RESULT', JSON.stringify(report, null, 2))
    if (!report.ok) process.exitCode = 1
  } catch (err) {
    console.log(
      JSON.stringify({
        ok: false,
        ms: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err)
      })
    )
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('[live-booking] FAIL', err)
  process.exitCode = 1
})
