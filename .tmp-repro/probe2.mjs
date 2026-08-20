import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = browser.contexts()[0].pages()[0]
const txt = await page.evaluate(() => document.body.innerText.slice(0, 1200))
console.log('--- BODY TEXT ---')
console.log(txt)
console.log('--- root children ---')
console.log(await page.evaluate(() => document.getElementById('root')?.innerHTML.slice(0, 600)))
await browser.close()
