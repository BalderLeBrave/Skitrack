/**
 * Parse Tourinsoft — fixture tsc-card, pas de réseau.
 *
 *   npx esbuild src/main/providers/tourinsoft/parse.test.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/tourinsoft-parse-test.mjs --loader:.html=text && node node_modules/.cache/tourinsoft-parse-test.mjs
 */
import serp from './fixtures/serp-sample.html'
import { parseListedCount, parseTscCards } from './extract'
import { tourinsoftSiteOf } from './hosts'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const site = tourinsoftSiteOf('https://lesangles.com/tous-les-hebergements/')
assert(site?.id === 'angles', 'Les Angles')
assert(tourinsoftSiteOf('www.lesangles.com')?.origin === 'https://lesangles.com', 'www')
assert(tourinsoftSiteOf('www.karellis.com') == null, 'Karellis n’est pas Tourinsoft')
assert(tourinsoftSiteOf('www.alpes-sudlocations.com') == null, 'Vars n’est pas Tourinsoft')

const html = String(serp)
const cards = parseTscCards(html)
assert(cards.length === 12, `12 cartes, got ${cards.length}`)
assert(parseListedCount(html) === 100, `compteur 100 got ${parseListedCount(html)}`)

const refuge = cards.find((c) => c.id === '92618')
assert(refuge?.title === 'REFUGE CAL CHALON', refuge?.title)
assert(refuge?.guests === 12, `12 pers got ${refuge?.guests}`)
assert(refuge?.bedrooms === 4, `4 ch got ${refuge?.bedrooms}`)
assert(refuge?.weekMin === 2230, `2230 got ${refuge?.weekMin}`)
assert(refuge?.url.includes('/hebergement/refuge-cal-chalon/'), refuge?.url)
assert(refuge?.kind === 'Meublés', refuge?.kind)

const cottage = cards.find((c) => c.id === '92623')
assert(cottage?.guests === 10 && cottage.bedrooms === 4 && cottage.weekMin === 1260, JSON.stringify(cottage))

const isard = cards.find((c) => c.id === '92647')
assert(isard?.guests === 460, `résidence 460 pers got ${isard?.guests}`)
assert(isard?.bedrooms == null, 'résidence sans chambres sur la carte')
assert(isard?.weekMin == null, 'résidence sans tarif sur la carte')

const ge8p4 = cards.filter((c) => (c.guests ?? 0) >= 8 && (c.bedrooms ?? 0) >= 4)
assert(ge8p4.length === 4, `4 × 8p/4ch page 1 got ${ge8p4.length}`)

console.log('ok tourinsoft parse', {
  cards: cards.length,
  listed: parseListedCount(html),
  ge8p4: ge8p4.map((c) => c.title)
})
