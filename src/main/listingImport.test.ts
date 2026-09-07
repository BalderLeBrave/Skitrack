/**
 * Import d'annonce : JSON-LD, hash, prix, geo, pas d'invention.
 *
 *   npm run listing:test
 */

import { canonicalizeUrl } from '@shared/listingCanon'
import {
  calculateCompleteness,
  differenceInDays,
  identifyMissingCriticalFields,
  normalizeOffer,
  resolveFetchStrategy
} from '@shared/listingImport'
import { parseJsonLdText, parseMetadata } from '@shared/normalizeJsonLd'
import { generateListingHash, generateOfferHash } from './listingHash'
import lodgingBusiness from './providers/webscrape/fixtures/import/lodging-business-geo.json'
import productOffer from './providers/webscrape/fixtures/import/product-offer.json'
import aggregateOffer from './providers/webscrape/fixtures/import/aggregate-offer-lowprice.json'
import atGraph from './providers/webscrape/fixtures/import/at-graph.json'
import pricePerWeek from './providers/webscrape/fixtures/import/price-per-week.json'
import addressNoGeo from './providers/webscrape/fixtures/import/address-no-geo.json'
import opengraphOnly from './providers/webscrape/fixtures/import/opengraph-only.html'
import noMeta from './providers/webscrape/fixtures/import/no-meta.html'

