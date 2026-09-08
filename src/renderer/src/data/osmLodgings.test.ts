/**
 * Cartes OpenStreetMap : GPS exact, pas de tarif, pas de doublon d'un relevé.
 *
 *   npm run osm:test
 */
import { isDoorway } from './lodgingAvailability'
import type { Lodging } from './lodgings'
import {
  keepUncoveredOsmCards,
  OSM_SOURCE,
  osmCardIsCovered,
  osmRoomsAsBedrooms,
  toOsmCard,
  type OsmSearchParams
} from './osmLodgings'
import type { OsmLodgingResult } from '@shared/ipc-contract'

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

const params: OsmSearchParams = {
  south: 45.0,
  west: 6.1,
  north: 45.05,
  east: 6.15,
  destination: 'Les 2 Alpes',
  domainId: 42
}

const hit = (over: Partial<OsmLodgingResult> = {}): OsmLodgingResult => ({
  name: 'Chalet les Copains',
  type: 'Chalet',
  lat: 45.0105,
  lon: 6.1225,
  url: 'https://www.airbnb.fr/s/Chalet-les-Copains--Les-2-Alpes/homes',
  source: 'OpenStreetMap',
  ...over
})

console.log('\nCartes OpenStreetMap\n')

console.log('1. Mapping : GPS exact, pas de prix, tags lus')
const card = toOsmCard(hit({ rooms: 3, beds: 8, capacity: 8 }), params)
check('carte créée', card != null)
check('source OpenStreetMap', card?.src === OSM_SOURCE)
check('connecteur osm', card?.srcConnector === 'osm')
check('GPS exact', card?.locPrecision === 'exact' && card.lat === 45.0105)
check('pas de tarif inventé', card?.total === 0)
check('capacité OSM', card?.pers === 8)
check('3 pièces → 3 chambres', card?.ch === 3)
check('porte d’entrée Airbnb', card != null && isDoorway(card))
check('(0, 0) n’est pas un logement', toOsmCard(hit({ lat: 0, lon: 0 }), params) == null)
check('sans nom → rien', toOsmCard(hit({ name: '  ' }), params) == null)

console.log('\n2. Studio OSM : 1 pièce = 0 chambre')
check('1 pièce → studio', JSON.stringify(osmRoomsAsBedrooms(1)) === JSON.stringify({ ch: 0, rooms: 1 }))
check('3 pièces → 3 chambres', JSON.stringify(osmRoomsAsBedrooms(3)) === JSON.stringify({ ch: 3 }))
check('tag absent → silence', JSON.stringify(osmRoomsAsBedrooms(undefined)) === JSON.stringify({ ch: 0 }))
const studio = toOsmCard(hit({ rooms: 1, beds: 4 }), params)
check('studio : 0 ch, 1 pièce, 4 pers', studio?.ch === 0 && studio.rooms === 1 && studio.pers === 4)

console.log('\n3. Pas de doublon d’un relevé déjà là')
const osm = toOsmCard(hit(), params)!
const booking = {
  id: 1,
  name: 'Chalet les Copains',
  lat: 45.0106,
  lon: 6.1226,
  locPrecision: 'exact',
  src: 'Booking.com',
  srcConnector: 'booking',
  pers: 8,
  ch: 3,
  total: 2100
} as Lodging
check('même nom, 20 m, GPS exact → couvert', osmCardIsCovered([booking], osm) === true)

const airbnb = {
  ...booking,
  src: 'Airbnb',
  srcConnector: 'airbnb',
  locPrecision: 'approximate',
  lat: 45.0120,
  lon: 6.1230,
  total: 1800
} as Lodging
check('Airbnb flou, même nom dans 200 m → couvert (pas une 2ᵉ vignette)', osmCardIsCovered([airbnb], osm) === true)

const other = {
  ...booking,
  name: 'Résidence Le Hameau des Arolles',
  lat: 45.0156,
  lon: 6.1230
} as Lodging
check('voisin au nom différent → carte OSM gardée', osmCardIsCovered([other], osm) === false)

const kept = keepUncoveredOsmCards([booking, other], [osm])
check('le relevé Booking avale Copains, pas le Hameau', kept.length === 0)

const orphan = toOsmCard(hit({ name: 'Chalet Edelweiss', lat: 45.02, lon: 6.13, url: 'https://www.airbnb.fr/s/Edelweiss/homes' }), params)!
check(
  'bâtiment OSM sans équivalent → vignette',
  keepUncoveredOsmCards([booking], [osm, orphan]).map((c) => c.name).join() === 'Chalet Edelweiss'
)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log('\nCartes OpenStreetMap : tous les cas passent.')
