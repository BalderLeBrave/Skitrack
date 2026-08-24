import { extractLotIds, parseDetailFacts, parseDetailPrice } from './parse'
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

// — Capacité et pièces, sur le HTML déjà en main —

const barossa = parseDetailFacts(detail)
assert(barossa.capacity === 14, `BAROSSA capacité ${barossa.capacity}`)

const deuxPieces = parseDetailFacts('<p>Appartement 2 pièces 6 personnes, plein sud.</p>')
assert(deuxPieces.capacity === 6, `capacité ${deuxPieces.capacity}`)
assert(deuxPieces.rooms === 2, `pièces ${deuxPieces.rooms}`)

const t3 = parseDetailFacts('<title>T3 - 8 couchages | Pralognan</title>')
assert(t3.rooms === 3, `type T3 → pièces ${t3.rooms}`)
assert(t3.capacity === 8, `couchages ${t3.capacity}`)

const troisChambres = parseDetailFacts('<div>Chalet avec 3 chambres</div>')
assert(troisChambres.bedrooms === 3, `chambres ${troisChambres.bedrooms}`)

const muet = parseDetailFacts('<title>Studio BAROSSA</title><div>Vue sur le glacier</div>')
assert(
  muet.capacity === null && muet.rooms === null && muet.bedrooms === null,
  `sans mention → tout null, reçu ${JSON.stringify(muet)}`
)

const invraisemblable = parseDetailFacts('<div>2026 personnes</div>')
assert(invraisemblable.capacity === null, `2026 personnes → rejeté, reçu ${invraisemblable.capacity}`)

// Le titre prime : le corps parle d'une annonce voisine.
const titrePrime = parseDetailFacts(
  '<title>Chalet 14personnes</title><div>Voir aussi : 4 personnes</div>'
)
assert(titrePrime.capacity === 14, `titre prioritaire, reçu ${titrePrime.capacity}`)

// Un `t3` de slug n'est pas un type de logement.
const slug = parseDetailFacts('<a href="/fr-FR/lot-t3-barossa">Chalet</a>')
assert(slug.rooms === null, `slug t3 ignoré, reçu ${slug.rooms}`)

assert(locvacancesSiteOf('https://www.reservationpralognan.fr/')?.id === 'pralognan', 'host fr')
assert(locvacancesSiteOf('reservationpralognan.locvacances.com')?.id === 'pralognan', 'host locvac')

console.log('ok locvacances-parse: lots 2 · BAROSSA 1600€ · 14 pers · faits 8 cas')
