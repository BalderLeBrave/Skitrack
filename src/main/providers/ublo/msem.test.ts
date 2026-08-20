/**
 * Fusion liste + offres MSEM — fixture enregistrée, pas de réseau.
 *
 *   npx esbuild src/main/providers/ublo/msem.test.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/ublo-msem-test.mjs --loader:.json=json && node node_modules/.cache/ublo-msem-test.mjs
 */
import list from './fixtures/list-sample.json'
import offers from './fixtures/offers-sample.json'
import { mergeListAndOffers, lodgingUrl, type MsemListPayload, type MsemOffersMap } from './msem'
import { ubloSiteOf } from './hosts'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const site = ubloSiteOf('https://reservation.alpedhuez.com/')
assert(site?.channel === 'OT-125' && site.resort === 125, 'Alpe d’Huez')
assert(ubloSiteOf('www.saintefoy-reservation.com')?.channel === 'OT-595', 'Sainte-Foy')
assert(ubloSiteOf('reservation.saintfrancoislongchamp.com')?.channel === 'OT-SFL', 'SFL')
assert(ubloSiteOf('reservation.les2alpes.com') == null, '2 Alpes n’est pas Ublo')

const listings = mergeListAndOffers(
  list as MsemListPayload,
  offers as MsemOffersMap,
  site!,
  '2027-01-16',
  '2027-01-23',
  2,
  0
)

assert(listings.length === 3, `expected 3 priced, got ${listings.length}`)
const first = listings[0]!
assert(first.title.includes('Chez Nico'), `cheapest should be Chez Nico, got ${first.title}`)
assert(first.total === 583.19, `rounded price, got ${first.total}`)
assert(first.priceConfidence === 'total_confirmed', 'confidence')
assert(first.city && first.city.toUpperCase().includes('HUEZ'), `city ${first.city}`)
assert(first.image && first.image.startsWith('https://'), 'image')
assert(first.url.includes(first.slug), `url slug ${first.url}`)
assert(first.url.includes('from=2027-01-16'), 'dated from')
assert(first.url.includes('to=2027-01-23'), 'dated to')
assert(
  listings.every((l) => l.total > 0),
  'no zero prices'
)
assert(
  !listings.some((l) => l.title.includes('MAEVA')),
  'unpriced MAEVA excluded'
)

const url = lodgingUrl(site!, 'chalet-test', '2027-01-16', '2027-01-23', 4, 1)
assert(url.includes('adults=4') && url.includes('children=1'), url)

console.log(
  `ok ublo-msem: ${listings.length} offres — « ${first.title.slice(0, 40)} » ${first.total}€`
)
