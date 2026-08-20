import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const ctx = browser.contexts()[0]
const page = ctx.pages().find((p) => p.url().includes('index.html')) ?? ctx.pages()[0]

page.on('console', (m) => console.log(`[console:${m.type()}]`, m.text()))
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

await page.waitForTimeout(1500)
console.log('URL:', page.url())
console.log('title:', await page.title())

// État de l'accueil : tuiles de massif et leurs images de fond
const tiles = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('.masstile')) {
    const cs = getComputedStyle(el)
    out.push({
      name: el.querySelector('.masstile__name')?.textContent ?? '?',
      plain: el.classList.contains('masstile--plain'),
      bg: cs.backgroundImage.slice(0, 120)
    })
  }
  return out
})
console.log('TUILES:', JSON.stringify(tiles, null, 1))

await page.screenshot({ path: '.tmp-repro/home.png', fullPage: false })
console.log('screenshot ok')
await browser.close()
