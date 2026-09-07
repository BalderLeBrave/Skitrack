/**
 * Dumps des stations encore muettes + preuve Booking page 1 (walk / annoncé).
 *
 * HTML brut non versionné (gitignore *.html ici). JSON compact = preuve.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/diagnostics/dumps')
mkdirSync(OUT, { recursive: true })

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const STEALTH = `
(() => {
  try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) } catch {}
  if (!window.chrome) window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} }
})()
`

function save(name, content) {
  writeFileSync(join(OUT, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2))
}

function preview(html, n = 1800) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n)
}

function blockedKind(html, title, url) {
  const t = `${title} ${url} ${html}`.toLowerCase()
  if (/cf-challenge|__cf_chl|just a moment|attention required|checking your browser/.test(t)) return 'cloudflare'
  if (/bot or not|robot ou pas|datadome|captcha|recaptcha/.test(t)) return 'challenge'
  if (/403 forbidden|access denied/.test(t)) return 'forbidden'
  return null
}

const TARGETS = [
  {
    id: 'booking_d2a_p1',
    url: 'https://www.booking.com/searchresults.fr.html?ss=Les+2+Alpes&checkin=2027-02-13&checkout=2027-02-20&group_adults=4&no_rooms=1&selected_currency=EUR',
    kind: 'booking'
  },
  { id: 'karellis_ot', url: 'https://www.karellis.com/', kind: 'station' },
  { id: 'karellis_resa', url: 'https://www.karellis-reservation.com/', kind: 'station' },
  { id: 'karellis_heberg', url: 'https://www.karellis.com/hebergements/', kind: 'station' },
  { id: 'vars_elloha', url: 'https://www.alpes-sudlocations.com/', kind: 'station' },
  { id: 'angles_list', url: 'https://lesangles.com/tous-les-hebergements/', kind: 'station' },
  { id: 'angles_resa', url: 'https://reservation.lesangles.com/', kind: 'station' }
]

const report = { at: new Date().toISOString(), items: [] }

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage']
})
const ctx = await browser.newContext({
  userAgent: UA,
  locale: 'fr-FR',
  timezoneId: 'Europe/Paris',
  viewport: { width: 1440, height: 900 }
})
await ctx.addInitScript(STEALTH)

for (const t of TARGETS) {
  const page = await ctx.newPage()
  const xhrs = []
  page.on('response', (res) => {
    const u = res.url()
    if (/api|search|offre|booking|liste|xhr|json/i.test(u) && xhrs.length < 40) {
      xhrs.push({ url: u.slice(0, 240), status: res.status(), type: res.request().resourceType() })
    }
  })
  let status = 0
  try {
    const res = await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    status = res?.status() ?? 0
    await page.waitForTimeout(2500)
  } catch (err) {
    report.items.push({
      id: t.id,
      url: t.url,
      error: String(err).slice(0, 400),
      kind: t.kind
    })
    await page.close()
    continue
  }
  const html = await page.content()
  save(`${t.id}.html`, html)
  const title = await page.title()
  const finalUrl = page.url()
  const item = {
    id: t.id,
    url: t.url,
    finalUrl,
    status,
    title,
    bytes: html.length,
    blocked: blockedKind(html, title, finalUrl),
    bodyPreview: preview(html),
    xhrs: xhrs.slice(0, 20)
  }
  if (t.kind === 'booking') {
    item.booking = await page.evaluate(() => {
      const header =
        document.querySelector('[data-testid="property-list-header"]')?.textContent?.trim() ||
        document.querySelector('h1')?.textContent?.trim() ||
        ''
      const cards = document.querySelectorAll(
        '[data-testid="property-card"], [data-testid="property-card-container"]'
      ).length
      const offsets = []
      for (const a of Array.from(document.querySelectorAll('a[href*="offset="]'))) {
        try {
          const off = new URL(a.href).searchParams.get('offset')
          if (off) offsets.push(Number(off))
        } catch {
          /* href */
        }
      }
      return {
        header: header.slice(0, 200),
        cards,
        nextOffsets: [...new Set(offsets)].sort((a, b) => a - b).slice(0, 8)
      }
    })
  }
  const lodgingHrefs = await page.$$eval('a[href]', (as) =>
    as
      .map((a) => a.href)
      .filter((h) => /heberg|logement|chalet|appartement|offre|fiche|hotel|gite/i.test(h))
      .slice(0, 25)
  )
  item.lodgingHrefs = lodgingHrefs
  report.items.push(item)
  await page.close()
}

await browser.close()
save('mute-stations-2026-09-03.json', report)
console.log(JSON.stringify(report, null, 2))
