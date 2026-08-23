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
assert(ubloSiteOf('reservation.villarddelans-correnconenvercors.com')?.resort === 30002, 'Villard-de-Lans')
assert(ubloSiteOf('isola2000.com')?.channel === 'ISOLA', 'Isola')
assert(ubloSiteOf('www.valberg.com')?.resort === 665, 'Valberg')
assert(ubloSiteOf('www.montclar.com')?.channel === 'OT-276', 'Montclar')
assert(ubloSiteOf('www.paysdesecrins.com')?.channel === 'PDE', 'Écrins')
assert(ubloSiteOf('www.leman-mountains-explore.com')?.channel === 'LEMAN_MOUNTAINS', 'Léman')
assert(ubloSiteOf('reservation.villard-reculas.com')?.resort === 702, 'Villard-Reculas')
assert(ubloSiteOf('www.oz-en-oisans.com')?.channel === 'OT-523' && ubloSiteOf('oz-en-oisans.com')?.resort === 523, 'Oz-en-Oisans')
assert(ubloSiteOf('www.saintgervais.com')?.channel === 'OT-569' && ubloSiteOf('saintgervais.com')?.resort === 569, 'Saint-Gervais')
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
// Le segment de fiche : sans lui, chaque annonce ouvrait un 404. Voir
// `LISTING_SEGMENT` dans msem.ts — relevé sur les sitemap des trois centrales.
assert(
  url.startsWith('https://reservation.alpedhuez.com/hebergements/chalet-test?'),
  `chemin de fiche inattendu : ${url}`
)
// Sainte-Foy publie sous `/fr` : le préfixe précède le segment, il ne le
// remplace pas.
const sfSite = ubloSiteOf('https://www.saintefoy-reservation.com/')
assert(sfSite != null, 'site Sainte-Foy connu')
assert(
  lodgingUrl(sfSite!, 'chalet-test', '2027-01-16', '2027-01-23', 2, 0).startsWith(
    'https://www.saintefoy-reservation.com/fr/hebergements/chalet-test?'
  ),
  'préfixe de langue conservé devant le segment de fiche'
)

console.log(
  `ok ublo-msem: ${listings.length} offres — « ${first.title.slice(0, 40)} » ${first.total}€`
)
