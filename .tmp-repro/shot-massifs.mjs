import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const ctx = browser.contexts()[0]
const page = ctx.pages().find((p) => p.url().includes('index.html')) ?? ctx.pages()[0]
const grid = page.locator('.home__massifs')
await grid.scrollIntoViewIfNeeded()
await page.waitForTimeout(600)
await grid.screenshot({ path: '.tmp-repro/massifs.png' })
const info = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('.masstile')) {
    const r = el.getBoundingClientRect()
    const url = getComputedStyle(el).backgroundImage.replace(/^url\("?|"?\)$/g, '')
    out.push({ name: el.querySelector('.masstile__name')?.textContent, w: Math.round(r.width), h: Math.round(r.height), url })
  }
  return out
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
