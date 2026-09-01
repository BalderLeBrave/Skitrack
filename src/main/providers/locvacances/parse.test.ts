/**
 * Parse LocVacances — fixture getListe + getFiche, pas de réseau.
 *
 *   npx esbuild src/main/providers/locvacances/parse.test.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/locvacances-parse-test.mjs --loader:.html=text && node node_modules/.cache/locvacances-parse-test.mjs
 */
import liste from './fixtures/getListe-sample.html'
import fiche513 from './fixtures/getFiche-513.html'
import { parseFiche, parseListeCards } from './extract'
import { locvacancesSiteOf } from './hosts'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const site = locvacancesSiteOf('https://www.reservationpralognan.fr/reservation/resultats/')
assert(site?.id === 'pralognan', 'Pralognan')
assert(locvacancesSiteOf('reservationpralognan.fr')?.origin.includes('reservationpralognan'), 'sans www')
assert(locvacancesSiteOf('www.sancy.com') == null, 'Sancy n’est pas LocVacances')

const cards = parseListeCards(String(liste), site!.origin)
assert(cards.length === 12, `12 cartes, got ${cards.length}`)

const montagny = cards.find((c) => c.id === '111')
assert(montagny?.title.includes('MONTAGNY'), montagny?.title)
assert(montagny?.rooms === 6, `6 pièces got ${montagny?.rooms}`)
assert(montagny?.guests === 12, `12 pers got ${montagny?.guests}`)
assert(montagny?.total === 1300, `1300 got ${montagny?.total}`)
assert(montagny?.url.endsWith('/reservation/resultats/111/'), montagny?.url)

const ernest = cards.find((c) => c.id === '23')
assert(ernest?.rooms === 5 && ernest.guests === 10 && ernest.total === 390, JSON.stringify(ernest))

const montana = cards.find((c) => c.id === '165')
assert(montana?.rooms === 4 && montana.guests === 11, JSON.stringify(montana))

const montrachet = cards.find((c) => c.id === '513')
assert(montrachet?.rooms == null, 'Chalet sans pièces sur la carte')
assert(montrachet?.guests === 12 && montrachet.total === 1200, JSON.stringify(montrachet))

const extra = parseFiche(String(fiche513))
assert(extra.rooms === 5, `fiche 5 pièces got ${extra.rooms}`)
assert(extra.guests === 12, `fiche 12 pers got ${extra.guests}`)
assert(extra.lat === 45.381136, `lat ${extra.lat}`)
assert(extra.lon === 6.7177037, `lon ${extra.lon}`)

console.log('ok locvacances parse', {
  cards: cards.length,
  withRooms: cards.filter((c) => c.rooms != null).length,
  pass8p4ch: cards.filter((c) => (c.guests ?? 0) >= 8 && (c.rooms ?? 0) >= 5).length
})
