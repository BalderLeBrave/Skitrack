import { createStationProvider } from '@main/providers/station/station'
import { closeWebscrapeBrowser } from '@main/providers/webscrape/shared'

const url = 'https://reservation.les2alpes.com/location-appartement-2-alpes.html'
const provider = createStationProvider({ timeoutMs: 45_000, headless: true, maxRetries: 1 })
try {
  const offers = await provider.search({
    destination: 'Les 2 Alpes',
    officialUrl: url,
    checkIn: '2027-02-06',
    checkOut: '2027-02-13',
    adults: 4,
    children: 0
  } as never)
  console.log('\n=== offres rendues :', offers.length, '===')
  for (const o of offers.slice(0, 10)) {
    const c = o.rawProviderData as { priceText?: string; fromPrice?: boolean } | undefined
    console.log(` · ${o.title} | total=${o.totalPrice} | conf=${o.priceConfidence} | serp="${c?.priceText}" fromPrice=${c?.fromPrice}`)
  }
} catch (e) {
  console.log('ERREUR:', e instanceof Error ? e.message : String(e))
}
await closeWebscrapeBrowser()
process.exit(0)
