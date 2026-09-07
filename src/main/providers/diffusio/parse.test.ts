/**
 * Parse Diffusio — fixture SERP + fiche, pas de réseau.
 *
 *   npx esbuild src/main/providers/diffusio/parse.test.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/diffusio-parse-test.mjs --loader:.html=text && node node_modules/.cache/diffusio-parse-test.mjs
 */
import serp from './fixtures/serp-sample.html'
import fiche from './fixtures/fiche-TFO4609656.html'
import { parseFiche, parseSerpCards } from './extract'
import { diffusioSiteOf } from './hosts'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const site = diffusioSiteOf('https://www.sancy.com/hebergement/')
assert(site?.id === 'sancy', 'Sancy')
assert(diffusioSiteOf('sancy.com')?.origin === 'https://www.sancy.com', 'sans www')
assert(diffusioSiteOf('www.reservationpralognan.fr') == null, 'Pralognan n’est pas Diffusio')

const cards = parseSerpCards(String(serp))
assert(cards.length >= 8, `≥8 cartes, got ${cards.length}`)

const mus = cards.find((c) => c.id === '4609656')
assert(mus?.title.includes('Musardière') || mus?.title.includes('Musardiere'), mus?.title)
assert(mus?.guests === 8, `8 pers SERP got ${mus?.guests}`)
assert(/Mont-Dore/i.test(mus?.city ?? ''), mus?.city)
assert(mus?.href.includes('TFO4609656'), mus?.href)

const besse = cards.find((c) => c.id === '2800884')
assert(besse?.guests === 6, `6 pers got ${besse?.guests}`)

const extra = parseFiche(String(fiche))
assert(extra.bedrooms === 4, `4 chambres got ${extra.bedrooms}`)
assert(extra.guests === 8, `8 pers fiche got ${extra.guests}`)
assert(extra.weekMin === 850, `850 got ${extra.weekMin}`)
assert(extra.weekMax === 1347, `1347 got ${extra.weekMax}`)

console.log('ok diffusio parse', {
  cards: cards.length,
  ge8: cards.filter((c) => (c.guests ?? 0) >= 8).length,
  musardiere: extra
})
