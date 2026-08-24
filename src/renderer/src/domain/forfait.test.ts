/**
 * Prix du forfait pour une durée.
 *
 * Les valeurs attendues sont calées sur la grille réelle des 3 Vallées
 * (`j1: 68`, `j6: 359`, `enf6: 287`, `saison: 1090`), relevée le 11 août 2026.
 *
 *   npm run forfait:test
 */

import { forfaitAdulte, forfaitPourDuree, joursDeSki } from './forfait'
import type { Forfait } from '@/data/referentiel'

const troisVallees: Partial<Forfait> = { j1: 68, j6: 359, enf6: 287, saison: 1090 }
const solo = { adultes: 1, enfants: 0 }

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

console.log('\n1. Les durées publiées sont rendues telles quelles')
const un = forfaitPourDuree(troisVallees, 1, solo)
check('1 jour vaut j1', un?.total === 68, { total: un?.total })
check('et se donne pour officiel', un?.confiance === 'officiel', { c: un?.confiance })
const six = forfaitPourDuree(troisVallees, 6, solo)
check('6 jours valent j6', six?.total === 359, { total: six?.total })
check('et se donnent pour officiels', six?.confiance === 'officiel', { c: six?.confiance })

console.log('\n2. Les durées non publiées sont estimées, et le disent')
const trois = forfaitPourDuree(troisVallees, 3, solo)
check('3 jours = 184 EUR', trois?.total === 184, { total: trois?.total })
check('marqué estimé', trois?.confiance === 'estime', { c: trois?.confiance })
const sept = forfaitPourDuree(troisVallees, 7, solo)
check('7 jours = 419 EUR', sept?.total === 419, { total: sept?.total })
check('marqué estimé', sept?.confiance === 'estime', { c: sept?.confiance })

console.log('\n3. Le prix au jour baisse jusqu’à six jours, puis se stabilise')
const parJour = [1, 2, 3, 4, 5, 6, 7, 10].map((d) => forfaitPourDuree(troisVallees, d, solo)?.parJour ?? 0)
check(
  'de 1 à 6 jours, chaque jour supplémentaire baisse le prix journalier',
  parJour.slice(0, 6).every((v, i) => i === 0 || v < parJour[i - 1]),
  parJour.slice(0, 6)
)
// Au-delà de six jours, le jour supplémentaire vaut exactement la moyenne des
// six premiers : le prix journalier devient plat. Il ne décroît pas davantage,
// et c'est voulu — aucune grille relevée ne publie de remise au-delà de six
// jours, et en inventer une reviendrait à fabriquer un tarif.
check(
  'au-delà, il ne remonte jamais',
  parJour.every((v, i) => i === 0 || v <= parJour[i - 1]),
  parJour
)
check(
  'et le plateau vaut le sixième du forfait 6 jours',
  Math.abs((parJour[6] ?? 0) - 359 / 6) < 0.01,
  { plateau: parJour[6] }
)

console.log('\n4. Le forfait saison plafonne les longs séjours')
const vingt = forfaitPourDuree(troisVallees, 20, solo)
check('20 jours ne dépassent pas le forfait saison', vingt?.total === 1090, { total: vingt?.total })
check('et le plafond est signalé', vingt?.detail.plafonneSaison === true)
const douze = forfaitAdulte(troisVallees, 12)
check('12 jours restent sous le plafond', douze?.plafonneSaison === false, { prix: douze?.prix })

console.log('\n5. Les enfants suivent le ratio relevé à six jours')
const famille = forfaitPourDuree(troisVallees, 6, { adultes: 2, enfants: 2 })
check('à 6 jours, l’enfant vaut exactement enf6', famille?.detail.enfant === 287, {
  enfant: famille?.detail.enfant
})
check('total = 2x359 + 2x287', famille?.total === 1292, { total: famille?.total })
check('et le tout reste officiel', famille?.confiance === 'officiel', { c: famille?.confiance })
const familleTrois = forfaitPourDuree(troisVallees, 3, { adultes: 2, enfants: 2 })
check(
  'à 3 jours, le tarif enfant devient une estimation',
  familleTrois?.confiance === 'estime',
  { c: familleTrois?.confiance }
)
check(
  'un enfant coûte moins qu’un adulte',
  (familleTrois?.detail.enfant ?? 0) < (familleTrois?.detail.adulte ?? 0),
  familleTrois?.detail
)

console.log('\n6. Une grille absente ne produit aucun prix')
check('grille nulle donne null', forfaitPourDuree(null, 6, solo) === null)
check('grille vide donne null', forfaitPourDuree({}, 6, solo) === null)
check('grille sans j1 donne null', forfaitPourDuree({ j6: 359 }, 3, solo) === null)
check('groupe vide donne null', forfaitPourDuree(troisVallees, 6, { adultes: 0, enfants: 0 }) === null)

console.log('\n7. Nuits et jours de ski')
check('7 nuits donnent 7 jours de ski', joursDeSki(7) === 7)
check('une durée nulle vaut au moins un jour', joursDeSki(0) === 1)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log(
  `\n3 Vallées · 1 j ${un?.total} EUR · 3 j ${trois?.total} EUR · 6 j ${six?.total} EUR · ` +
    `7 j ${sept?.total} EUR · plafond saison ${vingt?.total} EUR.`
)
