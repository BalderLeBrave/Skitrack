import { createStationProvider } from '@main/providers/station/station'
import { closeWebscrapeBrowser } from '@main/providers/webscrape/shared'

const TARGETS: Array<[string, string]> = [
  ['Les Gets', 'https://reservation.lesgets.com/'],
  ['Orcières Merlette', 'https://reservation.orcieres.com/'],
  ['Les Saisies', 'https://reservation.lessaisies.com/'],
  ['Les Menuires', 'https://fr.locationlesmenuires.com/'],
  ['Val Thorens', 'https://reservation.valthorens.com/']
]
const provider = createStationProvider({ timeoutMs: 40_000, headless: true, maxRetries: 1 })
for (const [dest, url] of TARGETS) {
  const t0 = Date.now()
  try {
    const offers = await provider.search({
      destination: dest, officialUrl: url,
      checkIn: '2027-02-06', checkOut: '2027-02-13', adults: 4, children: 0
    } as never)
    const conf = offers.filter((o) => o.priceConfidence === 'total_confirmed').length
    console.log(`${url} → ${offers.length} offre(s), ${conf} prix ferme, ${Math.round((Date.now()-t0)/1000)}s`)
    for (const o of offers.slice(0, 2)) console.log(`     · ${o.title} | ${o.totalPrice} €`)
  } catch (e) {
    console.log(`${url} → ÉCHEC (${Math.round((Date.now()-t0)/1000)}s) : ${e instanceof Error ? e.message : String(e)}`)
  }
}
await closeWebscrapeBrowser()
process.exit(0)
