/**
 * L'altitude qui filtre et qui trie est celle de la **station**.
 *
 * Une station porte deux altitudes qu'il est facile de confondre : le front de
 * neige, mesuré à ses coordonnées sur le modèle de terrain de l'IGN, et le
 * point le plus bas des pistes de son **domaine**, qui appartient au domaine
 * entier. Val Thorens et Brides-les-Bains partagent les 3 Vallées : elles ont
 * le même `min` (1 110 m) et 1 659 m d'écart de front de neige.
 *
 * Le filtre et le tri d'altitude portaient sur `min`. « Au moins 1 800 m » ne
 * retenait alors que trois stations sur 283 — ni Val Thorens, ni Arc 2000, ni
 * La Plagne, dont les pistes descendent en fond de vallée.
 *
 * Vérifié sur la liste affichée, pas sur des données de test.
 *
 *   npm run altitudes:test
 */

import { BUNDLED_REFERENTIAL } from './referentiel'
import { catalogueStations } from './catalogue'
import { FM_STATIONS } from './franceMontagnesStations'

const stations = catalogueStations(BUNDLED_REFERENTIAL)
const by = (name: string) => stations.find((s) => s.name === name)

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

console.log('\n1. Chaque station porte son altitude mesurée, jamais celle du domaine')
check(
  'aucune station du catalogue n’a d’altitude de village absente',
  FM_STATIONS.every((s) => s.village != null),
  { sans: FM_STATIONS.filter((s) => s.village == null).map((s) => s.fmName).slice(0, 5) }
)
check(
  'aucune station affichée ne retombe donc sur le repli `?? min`',
  stations.every((s) => s.village > 0)
)

console.log('\n2. Un domaine, plusieurs altitudes — les 3 Vallées')
const troisV = ['Brides-les-Bains', 'Orelle', 'Val Thorens', 'Les Menuires'].map(by)
check('les quatre stations témoins existent', troisV.every((s) => s != null))
check(
  'elles partagent le même bas de pistes',
  new Set(troisV.map((s) => s?.min)).size === 1,
  { min: troisV.map((s) => s?.min) }
)
check(
  'et portent quatre fronts de neige distincts',
  new Set(troisV.map((s) => s?.village)).size === 4,
  Object.fromEntries(troisV.map((s) => [s?.name, s?.village]))
)
// Le nom ment : « Courchevel 1850 » culmine à ~1 750 m réels. L'altitude ne
// s'extrait jamais du libellé.
const attendus: [string, number, number][] = [
  ['Brides-les-Bains', 550, 750],
  ['Orelle', 850, 1050],
  ['Val Thorens', 2200, 2400],
  ['Courchevel', 1700, 1850]
]
for (const [name, lo, hi] of attendus) {
  const v = by(name)?.village
  check(`${name} mesure entre ${lo} et ${hi} m`, v != null && v >= lo && v <= hi, { village: v })
}
check(
  'Brides ne porte plus le 1 260 m recopié du minimum de domaine',
  by('Brides-les-Bains')?.village !== 1260
)

console.log('\n3. Le seuil « au moins 1 800 m » trie sur la bonne mesure')
const hauts = stations.filter((s) => s.village >= 1800).map((s) => s.name)
for (const name of ['Val Thorens', 'Les Menuires']) {
  check(`${name} est retenue`, hauts.includes(name), { village: by(name)?.village })
}
for (const name of ['Brides-les-Bains', 'Orelle']) {
  check(`${name} est écartée`, !hauts.includes(name), { village: by(name)?.village })
}
check(
  'et le seuil ne retient plus une poignée de stations mais une vraie sélection',
  hauts.length > 20,
  { retenues: hauts.length, surMin: stations.filter((s) => s.min >= 1800).length }
)

console.log('\n4. Le bas des pistes reste une mesure du domaine')
check(
  'les stations d’un même domaine gardent un `min` et un `max` communs',
  troisV.every((s) => s?.min === troisV[0]?.min && s?.max === troisV[0]?.max),
  { min: troisV[0]?.min, max: troisV[0]?.max }
)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
const ecarts = stations.filter((s) => Math.abs(s.village - s.min) > 400).length
console.log(
  `\n${stations.length} stations · ${ecarts} dont le front de neige s’écarte ` +
    `de plus de 400 m du bas des pistes · ${hauts.length} à 1 800 m ou plus.`
)
