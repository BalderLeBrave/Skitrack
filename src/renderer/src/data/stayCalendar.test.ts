/**
 * La grille du calendrier de séjour et la règle samedi → samedi.
 *
 * Ce que le rendu ne peut pas garantir dans la durée : que la grille commence
 * un lundi, que février bissextile a ses 29 jours, qu'un fuseau ne fait pas
 * glisser une date, et que la suggestion de semaine part bien du samedi.
 *
 *   npm run staycal:test
 */

import {
  addDaysIso,
  isSaturdayIso,
  monthGrid,
  monthOfIso,
  parseIso,
  saturdayWeekFrom,
  shiftMonth,
  weekdayIso
} from './stayCalendar'

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

console.log('\nCalendrier de séjour\n')

console.log('1. Lecture des dates')
check('une date valide se lit', parseIso('2027-02-06')?.day === 6)
check('un 30 février est refusé, pas replié sur mars', parseIso('2027-02-30') === null)
check('un mois 13 est refusé', parseIso('2027-13-01') === null)
check('une chaîne quelconque est refusée', parseIso('demain') === null)

console.log('\n2. Arithmétique des jours')
check('+7 jours traverse le mois', addDaysIso('2027-01-28', 7) === '2027-02-04')
check('-1 jour traverse l’année', addDaysIso('2027-01-01', -1) === '2026-12-31')
check('le 29 février bissextile existe', addDaysIso('2028-02-28', 1) === '2028-02-29')
check('et pas hors année bissextile', addDaysIso('2027-02-28', 1) === '2027-03-01')

console.log('\n3. Jours de semaine — le métier du fichier')
// Les dates de la recherche d'Adrien : le 6 février 2027 est un samedi.
check('le 6 février 2027 est un samedi', isSaturdayIso('2027-02-06'))
check('le 9 janvier 2027 est un samedi', isSaturdayIso('2027-01-09'))
check('le 7 février 2027 n’en est pas un', !isSaturdayIso('2027-02-07'))
check('lundi = colonne 0', weekdayIso('2027-02-01') === 0)

console.log('\n4. La grille du mois')
const fev = monthGrid({ year: 2027, month0: 1 })
check('février 2027 tient en 4 semaines pleines', fev.length === 4, fev.length)
check('chaque semaine a 7 cases', fev.every((w) => w.length === 7))
check('le 1er février 2027 est en tête de ligne (lundi)', fev[0][0] === '2027-02-01')
check('le 28 clôt la dernière ligne (dimanche)', fev[3][6] === '2027-02-28')
const jan = monthGrid({ year: 2027, month0: 0 })
check('janvier 2027 commence un vendredi : 4 cases vides devant', jan[0].slice(0, 4).every((c) => c === null) && jan[0][4] === '2027-01-01')
check('les samedis tombent en colonne 5', jan.flatMap((w) => (w[5] ? [w[5]] : [])).every(isSaturdayIso))

console.log('\n5. La semaine samedi → samedi')
check(
  'un mercredi remonte au samedi précédent',
  JSON.stringify(saturdayWeekFrom('2027-02-10')) === JSON.stringify({ arr: '2027-02-06', dep: '2027-02-13' })
)
check(
  'un samedi est sa propre arrivée',
  JSON.stringify(saturdayWeekFrom('2027-02-06')) === JSON.stringify({ arr: '2027-02-06', dep: '2027-02-13' })
)
check(
  'un dimanche remonte au samedi de la veille',
  JSON.stringify(saturdayWeekFrom('2027-02-07')) === JSON.stringify({ arr: '2027-02-06', dep: '2027-02-13' })
)
check('une date invalide ne suggère rien', saturdayWeekFrom('') === null)

console.log('\n6. Navigation de mois')
check('décembre + 1 = janvier suivant', JSON.stringify(shiftMonth({ year: 2026, month0: 11 }, 1)) === JSON.stringify({ year: 2027, month0: 0 }))
check('janvier - 1 = décembre précédent', JSON.stringify(shiftMonth({ year: 2027, month0: 0 }, -1)) === JSON.stringify({ year: 2026, month0: 11 }))
check('le mois d’une date se lit', JSON.stringify(monthOfIso('2027-02-06')) === JSON.stringify({ year: 2027, month0: 1 }))
check('et pas celui d’une chaîne invalide', monthOfIso('') === null)

console.log(failures === 0 ? '\nCalendrier : tous les cas passent.' : `\n${failures} cas en échec.`)
if (failures > 0) process.exitCode = 1
