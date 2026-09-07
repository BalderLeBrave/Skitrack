/**
 * Le découpage en tranches de prix du relevé Airbnb.
 *
 * Le relevé ne voyait qu'une page — dix-huit annonces, toujours les mêmes —
 * parce qu'Airbnb pagine et que le connecteur ne suit pas son curseur. La
 * réponse est de reposer la question par tranches de prix, et ce fichier tient
 * la seule partie de ce mécanisme qui se juge sans réseau : le découpage.
 *
 * Ce qui est vérifié est ce qu'une relecture ne garantit pas dans la durée —
 * que les tranches couvrent sans trou et sans se chevaucher, et qu'un
 * inventaire trop plat pour être découpé retombe sur les bornes fixes plutôt
 * que de produire quatre tranches identiques, c'est-à-dire quatre relevés pour
 * une seule page.
 *
 *   npm run airbnbbands:test
 */

import { priceBands } from './runAirbnbSearch'
import type { RawListing } from './bulkImport'

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

/** Annonces réduites à ce que le découpage lit : un total de séjour. */
const listings = (totals: number[]): RawListing[] =>
  totals.map((total, i) => ({ name: `A${i}`, total, url: `https://www.airbnb.fr/rooms/${i}` }))

console.log('\nTranches de prix du relevé Airbnb\n')

console.log('1. Quatre tranches tirées des prix observés')
// Sept nuits, des totaux de 700 à 4 200 € : de 100 à 600 € la nuit.
const semaine = listings([700, 1050, 1400, 1750, 2100, 2800, 3500, 4200])
const bands = priceBands(semaine, 7)
check('quatre tranches', bands.length === 4, bands)
check('la première n’a pas de plancher', bands[0].minPrice === undefined)
check('la dernière n’a pas de plafond', bands[3].maxPrice === undefined)
check(
  'elles se suivent sans trou',
  bands[0].maxPrice === bands[1].minPrice &&
    bands[1].maxPrice === bands[2].minPrice &&
    bands[2].maxPrice === bands[3].minPrice,
  bands
)
check(
  'et elles montent',
  (bands[1].minPrice ?? 0) < (bands[2].minPrice ?? 0) && (bands[2].minPrice ?? 0) < (bands[3].minPrice ?? 0),
  bands
)
check(
  'les bornes sont des prix par nuit, pas des totaux de séjour',
  (bands[3].minPrice ?? 0) < 700,
  bands[3]
)

console.log('\n2. Ce qui ne se découpe pas retombe sur les bornes fixes')
const fixes = priceBands([], 7)
check('aucun prix observé → bornes fixes', fixes.length === 4 && fixes[0].maxPrice === 90, fixes)
check(
  'moins de quatre prix → bornes fixes',
  JSON.stringify(priceBands(listings([700, 1400, 2100]), 7)) === JSON.stringify(fixes)
)
check(
  'un marché parfaitement plat → bornes fixes, pas quatre tranches vides',
  JSON.stringify(priceBands(listings([1400, 1400, 1400, 1400, 1400, 1400]), 7)) === JSON.stringify(fixes)
)
check(
  'les annonces sans prix ne comptent pas',
  JSON.stringify(priceBands(listings([0, 0, 0, 0, 1400, 2100]), 7)) === JSON.stringify(fixes)
)

console.log('\n3. Le nombre de nuits ne peut pas faire diviser par zéro')
const sansNuits = priceBands(semaine, 0)
check('zéro nuit → le total fait office de tarif, sans exception', sansNuits.length === 4, sansNuits)

console.log(failures === 0 ? '\nTranches Airbnb : tous les cas passent.' : `\n${failures} cas en échec.`)
if (failures > 0) process.exitCode = 1
