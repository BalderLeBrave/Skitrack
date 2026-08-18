/**
 * Disponibilité : ce qui est prouvé, ce qui ne l'est pas.
 *
 * Le cas qui a motivé tout ce module est le cinquième : une annonce Airbnb
 * listée sans prix. Elle s'affichait comme réservable et ouvrait « Ces dates ne
 * sont pas disponibles ».
 *
 *   npm run avail:test
 */

import { availabilityOf, isBookable, isDoorway } from './lodgingAvailability'
import type { Lodging } from './lodgings'

const STAY = { checkIn: '2027-02-07', checkOut: '2027-02-14' }

/** Squelette d'annonce : seuls les champs du verdict comptent ici. */
function lodging(over: Partial<Lodging>): Lodging {
  return {
    id: 1,
    name: 'Annonce',
    type: 'Import',
    pers: 0,
    ch: 0,
    m2: null,
    note: '—',
    avis: 0,
    dist: 0,
    walk: 1,
    den: 0,
    skiIn: false,
    src: 'Airbnb',
    pp: 0,
    lift: '',
    liftDist: 0,
    photo: '',
    annul: false,
    total: 0,
    alt: 1800,
    stock: 0,
    url: 'https://www.airbnb.fr/rooms/12345',
    ...over
  } as Lodging
}

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

console.log('\nDisponibilité des annonces\n')

console.log('1. Ce qui est confirmé')
const priced = lodging({ total: 2480, priceCheckIn: STAY.checkIn, priceCheckOut: STAY.checkOut })
check('tarifée pour exactement ces dates → confirmée', availabilityOf(priced, STAY).status === 'confirmed')
check('donc affichable comme réservable', isBookable(priced, STAY))

console.log('\n2. Ce qui ne l’est pas')
const unpriced = lodging({ total: 0 })
const verdict = availabilityOf(unpriced, STAY)
check('listée sans prix → non confirmée', verdict.status === 'unconfirmed', verdict)
check('motif : sans tarif à ces dates', verdict.reason === 'unpriced')
check('donc pas affichable comme réservable', !isBookable(unpriced, STAY))

const otherDates = lodging({ total: 2480, priceCheckIn: '2027-01-24', priceCheckOut: '2027-01-31' })
check(
  'tarifée pour d’autres dates → non confirmée',
  availabilityOf(otherDates, STAY).status === 'unconfirmed' &&
    availabilityOf(otherDates, STAY).reason === 'other_dates'
)

const gone = lodging({
  total: 2480,
  priceCheckIn: STAY.checkIn,
  priceCheckOut: STAY.checkOut,
  missingSince: { checkIn: STAY.checkIn, checkOut: STAY.checkOut, at: 0 }
})
check('absente du dernier relevé → « gone », malgré un prix relevé', availabilityOf(gone, STAY).status === 'gone')

console.log('\n3. Ce qui n’est pas jugé')
const osm = lodging({
  src: 'OSM → Airbnb',
  url: 'https://www.airbnb.fr/s/Val-Thorens--France/homes?checkin=2027-02-07'
})
check('carte OpenStreetMap (URL de recherche) → non jugée', availabilityOf(osm, STAY).status === 'unrated')
check('et reconnue comme porte d’entrée', isDoorway(osm))
check('elle reste affichable', isBookable(osm, STAY))

const manual = lodging({ src: 'Import manuel', total: 1900 })
check('saisie à la main → non jugée', availabilityOf(manual, STAY).status === 'unrated')
check('elle ne disparaît pas sous le filtre', isBookable(manual, STAY))

const simulated = lodging({ url: undefined, total: 2000 })
check('offre sans URL → non jugée', availabilityOf(simulated, STAY).status === 'unrated')
check('une annonce Airbnb n’est pas une porte d’entrée', !isDoorway(priced))

console.log('\n4. Changement de dates')
check(
  'la même annonce redevient non confirmée si le séjour change',
  availabilityOf(priced, { checkIn: '2027-02-21', checkOut: '2027-02-28' }).status === 'unconfirmed'
)
check(
  'et l’absence relevée pour d’autres dates ne la condamne pas',
  availabilityOf(
    lodging({
      total: 2480,
      priceCheckIn: STAY.checkIn,
      priceCheckOut: STAY.checkOut,
      missingSince: { checkIn: '2027-01-24', checkOut: '2027-01-31', at: 0 }
    }),
    STAY
  ).status === 'confirmed'
)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log('\nDisponibilité : tous les cas passent.')
