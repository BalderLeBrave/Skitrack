/**
 * Le rerelevé n'écrit que du mesuré, et ne relève que ce qui est relevable.
 *
 *   npm run refresh:test
 */

import {
  backoffMs,
  groupForRefresh,
  isDue,
  isRefreshable,
  recordAttempts,
  matchLodging,
  measuredReading,
  perPersonOf,
  readingsForGroup,
  MIN_REFRESH_INTERVAL_MS,
  type AttemptStore
} from './priceRefresh'
import type { Lodging } from './lodgings'
import type { PriceReading, TrackedItem } from '@/state/appState'

let failures = 0
let total = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  total++
  console.log(
    `  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`
  )
  if (!condition) failures++
}

const NOW = 1_700_000_000_000

function item(over: Partial<TrackedItem> = {}): TrackedItem {
  return {
    key: 'Studio Choucas|Booking.com',
    name: 'Studio Choucas',
    src: 'Booking.com',
    total: 1200,
    pp: 300,
    domain: 'La Plagne',
    url: 'https://example.test/a',
    domainId: 42,
    checkIn: '2027-02-07',
    checkOut: '2027-02-14',
    adults: 2,
    children: 2,
    ...over
  }
}

function lodging(over: Partial<Lodging> = {}): Lodging {
  return {
    id: 1,
    name: 'Studio Choucas',
    type: '',
    pers: 4,
    ch: 0,
    m2: null,
    total: 1150,
    pp: 0,
    src: 'Booking.com',
    url: 'https://example.test/a',
    priceConfidence: 'total_confirmed',
    ...over
  } as Lodging
}

console.log('\n1. Un suivi n’est relevable que s’il sait à quoi il se rapporte')
check('suivi complet', isRefreshable(item()) === true)
check('sans URL', isRefreshable(item({ url: undefined })) === false)
check('sans domaine', isRefreshable(item({ domainId: undefined })) === false)
check('sans date d’arrivée', isRefreshable(item({ checkIn: undefined })) === false)
check('sans date de départ', isRefreshable(item({ checkOut: undefined })) === false)

console.log('\n2. Cadence — un relevé par heure')
const empty: Record<string, PriceReading[]> = {}
const noAttempts: AttemptStore = {}
check('aucun point : à relever', isDue('k', empty, noAttempts, NOW) === true)
const fresh = { k: [{ t: NOW - 60_000, v: 1200, o: 'measured' as const }] }
check('point d’il y a une minute : pas encore', isDue('k', fresh, noAttempts, NOW) === false)
const old = { k: [{ t: NOW - MIN_REFRESH_INTERVAL_MS - 1, v: 1200, o: 'measured' as const }] }
check('point d’il y a plus d’une heure : à relever', isDue('k', old, noAttempts, NOW) === true)
check('pile à l’heure : à relever', isDue('k', { k: [{ t: NOW - MIN_REFRESH_INTERVAL_MS, v: 1, o: 'measured' }] }, noAttempts, NOW) === true)
check('liste vide : à relever', isDue('k', { k: [] }, noAttempts, NOW) === true)

console.log('\n3. Regroupement — un appel par domaine, dates et groupe')
const a = item({ key: 'a', url: 'https://example.test/a' })
const b = item({ key: 'b', url: 'https://example.test/b' })
const c = item({ key: 'c', url: 'https://example.test/c', domainId: 99, domain: 'Tignes' })
const d = item({ key: 'd', url: 'https://example.test/d', checkIn: '2027-03-07', checkOut: '2027-03-14' })
const groups = groupForRefresh([a, b, c, d], empty, noAttempts, NOW)
check('trois lots', groups.length === 3, groups.map((g) => g.items.map((i) => i.key)))
check('les deux biens du même séjour sont dans un seul lot', groups[0].items.length === 2)
check('le lot porte le domaine', groups[0].domainId === 42)
check('un autre domaine fait un lot à part', groups.some((g) => g.domainId === 99))
check('d’autres dates font un lot à part', groups.some((g) => g.checkIn === '2027-03-07'))

check('un suivi non relevable est écarté', groupForRefresh([item({ url: undefined })], empty, noAttempts, NOW).length === 0)
check(
  'un suivi relevé il y a dix minutes est écarté',
  groupForRefresh([a], { a: [{ t: NOW - 600_000, v: 1, o: 'measured' }] }, noAttempts, NOW).length === 0
)
check('aucun suivi : aucun lot', groupForRefresh([], empty, noAttempts, NOW).length === 0)
check(
  'groupe par défaut quand adultes/enfants manquent',
  groupForRefresh([item({ adults: undefined, children: undefined })], empty, noAttempts, NOW)[0].adults === 1
)

