import { chromium } from 'playwright'
const url = 'https://reservation.les2alpes.com/location-appartement-2-alpes.html'
const b = await chromium.launch({ headless: true })
const p = await b.newPage()
await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p.waitForTimeout(4000)
// consentement
for (const sel of ['button:has-text("Tout accepter")', 'button:has-text("Continuer sans accepter")', '#didomi-notice-agree-button']) {
  try { const l = p.locator(sel).first(); if (await l.isVisible({timeout: 800})) { await l.click({timeout: 2000}); console.log('consent cliqué:', sel); break } } catch {}
}
await p.waitForTimeout(3000)
const after = await p.evaluate(() => {
  const els = Array.from(document.querySelectorAll('[name="datedeb"]'))
  return els.map(e => {
    const cs = getComputedStyle(e)
    const form = e.closest('form')
    return { id: e.id, tag: e.tagName, type: e.type, display: cs.display, visibility: cs.visibility, rects: e.getClientRects().length, formId: form?.id, formDisplay: form ? getComputedStyle(form).display : null, parentClass: e.parentElement?.className, outer: e.outerHTML.slice(0, 300) }
  })
})
console.log(JSON.stringify(after, null, 2))
await p.screenshot({ path: '.tmp-repro/l2a2.png' })
await b.close()
