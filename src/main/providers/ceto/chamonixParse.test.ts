/**
 * Tests de parse HTML Orchestra — fixture SERP enregistrée (pas de réseau).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSerpHtmlForTest } from './chamonixParse.ts'

const fixture = readFileSync(
  join(process.cwd(), 'src/main/providers/ceto/fixtures/megeve-serp-sample.html'),
  'utf8'
)

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const listings = parseSerpHtmlForTest(
  fixture,
  '2027-01-16',
  '2027-01-23',
  'https://megeve-booking.com',
  null
)

assert(listings.length >= 1, `expected ≥1 listing, got ${listings.length}`)
const first = listings[0]!
assert(first.title && first.title.length > 3, `title missing: ${first.title}`)
assert(first.total != null && first.total > 0, `price missing: ${first.total}`)
assert(first.url && first.url.includes('product'), `url odd: ${first.url}`)
assert(first.image && /^https?:\/\//.test(first.image), `image missing: ${first.image}`)
assert(first.city && first.city.length > 1, `city missing: ${first.city}`)
assert(
  first.priceConfidence === 'total_confirmed' || first.priceConfidence === 'partial',
  'confidence'
)

console.log(
  `ok ceto-parse: ${listings.length} listings — « ${first.title.slice(0, 40)} » ${first.total}€ ${first.city}`
)
