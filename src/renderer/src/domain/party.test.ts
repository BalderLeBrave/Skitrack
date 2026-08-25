/**
 * Rouvrir un séjour ajuste l'effectif sans effacer ce qui a été saisi.
 *
 *   npm run party:test
 */

import { CHILD_AGE_LIMIT, DEFAULT_CHILD_AGE, isChild, peopleForParty } from './party'
import type { Person } from './costs'

let failures = 0
let total = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  total++
  console.log(
    `  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`
  )
  if (!condition) failures++
}

const adult = (id: number, first = `A${id}`, age = 40): Person => ({ id, first, last: '', age, home: 0 })
const kid = (id: number, first = `E${id}`, age = 8): Person => ({ id, first, last: '', age, home: 0 })

const countAdults = (list: readonly Person[]): number => list.filter((p) => !isChild(p)).length
const countKids = (list: readonly Person[]): number => list.filter(isChild).length

console.log('\n1. Classement adulte / enfant')
check('douze ans est un enfant', isChild(kid(1, 'E', 12)) === true)
check('treize ans est un adulte', isChild(adult(1, 'A', CHILD_AGE_LIMIT)) === false)
check('la limite vaut 13', CHILD_AGE_LIMIT === 13)

console.log('\n2. Effectif atteint')
const from1 = peopleForParty([adult(1)], 2, 2)
check('deux adultes', countAdults(from1) === 2, from1)
check('deux enfants', countKids(from1) === 2, from1)
check('quatre personnes en tout', from1.length === 4)
check('les enfants ajoutés portent l’âge enfant', from1.filter(isChild).every((p) => p.age === DEFAULT_CHILD_AGE))
check('les adultes ajoutés sont des adultes', from1.filter((p) => !isChild(p)).every((p) => p.age >= CHILD_AGE_LIMIT))

console.log('\n3. Ce qui est saisi est conservé')
const saisi = [adult(1, 'Camille', 42), adult(2, 'Dominique', 38), kid(3, 'Alix', 9)]
const grown = peopleForParty(saisi, 2, 2)
check('les deux adultes saisis sont là', grown.some((p) => p.first === 'Camille') && grown.some((p) => p.first === 'Dominique'))
check('leurs âges sont intacts', grown.find((p) => p.first === 'Camille')?.age === 42)
check('l’enfant saisi est là', grown.some((p) => p.first === 'Alix'))
check('un seul enfant a été ajouté', countKids(grown) === 2 && grown.length === 4)

console.log('\n4. Réduction — on retire ce qui a été ajouté en dernier')
const shrunk = peopleForParty(saisi, 1, 0)
check('un adulte, aucun enfant', countAdults(shrunk) === 1 && countKids(shrunk) === 0, shrunk)
check('c’est le premier saisi qui reste', shrunk[0].first === 'Camille')

console.log('\n5. Identifiants uniques')
const ids = peopleForParty([adult(7)], 3, 3).map((p) => p.id)
check('aucun doublon', new Set(ids).size === ids.length, ids)
check('l’identifiant existant est conservé', ids.includes(7))
const afterShrinkGrow = peopleForParty(peopleForParty([adult(1), adult(2), adult(3)], 1, 0), 3, 0)
check(
  'réduire puis regrandir ne recrée pas de doublon',
  new Set(afterShrinkGrow.map((p) => p.id)).size === 3,
  afterShrinkGrow.map((p) => p.id)
)

console.log('\n6. Foyer repris du premier voyageur')
const withHome = peopleForParty([{ id: 1, first: 'A', last: '', age: 40, home: 2 }], 3, 1)
check('les personnes ajoutées héritent du foyer', withHome.every((p) => p.home === 2), withHome.map((p) => p.home))

console.log('\n7. Bornes')
check('groupe vide : au moins une personne', peopleForParty([], 0, 0).length === 1)
check('nombres négatifs ramenés à zéro', peopleForParty([], -3, -2).length === 1)
check('liste vide en entrée : effectif quand même atteint', peopleForParty([], 4, 2).length === 6)
check('nombres décimaux arrondis', peopleForParty([], 2.4, 1.6).length === 4)

console.log('\n8. La liste d’entrée n’est pas mutée')
const source = [adult(1, 'Camille', 42)]
const snapshot = JSON.stringify(source)
peopleForParty(source, 4, 2)
check('entrée intacte', JSON.stringify(source) === snapshot)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log(`\nparty : ${total} contrôles — l’effectif d’un séjour rouvert agit vraiment sur les coûts.`)
