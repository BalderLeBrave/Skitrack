/**
 * Regroupement des stations en domaines skiables.
 *
 * Vérifié sur la **liste affichée** — le catalogue France Montagnes converti
 * par `data/catalogue.ts` —, pas sur des données de test ni sur le fichier
 * brut : le regroupement n'a d'intérêt que s'il tient sur les cas réels, les
 * quatorze stations des 3 Vallées et les deux orthographes de « Mont(-)Blanc
 * Unlimited ».
 *
 *   npm run areas:test
 */

import { areaKeyOf, skiAreaIndex } from './skiAreas'
import { BUNDLED_REFERENTIAL } from './referentiel'
import { catalogueStations } from './catalogue'

const stations = catalogueStations(BUNDLED_REFERENTIAL)
const { areas, byStation, areaOf } = skiAreaIndex(stations)

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

console.log(`\nDomaines skiables — ${stations.length} stations regroupées en ${areas.length} domaines\n`)

console.log('1. Couverture')
check('chaque station appartient à un domaine', stations.every((s) => byStation.has(s.id)),
  stations.filter((s) => !byStation.has(s.id)).map((s) => s.name))
check('aucun domaine vide', areas.every((a) => a.stations.length > 0))
check(
  'la somme des stations des domaines redonne la liste',
  areas.reduce((n, a) => n + a.stations.length, 0) === stations.length
)
check('aucun domaine sans nom', areas.every((a) => a.name.trim().length > 0))

console.log('\n2. Domaines multi-stations nommés')
const areaNamed = (label: string) => areas.find((a) => a.id === areaKeyOf({ pass: label, name: label } as never))
const troisV = areaNamed('Les 3 Vallées')
check('Les 3 Vallées existe', troisV != null)
for (const name of [
  'Courchevel',
  'Méribel',
  'Les Menuires',
  'Val Thorens',
  'Saint-Martin-de-Belleville',
  'Brides-les-Bains',
  // Orelle n'est pas rattachée aux 3 Vallées par le classeur, qui la voit plus
  // près des pistes de Galibier-Thabor : c'est `DOMAIN_FIXES` qui la recolle,
  // et cette ligne est le test de cette correction.
  'Orelle'
]) {
  check(`  ${name} y figure`, (troisV?.stations ?? []).some((s) => s.name === name),
    (troisV?.stations ?? []).map((s) => s.name))
}

const sybelles = areaNamed('Les Sybelles')
check('Les Sybelles regroupe ses stations', (sybelles?.stations.length ?? 0) >= 4,
  sybelles?.stations.map((s) => s.name))
const grandMassif = areaNamed('Le Grand Massif')
check('Le Grand Massif regroupe ses stations', (grandMassif?.stations.length ?? 0) >= 5,
  grandMassif?.stations.map((s) => s.name))

console.log('\n3. Les pièges de la donnée')
// Une station dont le nom *est* le nom du domaine mène son groupe sans le
// dupliquer : « Les 2 Alpes » est à la fois la station et le forfait.
const deuxAlpes = areas.find((a) => a.stations.some((s) => s.name === 'Les 2 Alpes'))
check(
  '« Les 2 Alpes » mène son domaine sans y figurer deux fois',
  (deuxAlpes?.stations ?? []).filter((s) => s.name === 'Les 2 Alpes').length === 1,
  deuxAlpes?.stations.map((s) => s.name)
)
const huez = areas.find((a) => a.stations.some((s) => s.name === "Alpe d'Huez"))
check(
  '« Alpe d’Huez Grand Domaine » mène Vaujany et Villard-Reculas',
  ['Vaujany', 'Villard-Reculas'].every((n) => (huez?.stations ?? []).some((s) => s.name === n)),
  huez?.stations.map((s) => s.name)
)
const montBlanc = areas.filter((a) => /montblancunlimited/.test(a.id))
check('les deux orthographes de Mont(-)Blanc Unlimited donnent un seul domaine', montBlanc.length === 1,
  montBlanc.map((a) => `${a.name} (${a.stations.length})`))

console.log('\n4. Agrégats : ce qui est licite')
const withSummit = areas.find((a) => a.stations.length > 1)!
check(
  'le point culminant est bien le maximum de ses stations',
  withSummit.summit === Math.max(...withSummit.stations.map((s) => s.max))
)
check(
  'le kilométrage exposé est un maximum, jamais une somme',
  areas.every((a) => a.kmMax === Math.max(...a.stations.map((s) => s.km)))
)
check(
  'et il reste donc inférieur à la somme des stations d’un grand domaine',
  troisV != null && troisV.kmMax < troisV.stations.reduce((n, s) => n + s.km, 0),
  { kmMax: troisV?.kmMax, somme: troisV?.stations.reduce((n, s) => n + s.km, 0) }
)

console.log('\n5. Domaines mono-station')
const singles = areas.filter((a) => a.single)
check('un domaine mono-station est marqué comme tel', singles.every((a) => a.stations.length === 1))
check('et il en existe', singles.length > 0, { mono: singles.length, multi: areas.length - singles.length })
check(
  'le domaine d’une station se retrouve par `areaOf`',
  stations.every((s) => areaOf(s)?.stations.includes(s))
)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log(
  `\n${stations.length} stations · ${areas.length} domaines ` +
    `(${areas.filter((a) => !a.single).length} multi-stations, ${singles.length} mono-station).`
)
