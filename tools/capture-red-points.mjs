/**
 * Captures ciblées des points encore rouges.
 *
 * Ne parse pas : enregistre HTTP, title, extraits, XHR. Preuves pour
 * discovery_*.md. Chromium : PLAYWRIGHT_BROWSERS_PATH headless-shell.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/diagnostics/dumps')
mkdirSync(OUT, { recursive: true })

const SHELL =
  process.env.CHROME_SHELL ||
  '/opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const STEALTH = `
(() => {
  try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) } catch {}
  if (!window.chrome) window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} }
  try { Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr', 'en-US', 'en'] }) } catch {}
})()
`

const report = { at: new Date().toISOString(), items: [] }

function save(name, content) {
  writeFileSync(join(OUT, name), content)
}

async function browser() {
  return chromium.launch({
    executablePath: SHELL,
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage']
  })
}

async function contextOf(b) {
  const ctx = await b.newContext({
    userAgent: UA,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 1440, height: 900 }
  })
  await ctx.addInitScript(STEALTH)
  return ctx
}

async function snap(page, id) {
  const html = await page.content()
  const title = await page.title()
  const url = page.url()
  const status = page.mainFrame() ? null : null
  save(`${id}.html`, html)
  return { id, title, url, bytes: html.length, html }
}

async function gitesAutocomplete() {
  const b = await browser()
  const ctx = await contextOf(b)
  const page = await ctx.newPage()
  const xhrs = []
  page.on('response', async (res) => {
    const u = res.url()
    if (/g2f_autocomplete|autocomplete|entity/i.test(u)) {
      let body = ''
      try {
        body = await res.text()
      } catch {
        body = ''
      }
      xhrs.push({ url: u, status: res.status(), body: body.slice(0, 8000) })
      save('gites_autocomplete.json', body)
    }
  })
  const item = { id: 'gites_autocomplete', ok: false }
  try {
    const resp = await page.goto('https://www.gites-de-france.com/fr/search', {
      waitUntil: 'domcontentloaded',
      timeout: 45_000
    })
    item.http = resp?.status() ?? 0
    await page.waitForTimeout(2500)
    const dest = page.locator('#edit-destination')
    if ((await dest.count()) === 0) {
      item.note = 'pas de #edit-destination'
      const s = await snap(page, 'gites_autocomplete_page')
      item.title = s.title
      item.bytes = s.bytes
      report.items.push(item)
      return
    }
    await dest.click()
    await dest.fill('')
    await dest.type('Les 2 Alpes', { delay: 80 })
    await page.waitForTimeout(2500)
    const suggestions = await page.locator('.g2f-autocomplete-resultWrapper, [role="option"], .ui-menu-item, li').allTextContents()
    item.suggestions = suggestions.map((t) => t.trim()).filter(Boolean).slice(0, 12)
    const entityId = await page.locator('input[name="entity_id"]').inputValue().catch(() => '')
    const entityType = await page.locator('input[name="entity_type"]').inputValue().catch(() => '')
    item.entity_id_after_type = entityId
    item.entity_type_after_type = entityType
    item.xhrs = xhrs.map((x) => ({ url: x.url, status: x.status, preview: x.body.slice(0, 500) }))
    if (xhrs[0]?.body) save('gites_autocomplete.json', xhrs[0].body)

    // Clique la 1re suggestion si visible.
    const opt = page.locator('.g2f-autocomplete-resultWrapper a, .g2f-autocomplete-resultWrapper li, [role="option"]').first()
    if ((await opt.count()) > 0) {
      await opt.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(800)
      item.entity_id_after_click = await page.locator('input[name="entity_id"]').inputValue().catch(() => '')
      item.entity_type_after_click = await page.locator('input[name="entity_type"]').inputValue().catch(() => '')
      item.destination_after_click = await page.locator('#edit-destination').inputValue().catch(() => '')
    }

    if (item.entity_id_after_click || item.entity_id_after_type) {
      await page.fill('input[name="date-start"]', '2027-02-13').catch(() => {})
      await page.fill('input[name="date-end"]', '2027-02-20').catch(() => {})
      await page.fill('input[name="adults"]', '8').catch(() => {})
      await page.locator('#search-api-page-block-form').evaluate((f) => f.submit()).catch(() => {})
      await page.waitForTimeout(4000)
      const s = await snap(page, 'gites_serp_after_entity')
      item.serp_title = s.title
      item.serp_url = s.url
      item.serp_bytes = s.bytes
      item.gite_card = (s.html.match(/gite-card/gi) || []).length
      item.noResults = s.html.includes('g2f-searchResult-noResults')
    } else {
      const s = await snap(page, 'gites_autocomplete_page')
      item.title = s.title
      item.bytes = s.bytes
    }
    item.ok = true
  } catch (e) {
    item.error = String(e).slice(0, 400)
    try {
      await snap(page, 'gites_autocomplete_error')
    } catch {
      /* ignore */
    }
  } finally {
    await b.close()
  }
  report.items.push(item)
}

