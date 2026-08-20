import { chromium } from 'playwright'
const url = process.argv[2] ?? 'https://reservation.les2alpes.com/location-appartement-2-alpes.html'
const b = await chromium.launch({ headless: true })
const p = await b.newPage()
await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
await p.waitForTimeout(8000)
const info = await p.evaluate(() => {
  const q = (s) => Array.from(document.querySelectorAll(s)).map(e => ({ name: e.getAttribute('name'), id: e.id, type: e.tagName, vis: !!(e.offsetParent || e.getClientRects().length) }))
  return {
    url: location.href,
    datedeb: q('[name="datedeb"]'),
    datefin: q('[name="datefin"]'),
    forms: q('form'),
    ingenie: /ingenie/i.test(document.documentElement.innerHTML),
    consent: Array.from(document.querySelectorAll('button, a')).map(e => (e.innerText||'').trim()).filter(t => /accept|refus|cookie|consent|tout/i.test(t)).slice(0,10),
    fiches: document.querySelectorAll('.fiche-info').length
  }
})
console.log(JSON.stringify(info, null, 2))
await p.screenshot({ path: '.tmp-repro/l2a.png', fullPage: false })
await b.close()
