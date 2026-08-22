/**
 * Parse Open System — fixtures HTML + JSONP + etape-rest/vueinfo, pas de réseau.
 *
 *   npx esbuild src/main/providers/opensystem/parse.test.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/os-parse-test.mjs --loader:.html=text --loader:.js=text && node node_modules/.cache/os-parse-test.mjs
 */
import html from './fixtures/listing-sample.html'
import jsonp from './fixtures/jsonp-sample.js'
import etape from './fixtures/etape-sample.js'
import vueinfo from './fixtures/vueinfo-sample.js'
import { parseListingHtml, parseJsonpList, parseOpenSystemPayload, parseEtapeOffers, parseEtapeMeta, parseVueInfo, mergeEtapeAndVue } from './parse'
import { opensystemSiteOf } from './hosts'
import { etapeRestQuery } from './extract'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

assert(opensystemSiteOf('https://reservation.la-toussuire.com/')?.login === 'latoussuire', 'Toussuire')
assert(opensystemSiteOf('reservation.ledevoluy.com')?.vueId === 1755, 'Dévoluy vue')
assert(opensystemSiteOf('www.valmorel.com')?.vueId === 1423, 'Valmorel vue')
assert(opensystemSiteOf('reservation.alpedhuez.com') == null, 'Huez n’est pas OS')
assert(opensystemSiteOf('reservation.ax-ski.com')?.vueId === 1861, 'Ax vue')
assert(opensystemSiteOf('reservation.le-corbier.com')?.vueId === 1814, 'Corbier vue')
assert(opensystemSiteOf('reservation.saintsorlindarves.com')?.login === 'saintsorlindarves', 'Saint-Sorlin login')
assert(opensystemSiteOf('reservation.haute-maurienne-vanoise.com')?.vueId === 1115, 'HMV vue')
assert(opensystemSiteOf('www.labresse.net')?.vueId === 1736, 'La Bresse WP vue')
assert(opensystemSiteOf('reservation.n-py.com')?.vueId === 1448, 'N-PY vue')

const opts = {
  origin: 'https://reservation.la-toussuire.com',
  from: '2027-01-16',
  to: '2027-01-23'
}

const fromHtml = parseListingHtml(String(html), opts)
assert(fromHtml.length === 2, `html expected 2, got ${fromHtml.length}`)
assert(fromHtml[0]!.title === 'Chalet Les Aiguilles', fromHtml[0]!.title)
assert(fromHtml[0]!.total === 1248, `1248 got ${fromHtml[0]!.total}`)
assert(fromHtml[0]!.lat === 45.254, 'lat')
assert(fromHtml[1]!.total === 890, `890 got ${fromHtml[1]!.total}`)
assert(
  fromHtml.every((l) => l.url.includes('from=2027-01-16')),
  'dated html url'
)
assert(
  !fromHtml.some((l) => /Sans tarif/i.test(l.title)),
  'unpriced excluded'
)

const fromJsonp = parseJsonpList(String(jsonp), opts)
assert(fromJsonp.length === 2, `jsonp expected 2, got ${fromJsonp.length}`)
const thabor = fromJsonp.find((l) => l.id === 'M-2201')
assert(thabor?.total === 1560.5, `1560.5 got ${thabor?.total}`)
assert(thabor?.city === 'La Toussuire', thabor?.city)
assert(fromJsonp.some((l) => l.title === 'Chalet du Col' && l.total === 2100), 'price field')
assert(
  !fromJsonp.some((l) => l.title.includes('hors dates')),
  'prix 0 excluded'
)

const auto = parseOpenSystemPayload(String(jsonp), opts)
assert(auto.length === 2, 'auto jsonp')

const q = etapeRestQuery({
  login: 'valmorel',
  vueId: 1423,
  from: '2026-12-19',
  nights: 7,
  adults: 2,
  children: 0
})
assert(
  q === '|0|20|valmorel|||1423|0|0||2|7|2026-12-19|2||*|0|2||*',
  `pipe ${q}`
)
const empty = parseJsonpList(
  'cb({"rqBlockIndex":0,"rsBlockIndex":-1,"total":0,"resume":{"daterech":"samedi 19 décembre 2026","nbadultes":2,"nbnuitees":7},"items":[]})',
  opts
)
assert(empty.length === 0, 'empty etape-rest')

const offers = parseEtapeOffers(String(etape))
assert(offers.length === 2, `etape priced+dispo, got ${offers.length}`)
assert(offers[0]!.cle === 'OSMB-42037-4' && offers[0]!.prix === 1248, 'first offer')
assert(!offers.some((o) => o.cle === 'OSMB-OFF'), 'dispo 0 excluded')
assert(!offers.some((o) => o.cle === 'OSMB-ZERO'), 'prix 0 excluded')
const meta = parseEtapeMeta(String(etape))
assert(meta.conversationId === 'cid-1' && meta.more === true && meta.total === 3, 'meta')

const vue = parseVueInfo(String(vueinfo))
assert(vue.length === 3, `vueinfo 3, got ${vue.length}`)
assert(vue[0]!.title === 'Chalet Le Loup Blanc', vue[0]!.title)

const merged = mergeEtapeAndVue(offers, vue, opts)
assert(merged.length === 2, `merged 2, got ${merged.length}`)
assert(merged[0]!.title === 'Studio des Pistes' && merged[0]!.total === 890, 'cheapest first')
assert(merged[1]!.title === 'Chalet Le Loup Blanc' && merged[1]!.total === 1248, 'loup')
assert(merged[1]!.lat === 45.256, 'merged lat')
assert(merged.every((l) => l.url.includes('cle=') && l.url.includes('from=2027-01-16')), 'dated cle url')
const untitled = mergeEtapeAndVue(offers, [], opts)
assert(untitled.length === 2, `sans vueinfo on garde le prix, got ${untitled.length}`)
assert(
  untitled.every((l) => l.title.startsWith('Hébergement ') && l.priceConfidence === 'total_confirmed'),
  'titre = clé, prix daté'
)

console.log(
  `ok opensystem-parse: html ${fromHtml.length} · jsonp ${fromJsonp.length} · etape ${merged.length} — « ${merged[0]!.title} » ${merged[0]!.total}€`
)
