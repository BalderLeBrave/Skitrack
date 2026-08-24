/**
 * Le filtre budget ne masque que ce qu'il sait au-dessus.
 *
 *   npm run budget:test
 */

import { budgetHides, budgetVerdict } from './budget'

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

console.log('\n1. Sans plafond, rien n’est filtré')
check('plafond null', budgetVerdict({ total: 9999, forfaits: 9999 }, null) === 'dans')
check('plafond zéro', budgetVerdict({ total: 9999, forfaits: 9999 }, 0) === 'dans')

console.log('\n2. Coût complet connu : comparaison franche')
check('sous le plafond', budgetVerdict({ total: 1200, forfaits: 700 }, 1500) === 'dans')
check('pile au plafond, retenue', budgetVerdict({ total: 1500, forfaits: 700 }, 1500) === 'dans')
check('au-dessus', budgetVerdict({ total: 1600, forfaits: 700 }, 1500) === 'au-dessus')

console.log('\n3. Logement inconnu : les forfaits ne concluent que dans un sens')
check(
  'forfaits déjà au-dessus, la station est écartée',
  budgetVerdict({ total: null, forfaits: 1800 }, 1500) === 'au-dessus'
)
check(
  'forfaits sous le plafond, le total reste indéterminé',
  budgetVerdict({ total: null, forfaits: 700 }, 1500) === 'inconnu'
)

console.log('\n4. Rien de connu : la station reste affichée')
check('aucun poste', budgetVerdict({ total: null, forfaits: null }, 1500) === 'inconnu')
check('et un inconnu ne masque jamais', budgetHides({ total: null, forfaits: null }, 1500) === false)
check(
  'un inconnu partiel non plus',
  budgetHides({ total: null, forfaits: 700 }, 1500) === false
)
check(
  'seul un au-dessus avéré masque',
  budgetHides({ total: 1600, forfaits: 700 }, 1500) === true
)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log('\nbudget : 11 contrôles — seul un dépassement avéré masque une station.')
