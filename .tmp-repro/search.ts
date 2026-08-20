import { buildEngine, aggregateResults } from '../src/main/providers/index'
import { bookingCentralOf, stationNameOf } from '../src/renderer/src/data/stations'
import { domainRadiusKm } from '../src/shared/geo'

const domain = process.argv[2] ?? 'Les 2 Alpes'
const lat = Number(process.argv[3])
const lon = Number(process.argv[4])
const km = Number(process.argv[5])
const engine = buildEngine({ enableWebScrape: true, vault: () => undefined, mcpSources: null })

const destination = stationNameOf(domain) || domain
const officialUrl = bookingCentralOf(domain) ?? undefined
console.log('destination =', destination, '| officialUrl =', officialUrl, '| rayon =', domainRadiusKm(km), 'km')

const agg = await aggregateResults(engine, {
  destination,
  officialUrl,
  latitude: Number.isFinite(lat) ? lat : undefined,
  longitude: Number.isFinite(lon) ? lon : undefined,
  radiusMeters: Number.isFinite(km) ? domainRadiusKm(km) * 1000 : undefined,
  checkIn: '2027-02-06',
  checkOut: '2027-02-13',
  adults: 4,
  children: 0
} as never)
for (const o of agg.outcomes) {
  console.log(` - ${o.provider}: ${o.results.length} résultat(s), erreur=${o.error ?? '—'} (${o.elapsedMs} ms)`)
  for (const r of o.results.slice(0, 3)) console.log(`     · ${r.title} | ${r.totalPrice ?? '—'} | ${r.latitude ?? '?'},${r.longitude ?? '?'}`)
}
console.log('total listings:', agg.totalListings)
process.exit(0)
