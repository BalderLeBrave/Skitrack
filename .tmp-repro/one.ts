import { createStationProvider } from '@main/providers/station/station'
import { closeWebscrapeBrowser } from '@main/providers/webscrape/shared'
const provider = createStationProvider({ timeoutMs: 40_000, headless: true, maxRetries: 1 })
try {
  const offers = await provider.search({ destination: 'Orcières Merlette', officialUrl: 'https://reservation.orcieres.com/', checkIn: '2027-02-06', checkOut: '2027-02-13', adults: 4, children: 0 } as never)
  console.log('offres:', offers.length, '| prix ferme:', offers.filter(o=>o.priceConfidence==='total_confirmed').length)
} catch (e) { console.log('ÉCHEC :', e instanceof Error ? e.message.split('\n')[0] : String(e)) }
await closeWebscrapeBrowser(); process.exit(0)
