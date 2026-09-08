/**
 * Champs canoniques : 0 persisté n'est pas une mesure.
 *
 *   npm run canonical:test
 */

import {
  altitudeMOf,
  bedroomsOf,
  capacityMaxOf,
  distToLiftsMOf,
  distToRunsMOf,
  formatAltitude,
  formatLiftDistance,
  listingsLookSame,
  locationPrecisionOf,
  toCanonicalListing
} from './canonical'
import type { Lodging } from './lodgings'

function check(name: string, ok: boolean, extra?: unknown): void {
  if (!ok) {
    console.error('FAIL', name, extra ?? '')
    process.exitCode = 1
    return
  }
  console.log('ok', name)
}

const silent = { pers: 0, ch: 0, alt: 0, liftDist: 0, dist: 0 } as Lodging
check('capacité 0 → null', capacityMaxOf(silent) === null)
check('chambres 0 → null (pas un studio annoncé)', bedroomsOf(silent) === null)
check('studio 1 pièce → 0 chambre', bedroomsOf({ ch: 0, rooms: 1 } as Lodging) === 0)
check('3 chambres', bedroomsOf({ ch: 3, rooms: 4 } as Lodging) === 3)
check('altitude avant calcul → null', altitudeMOf(silent) === null)
check(
  'altitude IGN après calcul',
  altitudeMOf({ alt: 1720, accessComputed: true } as Lodging) === 1720
)
check('distance avant calcul → null', distToLiftsMOf(silent) === null)
check(
  '0 m des remontées après calcul n’est pas « inconnu »',
  distToLiftsMOf({ liftDist: 0, accessComputed: true } as Lodging) === 0
)
check('distance pistes avant calcul → null', distToRunsMOf(silent) === null)
check(
  'min piste/remontée après calcul',
  distToRunsMOf({ dist: 100, accessComputed: true } as Lodging) === 100
)

check('Airbnb GPS = approximate', locationPrecisionOf('airbnb', true) === 'approximate')
check('Booking GPS = exact', locationPrecisionOf('booking-web', true) === 'exact')
check('sans GPS = unknown', locationPrecisionOf('booking-web', false) === 'unknown')

const fuzzy = formatLiftDistance(250, true, (n) => String(n))
check('point flou < 1 km', fuzzy?.text === '< 1 km' && fuzzy.fuzzy === true)
const exact = formatLiftDistance(250, false, (n) => String(n))
check('point exact en mètres', exact?.text === '250 m' && exact.fuzzy === false)

const a = {
  name: 'Chalet Les Étoiles',
  lat: 45.297,
  lon: 6.58,
  src: 'Booking.com',
  srcConnector: 'booking-web',
  locPrecision: 'exact'
} as Lodging
const b = {
  name: 'Chalet Les Etoiles',
  lat: 45.2971,
  lon: 6.5801,
  src: 'Gîtes de France',
  srcConnector: 'gites',
  locPrecision: 'address'
} as Lodging
const c = { name: 'Appartement 12', lat: 45.297, lon: 6.58, src: 'Booking.com', locPrecision: 'exact' } as Lodging
const d = { name: 'Appartement 14', lat: 45.297, lon: 6.58, src: 'Gîtes de France', locPrecision: 'address' } as Lodging
check('homonymes à 20 m, sources distinctes, GPS exact → fusion', listingsLookSame(a, b) === true)
check('n° d’appartement distincts ne fusionnent pas', listingsLookSame(c, d) === false)

const air1 = {
  name: 'Charmant appartement',
  lat: 45.297,
  lon: 6.58,
  src: 'Airbnb',
  srcConnector: 'airbnb',
  locPrecision: 'approximate'
} as Lodging
const air2 = {
  name: 'Bel appartement',
  lat: 45.297,
  lon: 6.58,
  src: 'Airbnb',
  srcConnector: 'airbnb',
  locPrecision: 'approximate'
} as Lodging
check('deux Airbnb au même GPS flou ne fusionnent pas', listingsLookSame(air1, air2) === false)

const bk1 = {
  name: 'Hôtel Le Sherpa Chambre Double',
  lat: 45.3,
  lon: 6.6,
  src: 'Booking.com',
  srcConnector: 'booking-web',
  locPrecision: 'exact'
} as Lodging
const bk2 = {
  name: 'Hôtel Le Sherpa Suite',
  lat: 45.3,
  lon: 6.6,
  src: 'Booking.com',
  srcConnector: 'booking-web',
  locPrecision: 'exact'
} as Lodging
check('deux chambres Booking du même hôtel ne fusionnent pas', listingsLookSame(bk1, bk2) === false)

const abr = {
  name: 'Chalet Les Étoiles',
  lat: 45.297,
  lon: 6.58,
  src: 'Abritel',
  srcConnector: 'abritel',
  locPrecision: 'approximate'
} as Lodging
check('Abritel (GPS flou) ne fusionne pas avec Booking', listingsLookSame(a, abr) === false)

const card = toCanonicalListing({
  ...silent,
  id: 1,
  name: 'Duplex',
  src: 'Airbnb',
  srcConnector: 'airbnb',
  pers: 6,
  ch: 2,
  total: 2100,
  note: '4,8',
  url: 'https://www.airbnb.fr/rooms/123',
  lat: 45.3,
  lon: 6.6,
  locPrecision: 'approximate',
  accessComputed: true,
  alt: 1720,
  altSource: 'ign',
  liftDist: 250
} as Lodging)
check('canonical source airbnb_scraper', card.source === 'airbnb_scraper')
check('canonical n’invente pas l’altitude marketing', card.altitude_m === 1720 && card.altitude_source === 'ign')
check('canonical capacité 6', card.capacity_max === 6)
check('canonical chambres 2', card.bedrooms === 2)
check('canonical distance remontées', card.dist_to_nearest_lift_m === 250)
check('Airbnb note /5', card.rating_scale === 5)

const booking = toCanonicalListing({
  ...silent,
  id: 2,
  name: 'Hôtel',
  src: 'Booking.com',
  srcConnector: 'booking-web',
  pers: 4,
  ch: 0,
  note: '8,4',
  accessComputed: true,
  alt: 1850,
  altSource: 'ign',
  liftDist: 900,
  locPrecision: 'approximate',
  lat: 45.3,
  lon: 6.6
} as Lodging)
check('Booking note /10', booking.rating_scale === 10 && booking.rating === 8.4)
check('Booking chambres inconnues → null, pas 0', booking.bedrooms === null)
check('ligne UI : mêmes clés que Airbnb', Object.keys(card).join() === Object.keys(booking).join())

const ign = formatAltitude(1720, 'ign', false, (n) => String(n))
check('altitude IGN affichée', ign?.text === '1720 m' && ign.source === 'IGN')
const fuzzyAlt = formatAltitude(1720, 'ign', true, (n) => String(n))
check('altitude floue préfixée ~', fuzzyAlt?.text === '~1720 m')

if (process.exitCode) process.exit(1)
