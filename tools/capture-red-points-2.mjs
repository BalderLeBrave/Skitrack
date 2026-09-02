import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/diagnostics/dumps')
const SHELL =
  '/opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const STEALTH = `(() => { try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) } catch {} })()`

const report = { at: new Date().toISOString(), items: [] }

async function launch() {
  const b = await chromium.launch({
    executablePath: SHELL,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']
  })
  const ctx = await b.newContext({
    userAgent: UA,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 1440, height: 900 }
  })
  await ctx.addInitScript(STEALTH)
  return { b, ctx }
}

async function gitesEntity() {
  const { b, ctx } = await launch()
  const page = await ctx.newPage()
  const item = { id: 'gites_entity' }
  try {
    await page.goto('https://www.gites-de-france.com/fr/search', {
      waitUntil: 'domcontentloaded',
      timeout: 45_000
    })
    await page.waitForTimeout(2000)
    const fetched = await page.evaluate(async () => {
      const urls = [
        '/fr/g2f_autocomplete?q=Les%202%20Alpes',
        '/fr/g2f_autocomplete?q=2%20Alpes',
        '/fr/g2f_autocomplete?search=Les%202%20Alpes'
      ]
      const out = []
      for (const u of urls) {
        try {
          const r = await fetch(u, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
          const text = await r.text()
          out.push({ u, status: r.status, text: text.slice(0, 6000) })
        } catch (e) {
          out.push({ u, error: String(e) })
        }
      }
      return out
    })
    item.fetched = fetched.map((f) => ({
      u: f.u,
      status: f.status,
      error: f.error,
      preview: (f.text || '').slice(0, 800)
    }))
    const firstBody = fetched.find((f) => f.status === 200 && f.text)?.text
    if (firstBody) writeFileSync(join(OUT, 'gites_autocomplete.json'), firstBody)

    // Force-type even if overlay intercepts click.
    await page.evaluate(() => {
      const i = document.querySelector('#edit-destination')
      if (!i) return
      i.focus()
      i.value = 'Les 2 Alpes'
      i.dispatchEvent(new Event('input', { bubbles: true }))
      i.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 's' }))
    })
    await page.waitForTimeout(2000)
    item.wrapper = await page.locator('.g2f-autocomplete-resultWrapper').innerHTML().catch(() => '')
    item.entity_id = await page.locator('input[name="entity_id"]').inputValue().catch(() => '')
  } catch (e) {
    item.error = String(e).slice(0, 400)
  } finally {
    await b.close()
  }
  report.items.push(item)
}

async function msemSpy(id, url) {
  const { b, ctx } = await launch()
  const page = await ctx.newPage()
  const calls = []
  page.on('response', async (res) => {
    const u = res.url()
    if (/msem\.tech/i.test(u)) {
      let body = ''
      try {
        body = (await res.text()).slice(0, 400)
      } catch {
        body = ''
      }
      calls.push({ url: u, status: res.status(), body })
    }
  })
  const item = { id, url }
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForTimeout(8000)
    item.finalUrl = page.url()
    item.title = await page.title()
    item.calls = calls
    const html = await page.content()
    writeFileSync(join(OUT, `${id}.html`), html)
    const m = html.match(/services\.msem\.tech[^"' ]+/g) || []
    item.msemUrlsInHtml = [...new Set(m)].slice(0, 10)
    const resort = html.match(/lodging\/resort\/(\d+)\/([A-Za-z0-9_-]+)/)
    if (resort) item.parsed = { resort: resort[1], channel: resort[2] }
  } catch (e) {
    item.error = String(e).slice(0, 400)
  } finally {
    await b.close()
  }
  report.items.push(item)
}

async function karellisResa() {
  const { b, ctx } = await launch()
  const page = await ctx.newPage()
  const item = { id: 'karellis_resa' }
  try {
    const resp = await page.goto('https://www.karellis-reservation.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 45_000
    })
    item.http = resp?.status()
    await page.waitForTimeout(3000)
    const html = await page.content()
    writeFileSync(join(OUT, 'karellis_resa.html'), html)
    item.title = await page.title()
    item.bytes = html.length
    item.ingenie = (html.match(/ingenie/gi) || []).length
    item.msem = (html.match(/msem/gi) || []).length
    item.opensystem = (html.match(/open-system|for-system/gi) || []).length
  } catch (e) {
    item.error = String(e).slice(0, 400)
  } finally {
    await b.close()
  }
  report.items.push(item)
}

async function cozyMain() {
  const { b, ctx } = await launch()
  const page = await ctx.newPage()
  const item = { id: 'cozy_mainjs' }
  try {
    await page.goto(
      'https://www.cozycozy.com/fr/search?location=Les%202%20Alpes&checkin=2027-02-13&checkout=2027-02-20&adults=8',
      { waitUntil: 'domcontentloaded', timeout: 45_000 }
    )
    const src = await page.evaluate(() => {
      const s = [...document.querySelectorAll('script[src*="main."]')].map((el) => el.src)
      return s[0] || ''
    })
    item.mainSrc = src
    if (src) {
      const text = await page.evaluate(async (u) => (await fetch(u)).text(), src)
      writeFileSync(join(OUT, 'cozycozy_main.js.txt'), text.slice(0, 200_000))
      const hits = []
      for (const pat of [
        'path:',
        'search',
        'minBedRoomCount',
        'location',
        '/s/',
        'placeId',
        'slug'
      ]) {
        /* count only */
      }
      const re = /path:"([^"]+)"/g
      let m
      const paths = []
      while ((m = re.exec(text)) && paths.length < 40) paths.push(m[1])
      item.paths = paths
      const slug = [...text.matchAll(/les-2-alpes[^"']{0,40}/gi)].slice(0, 5).map((x) => x[0])
      item.slugHits = slug
      const eKey = text.match(/minBedRoomCount="([^"]+)"/)
      item.minBedRoomCountKey = eKey && eKey[1]
    }
  } catch (e) {
    item.error = String(e).slice(0, 400)
  } finally {
    await b.close()
  }
  report.items.push(item)
}

const main = async () => {
  await gitesEntity()
  console.log('gites', JSON.stringify(report.items.at(-1)).slice(0, 600))
  await msemSpy('msem_ecrins', 'https://www.paysdesecrins.com/')
  console.log('ecrins', JSON.stringify(report.items.at(-1)).slice(0, 600))
  await msemSpy('msem_valberg', 'https://www.valberg.com/')
  console.log('valberg', JSON.stringify(report.items.at(-1)).slice(0, 600))
  await karellisResa()
  console.log('karellis', JSON.stringify(report.items.at(-1)).slice(0, 400))
  await cozyMain()
  console.log('cozy', JSON.stringify(report.items.at(-1)).slice(0, 600))
  writeFileSync(join(OUT, 'capture-red-points-2.json'), JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
