/**
 * Invariants du coût d'un séjour.
 *
 * Deux propriétés, et elles valent plus que n'importe quel montant attendu en
 * dur : la **répartition entre foyers doit sommer au total** — sinon l'écran
 * Décision affiche un total que ses propres lignes contredisent — et une
 * semaine de sept nuits doit continuer de facturer le tarif 6 jours du fichier
 * livré, qui est ce que faisait l'ancien calcul.
 *
 * Ce second point est la non-régression du passage au tarif par durée : le
 * calcul facturait `j6` quelles que soient les dates, et un week-end de deux
 * nuits était chiffré au forfait de six jours. Corriger ce défaut ne devait
 * rien changer au cas de la semaine, qui est le cas courant.
 *
 * La tolérance d'un euro par foyer sur les sommes est celle des arrondis : le
 * logement se répartit au nombre de personnes, et `Math.round` par ligne.
 *
 *   npm run costs:test
 */

import { sejourCost, splitRows, tripCost, type Person, type SejourInputs } from '@/domain/costs'
import { forfaitPourDuree, joursDeSki } from '@/domain/forfait'
import type { Domain } from '@/data/referentiel'
import type { Origin, RouteTable } from '@/domain/travel'

let bad = 0
const ok = (l: string, c: boolean): void => { if (!c) bad++; console.log(`  ${c ? '✓' : '✗'} ${l}`) }

const d = { id: 1, name: 'Test', lat: 45.3, lon: 6.58, min: 1300, max: 3200, km: 600, lifts: 100, village: 2300, massif: 'Alpes du Nord' } as unknown as Domain
const origins: Origin[] = [
  { id: 0, label: 'A', addr: '', cp: '', city: '', lat: 48.85, lon: 2.35, short: 'A', fullLabel: 'A' },
  { id: 1, label: 'B', addr: '', cp: '', city: '', lat: 45.75, lon: 4.85, short: 'B', fullLabel: 'B' }
]
const routes: RouteTable = { '0:1': { dur: 350, dist: 620, at: 0 }, '1:1': { dur: 180, dist: 190, at: 0 } }
const people: Person[] = [
  { id: 1, first: 'a', last: 'a', age: 40, home: 0, lesson: 'col', lesDays: 5, lesHours: 2 },
  { id: 2, first: 'b', last: 'b', age: 38, home: 0 },
  { id: 3, first: 'c', last: 'c', age: 9, home: 1, lesson: 'col', lesDays: 5, lesHours: 2 },
  { id: 4, first: 'd', last: 'd', age: 42, home: 1 }
]
const LIVRE = { j1: 68, j6: 359, enf6: 287, saison: 1090, zone: 'z', maj: 'm' }

for (const [nuits, budget] of [[7, undefined], [3, undefined], [7, { fuelPricePerL: 1.82, consoL100: 6.4, tollsRoundTrip: 96 }], [7, { flatTotal: 180 }]] as const) {
  const jours = joursDeSki(nuits)
  const pass = forfaitPourDuree(LIVRE, false, undefined, jours)
  const trip = tripCost(d, origins, routes, false, budget)
  const inputs: SejourInputs = { people, forfait: LIVRE, pass, trip, optRental: true, optLessons: true, esf: { kid: 12.7, adult: 14.3, priv: null, ecole: null, releveLe: null, source: 'estimé', privSource: 'estimé' }, lessonIdx: 1 }
  const cost = sejourCost({ total: 2000 }, inputs)
  const split = splitRows(d, 2000, inputs, origins, routes, false, budget)
  const sommeLignes = split.rows.reduce((n, r) => n + r.total, 0)
  console.log(`\n${nuits} nuits (${jours} j de ski)${budget ? ' + budget saisi' : ''} — forfaits ${cost.forfaits} € · route ${cost.route} € · total ${cost.total} €`)
  ok('la somme des foyers égale le total du séjour', Math.abs(sommeLignes - cost.total) <= split.rows.length)
  ok('grand total de la répartition = total du séjour', Math.abs(split.grand - cost.total) <= split.rows.length)
  ok('la route de la répartition égale celle du total', split.rows.reduce((n, r) => n + r.route, 0) === cost.route)
  ok('les forfaits de la répartition égalent ceux du total', split.rows.reduce((n, r) => n + r.forfaits, 0) === cost.forfaits)
}

console.log('\n--- Non-régression sur la semaine de 7 nuits ---')
const pass7 = forfaitPourDuree(LIVRE, false, undefined, joursDeSki(7))
ok('7 nuits facture bien le tarif 6 jours du fichier (359 €)', pass7?.adulte === 359)
ok('et le tarif enfant relevé (287 €)', pass7?.enfant === 287)
ok('origine « relevé », pas « interpolé »', pass7?.origine === 'relevé')

if (bad > 0) { console.error(`\n${bad} invariant(s) rompu(s).`); process.exit(1) }
console.log('\nInvariants de coût : tous tenus.')
