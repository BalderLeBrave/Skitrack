import { extractLotIds, parseDetailPrice } from './parse'
import { locvacancesSiteOf } from './hosts'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

const listing = `
  <form action="/fr-FR/Lot/Detail" id="form-availability-137" method="post"></form>
  <form action="/fr-FR/Lot/Detail" id="form-availability-111" method="post"></form>
`
assert(extractLotIds(listing).join(',') === '137,111', 'lot ids')

const detail = `
<title>Pralognan La Vanoise - Chalet 14personnes - BAROSSA | Pralognan</title>
<div class="availability-rates rates">
  <div class="rate ml-1">1&#160;600 €</div>
</div>
<button id="book" class="btn btn-primary" type="submit">Réserver</button>
`
const parsed = parseDetailPrice(detail)
assert(parsed?.total === 1600, `total ${parsed?.total}`)
assert(parsed?.title.includes('BAROSSA'), `title ${parsed?.title}`)

const empty = parseDetailPrice('<title>x</title><div class="rate">900 €</div>')
assert(empty == null, 'sans bouton Réserver → pas de tarif')

assert(locvacancesSiteOf('https://www.reservationpralognan.fr/')?.id === 'pralognan', 'host fr')
assert(locvacancesSiteOf('reservationpralognan.locvacances.com')?.id === 'pralognan', 'host locvac')

console.log('ok locvacances-parse: lots 2 · BAROSSA 1600€')