async function cozyLaunch() {
  const b = await browser()
  const ctx = await contextOf(b)
  const page = await ctx.newPage()
  const xhrs = []
  page.on('response', async (res) => {
    const u = res.url()
    if (/cozycozy\.com\/(api|graphql|search|offer)/i.test(u) && !/gtm|hotjar|google|inmobi|ahrefs/.test(u)) {
      xhrs.push({ url: u, status: res.status() })
    }
  })
  const item = { id: 'cozy_launch', ok: false }
  try {
    const url =
      'https://www.cozycozy.com/fr/search?location=Les%202%20Alpes&checkin=2027-02-13&checkout=2027-02-20&adults=8&nights=7&e=4'
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    item.http = resp?.status() ?? 0
    await page.waitForTimeout(8000)
    const inputs = await page.evaluate(() =>
      [...document.querySelectorAll('input, [contenteditable]')].map((el) => ({
        tag: el.tagName,
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        ph: el.getAttribute('placeholder'),
        aria: el.getAttribute('aria-label')
      }))
    )
    item.inputs = inputs.slice(0, 20)
    // Essai : taper dans le premier input texte visible.
    const box = page.locator('input[type="text"], input[placeholder*="Où" i], input[placeholder*="destination" i]').first()
    if ((await box.count()) > 0) {
      await box.click({ timeout: 2000 }).catch(() => {})
      await box.fill('Les 2 Alpes').catch(() => {})
      await page.waitForTimeout(2000)
      await page.keyboard.press('Enter').catch(() => {})
      await page.waitForTimeout(5000)
    }
    const s = await snap(page, 'cozycozy_launched')
    item.title = s.title
    item.bytes = s.bytes
    item.url = s.url
    item.joli = s.html.includes('joli-root')
    item.outlet = s.html.includes('router-outlet')
    item.offer = (s.html.match(/\/offer/g) || []).length
    item.xhrs = xhrs.slice(0, 20)
    item.ok = true
  } catch (e) {
    item.error = String(e).slice(0, 400)
  } finally {
    await b.close()
  }
  report.items.push(item)
}

const NOT_WIRED = [
  ['karellis', 'https://www.karellis.com/'],
  ['pralognan', 'https://www.reservationpralognan.fr/'],
  ['clusaz', 'https://www.laclusaz.com/'],
  ['alpes-sud', 'https://www.alpes-sudlocations.com/'],
  ['valberg', 'https://www.valberg.com/'],
  ['ecrins', 'https://www.paysdesecrins.com/'],
  ['angles', 'https://www.lesangles.com/'],
  ['sancy', 'https://www.sancy.com/']
]

async function notWired() {
  const b = await browser()
  const ctx = await contextOf(b)
  for (const [id, url] of NOT_WIRED) {
    const page = await ctx.newPage()
    const item = { id: `nw_${id}`, url, ok: false }
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      item.http = resp?.status() ?? 0
      await page.waitForTimeout(2500)
      const s = await snap(page, `nw_${id}`)
      item.title = s.title
      item.bytes = s.bytes
      item.finalUrl = s.url
      const h = s.html.toLowerCase()
      item.markers = {
        ingenie: (h.match(/ingenie/g) || []).length,
        ublo: (h.match(/ublo|msem|monsejourenmontagne/g) || []).length,
        opensystem: (h.match(/open-system|for-system|osform/g) || []).length,
        orchestra: (h.match(/orchestra|ceto/g) || []).length,
        cloudflare: (h.match(/cloudflare|attention required/g) || []).length,
        recaptcha: (h.match(/recaptcha|hcaptcha/g) || []).length,
        spa: (h.match(/ng-version|__next|nuxt|router-outlet/g) || []).length
      }
      item.ok = true
    } catch (e) {
      item.error = String(e).slice(0, 300)
    } finally {
      await page.close()
    }
    report.items.push(item)
  }
  await b.close()
}

const main = async () => {
  console.log('shell', SHELL)
  await gitesAutocomplete()
  console.log('gites done', JSON.stringify(report.items.at(-1), null, 0).slice(0, 400))
  await cozyLaunch()
  console.log('cozy done', JSON.stringify(report.items.at(-1), null, 0).slice(0, 400))
  await notWired()
  save('capture-red-points.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