console.log('\n4. Rapprochement par URL, jamais par nom')
const offers = [lodging({ url: 'https://example.test/a' }), lodging({ url: 'https://example.test/b', name: 'Autre' })]
check('URL trouvée', matchLodging(a, offers)?.url === 'https://example.test/a')
check('URL absente de la réponse : rien', matchLodging(item({ url: 'https://example.test/z' }), offers) === null)
check('suivi sans URL : rien', matchLodging(item({ url: undefined }), offers) === null)
check(
  'un nom identique sous une autre URL n’est pas rapproché',
  matchLodging(item({ url: 'https://example.test/z' }), [lodging({ url: 'https://example.test/y' })]) === null
)

console.log('\n5. Seul un total confirmé devient un point')
check('total confirmé : point mesuré', measuredReading(lodging(), NOW)?.o === 'measured')
check('la valeur est celle relevée', measuredReading(lodging({ total: 1150 }), NOW)?.v === 1150)
check('« à partir de » : aucun point', measuredReading(lodging({ priceConfidence: 'partial' }), NOW) === null)
check('confiance inconnue : aucun point', measuredReading(lodging({ priceConfidence: 'unknown' }), NOW) === null)
check('confiance absente : aucun point', measuredReading(lodging({ priceConfidence: undefined }), NOW) === null)
check('total nul : aucun point', measuredReading(lodging({ total: 0 }), NOW) === null)
check('total négatif : aucun point', measuredReading(lodging({ total: -5 }), NOW) === null)

console.log('\n6. Relevés d’un lot')
const group = groupForRefresh([a, b], empty, noAttempts, NOW)[0]
const readings = readingsForGroup(
  group,
  [lodging({ url: 'https://example.test/a', total: 1150 }), lodging({ url: 'https://example.test/b', total: 900, priceConfidence: 'partial' })],
  NOW
)
check('le bien à total confirmé produit un point', readings.a?.v === 1150)
check('le bien « à partir de » n’en produit pas', readings.b === undefined)
check('une offre disparue ne produit rien', Object.keys(readingsForGroup(group, [], NOW)).length === 0)
check('tous les points portent leur provenance', Object.values(readings).every((r) => r.o === 'measured'))

console.log('\n7. Prix par personne')
check('4 personnes, 7 nuits, 1400 €', perPersonOf(item({ adults: 2, children: 2 }), 1400, 7) === 50)
check('groupe inconnu : une personne', perPersonOf(item({ adults: undefined, children: undefined }), 700, 7) === 100)
check('zéro nuit compte pour une', perPersonOf(item({ adults: 1, children: 0 }), 200, 0) === 200)

console.log('\n8. Un échec laisse une trace — sinon le lot repart toutes les cinq minutes')
const failedOnce = recordAttempts(noAttempts, ['a'], new Set<string>(), NOW)
check('l’échec est enregistré', failedOnce.a?.failures === 1, failedOnce)
check(
  'un bien qui vient d’échouer n’est pas redû',
  isDue('a', empty, failedOnce, NOW + 60_000) === false
)
check(
  'et son lot ne repart pas au tour suivant',
  groupForRefresh([a], empty, failedOnce, NOW + 5 * 60_000).length === 0
)
check(
  'il redevient dû après le recul',
  isDue('a', empty, failedOnce, NOW + backoffMs(1) + 1) === true
)

const failedTwice = recordAttempts(failedOnce, ['a'], new Set<string>(), NOW)
check('les échecs s’accumulent', failedTwice.a?.failures === 2)
check('le recul croît', backoffMs(2) > backoffMs(1))
check('le recul est plafonné', backoffMs(99) === 24 * MIN_REFRESH_INTERVAL_MS)
check('sans échec, le recul vaut la cadence normale', backoffMs(0) === MIN_REFRESH_INTERVAL_MS)

const recovered = recordAttempts(failedTwice, ['a'], new Set(['a']), NOW)
check('un succès efface le compteur d’échecs', recovered.a === undefined, recovered)
check('les autres biens ne sont pas touchés', recordAttempts({ z: { at: 1, failures: 3 } }, ['a'], new Set<string>(), NOW).z?.failures === 3)

console.log('\n9. Airbnb n’est pas relevable par le moteur multi-sources')
check('un suivi Airbnb est déclaré non relevable', isRefreshable(item({ src: 'Airbnb' })) === false)
check('même complet par ailleurs', isRefreshable(item({ src: 'Airbnb', url: 'https://x.test/a' })) === false)
check('les autres sources restent relevables', isRefreshable(item({ src: 'Booking.com' })) === true)
check('et il ne constitue aucun lot', groupForRefresh([item({ src: 'Airbnb' })], empty, noAttempts, NOW).length === 0)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log(`\npriceRefresh : ${total} contrôles — rien n’entre dans l’historique sans total confirmé.`)