function htmlLd(data: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(data)}</script></head><body></body></html>`
}

let failed = 0
function check(label: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    console.log(`ok  ${label}`)
    return
  }
  failed++
  console.error(`FAIL  ${label}`, extra ?? '')
}

const stay6 = { checkIn: '2027-02-06', checkOut: '2027-02-12', guests: 8 }
const stay5 = { checkIn: '2027-02-06', checkOut: '2027-02-11', guests: 8 }
const stay7 = { checkIn: '2027-02-06', checkOut: '2027-02-13', guests: 8 }
const feesOk = { isComplete: true as const, source: 'jsonld' as const }

check('6 nuits (6→12 fév.)', differenceInDays('2027-02-12', '2027-02-06') === 6)
check('5 nuits', differenceInDays('2027-02-11', '2027-02-06') === 5)
check('7 nuits', differenceInDays('2027-02-13', '2027-02-06') === 7)

const lodging = parseMetadata(htmlLd(lodgingBusiness), 'https://ex.com/chalet')
check('LodgingBusiness titre', lodging.title?.value === 'Chalet des Écrins')
check('LodgingBusiness geo exact', lodging.geo?.precision === 'exact' && lodging.geo.value.lat === 44.9321)
check('LodgingBusiness prix', lodging.priceBase?.value === 1890 && lodging.priceBase.isFrom === false)
check('LodgingBusiness guests', lodging.guests?.value === 8)
check('LodgingBusiness rooms', lodging.rooms?.value === 4)

const product = parseJsonLdText(JSON.stringify(productOffer), 'https://ex.com/appart')
check('Product + Offer nuit', product.priceBase?.value === 210 && product.priceBase.unit === 'night')
const nightOffer = normalizeOffer({ ...product, fees: feesOk }, stay6)
check('€/nuit × 6 nuits, pas ×7', nightOffer.priceTotal === 210 * 6, nightOffer)

const agg = parseJsonLdText(JSON.stringify(aggregateOffer), 'https://ex.com/studio')
check('AggregateOffer.lowPrice → isFrom', agg.priceBase?.isFrom === true && agg.priceBase.value === 90)
const fromOffer = normalizeOffer({ ...agg, fees: feesOk }, stay7)
check('prix d’appel : total null', fromOffer.priceTotal === null && fromOffer.flags.includes('price_is_from'))
check('prix d’appel non comparable', fromOffer.isComparable === false)

const graph = parseJsonLdText(JSON.stringify(atGraph), 'https://ex.com/graph')
check('@graph Apartment', graph.title?.value === 'Deux-pièces front de neige' && graph.geo?.value.lat === 45.297)
check('@graph rooms', graph.rooms?.value === 2)

const week = parseJsonLdText(JSON.stringify(pricePerWeek), 'https://ex.com/gite')
check('€/semaine unité', week.priceBase?.unit === 'week' && week.priceBase.value === 980)
const weekBad = normalizeOffer({ ...week, fees: feesOk }, stay5)
check('€/semaine + 5 nuits → NULL', weekBad.priceTotal === null && weekBad.flags.includes('unit_mismatch'))
const weekOk = normalizeOffer({ ...week, fees: feesOk }, stay7)
check('€/semaine + 7 nuits', weekOk.priceTotal === 980)

const noGeo = parseJsonLdText(JSON.stringify(addressNoGeo), 'https://ex.com/maison')
check('adresse sans geo', noGeo.addressText?.value?.includes('Valloire') === true && noGeo.geo == null)
check('sans geo : pas de position', (noGeo.geo?.precision ?? 'none') === 'none')

const og = parseMetadata(opengraphOnly, 'https://ex.com/a/b')
check('Open Graph titre', og.title?.value === 'Chalet Vue Glacier' && og.title.source === 'opengraph')
check('Open Graph prix', og.priceBase?.value === 1650 && og.priceBase.source === 'opengraph')
check('canonical', og.canonicalUrl?.value === 'https://ex.com/a/b')

const bare = parseMetadata(noMeta, 'https://ex.com/muet')
check('sans méta : pas de prix', bare.priceBase == null)
check('sans méta : score bas', bare.completenessScore < 60)
check(
  'sans méta : champs critiques manquants',
  identifyMissingCriticalFields(bare).includes('priceBase') && identifyMissingCriticalFields(bare).includes('guests')
)
const bareOffer = normalizeOffer(bare, stay7)
check('sans méta : total null, rien d’inventé', bareOffer.priceTotal === null)

check('score sans titre ni prix < 60', calculateCompleteness({}) < 60)

const a = generateListingHash('https://www.ex.com/a/b?utm_source=x#frag')
const b = generateListingHash('https://ex.com/a/b/')
check('Test 1 : utm + frag + www + slash = même listing_hash', a === b, { a, b })

const mobile = generateListingHash('http://m.airbnb.com/a/b')
const desk = generateListingHash('https://airbnb.com/a/b/')
check('Test 2 : alias mobile connu', mobile === desk, { mobile, desk })

const listing = generateListingHash('https://ex.com/a/b')
const o4 = generateOfferHash(listing, '2027-02-06', '2027-02-13', 4)
const o6 = generateOfferHash(listing, '2027-02-06', '2027-02-13', 6)
const o4b = generateOfferHash(listing, '2027-02-06', '2027-02-13', 4)
check('Test 3 : dates absentes du listing_hash', listing === generateListingHash('https://ex.com/a/b?check_in=2027-02-06'))
check('Test 4 : 4 vs 6 guests → deux offer_hash', o4 !== o6 && o4 === o4b)

const sameStay = generateOfferHash(listing, '2027-02-06', '2027-02-13', 8)
check('Test 5 : même listing+dates+guests = une offer (hash identique)', sameStay === generateOfferHash(listing, '2027-02-06', '2027-02-13', 8))

const kept = canonicalizeUrl('https://ex.com/a/b?id=1&utm=z', ['id'])
check('Test 6 : keepQueryKeys id', kept.query === '?id=1' && kept.host === 'ex.com' && kept.path === '/a/b', kept)
const h1 = generateListingHash('https://ex.com/a/b?id=1&utm=z', ['id'])
const h2 = generateListingHash('https://ex.com/a/b?id=1', ['id'])
const h3 = generateListingHash('https://ex.com/a/b?id=2', ['id'])
check('Test 6 : id conservé dans le hash', h1 === h2 && h1 !== h3)

check('429 → retry', resolveFetchStrategy({ status: 'rate_limited' }, 0) === 'auto_retry')
check('429 ×3 → manuel', resolveFetchStrategy({ status: 'rate_limited' }, 3) === 'user_manual_entry')
check('403 → manuel', resolveFetchStrategy({ status: 'access_denied' }, 0) === 'user_manual_entry')
check('partial → formulaire', resolveFetchStrategy({ status: 'partial_content' }, 0) === 'partial_with_form')
check('success → proceed', resolveFetchStrategy({ status: 'success' }, 0) === 'proceed')

if (failed > 0) {
  console.error(`\n${failed} échec(s)`)
  process.exit(1)
}
console.log('\nlisting import : tous les points d’acceptation exercés.')
