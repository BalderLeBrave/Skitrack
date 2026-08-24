/**
 * A/B moteurs sur la homepage Ingénie (2 Alpes).
 *
 *   npm run scrape:probe-browser
 *   npm run scrape:probe-browser:win   (PowerShell, Windows)
 *
 * GET / seulement — robots.txt interdit /*?cid=* et /*?action=*.
 * Ne remplit pas le formulaire, n’appelle pas searchAjax.
 */
import { chromium, firefox } from 'playwright'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const URL = 'https://reservation.les2alpes.com/'
const BIN = process.platform === 'win32' ? 'obscura.exe' : 'obscura'

function vendorBin() {
  const p = join(process.cwd(), 'vendor', 'obscura', BIN)
  return existsSync(p) ? p : process.env.SKITRACK_OBSCURA || null
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      s.close(() => (addr && typeof addr === 'object' ? resolve(addr.port) : reject(new Error('port'))))
    })
    s.on('error', reject)
  })
}

async function readForm(page) {
  return page.evaluate(() => {
    const el = document.querySelector('input[name=datedeb], select[name=datedeb]')
    return {
      title: document.title,
      hasDatedeb: Boolean(el),
      datedebTag: el?.tagName || null,
      bodyLen: (document.body?.innerText || '').trim().length
    }
  })
}

async function probePlaywright(name, launch) {
  const t0 = Date.now()
  try {
    const browser = await launch()
    const page = await browser.newPage({ locale: 'fr-FR' })
    const resp = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 28_000 })
    await page.waitForTimeout(3_000)
    const form = await readForm(page)
    await browser.close()
    return { name, ok: form.hasDatedeb, ms: Date.now() - t0, status: resp?.status() ?? null, ...form }
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t0, err: String(e.message || e).slice(0, 220) }
  }
}

async function probeObscura() {
  const bin = vendorBin()
  if (!bin) return { name: 'obscura', ok: false, err: 'binaire absent (npm run obscura:fetch)' }
  const t0 = Date.now()
  const port = await freePort()
  const proc = spawn(bin, ['serve', '--port', String(port), '--host', '127.0.0.1'], {
    cwd: join(bin, '..'),
    stdio: ['ignore', 'pipe', 'pipe']
  })
  try {
    const deadline = Date.now() + 12_000
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) })
        if (r.ok) break
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 120))
    }
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    const ctx = browser.contexts()[0] ?? (await browser.newContext())
    const page = await ctx.newPage()
    const resp = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 28_000 })
    await page.waitForTimeout(3_000)
    if (page.isClosed()) throw new Error('page fermée (crash moteur)')
    const form = await readForm(page)
    await browser.close()
    return { name: 'obscura', ok: form.hasDatedeb, ms: Date.now() - t0, status: resp?.status() ?? null, ...form }
  } catch (e) {
    return { name: 'obscura', ok: false, ms: Date.now() - t0, err: String(e.message || e).slice(0, 220) }
  } finally {
    try {
      proc.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
}

const rows = []
rows.push(
  await probePlaywright('chromium', () =>
    chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  )
)
rows.push(await probePlaywright('firefox', () => firefox.launch({ headless: true })))
rows.push(await probeObscura())
for (const r of rows) console.log(JSON.stringify(r))
if (!rows.some((r) => r.name === 'chromium' && r.ok)) process.exit(1)
