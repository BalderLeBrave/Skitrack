import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = browser.contexts()[0].pages()[0]
page.on('console', (m) => console.log(`[console:${m.type()}]`, m.text().slice(0, 400)))
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
for (let i = 0; i < 20; i++) {
  const s = await page.evaluate(() => ({
    phase: document.querySelector('.criteria-panel') ? 'criteria'
      : document.querySelector('.skisearch, [class*="skisearch"]') ? 'searching' : 'results',
    cards: document.querySelectorAll('.lodgcard, .card, [class*="lodg"]').length,
    msg: document.querySelector('[class*="skisearch"]')?.innerText?.slice(0, 200) ?? null
  }))
  console.log(new Date().toISOString().slice(11, 19), JSON.stringify(s))
  await page.waitForTimeout(5000)
}
await page.screenshot({ path: '.tmp-repro/lodg.png' })
await browser.close()
