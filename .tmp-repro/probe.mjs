import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
for (const ctx of browser.contexts()) {
  for (const p of ctx.pages()) {
    console.log('page:', p.url())
    try {
      const n = await p.evaluate(() => ({
        massifs: document.querySelectorAll('.home__massifs').length,
        tiles: document.querySelectorAll('.masstile').length,
        tab: document.querySelector('.nav a.is-active, .topnav__link--active, [aria-current]')?.textContent ?? null
      }))
      console.log('  ', JSON.stringify(n))
    } catch (e) { console.log('  err', e.message) }
  }
}
await browser.close()
