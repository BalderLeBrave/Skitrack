/**
 * Tarif de forfait par durée.
 *
 * Le point qui compte n'est pas l'arithmétique — elle est triviale — mais
 * l'origine attachée à chaque montant. Un tarif interpolé qui se déclarerait
 * « relevé » serait exactement le défaut que ce module existe pour corriger.
 *
 *   npm run forfait:test
 */

import {
  forfaitIncertain,
  forfaitPourDuree,
  forfaitUnitaires,
  joursDeSki,
  type ForfaitSaisi
} from './forfait'

let failures = 0
const check = (label: string, ok: boolean): void => {
  if (!ok) failures++
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
}
const section = (title: string): void => console.log(`\n${title}`)

// --- Convention de durée ---------------------------------------------------
section('1. Sept nuits font six jours de ski')
check('7 nuits → 6 jours', joursDeSki(7) === 6)
check('2 nuits → 1 jour', joursDeSki(2) === 1)
check('1 nuit skie quand même', joursDeSki(1) === 1)
check('0 nuit ne rend pas 0', joursDeSki(0) === 1)

// --- Référentiel livré -----------------------------------------------------
const LIVRE = { j1: 68, j6: 359, enf6: 287, saison: 1090, zone: 'Les 3 Vallées', maj: '11 août 2026' }

section('2. Le référentiel livré ne connaît que deux durées')
check('la grille livrée a deux lignes', forfaitUnitaires(LIVRE).length === 2)
const j6 = forfaitPourDuree(LIVRE, false, undefined, 6)
check('6 jours est relevé', j6?.origine === 'relevé')
check('6 jours rend le tarif du fichier', j6?.adulte === 359)
check('le tarif enfant 6 jours est relevé, pas dérivé', j6?.enfant === 287 && j6.enfantReleve)

const j1 = forfaitPourDuree(LIVRE, false, undefined, 1)
check('1 jour est relevé', j1?.origine === 'relevé' && j1.adulte === 68)
check('le tarif enfant 1 jour est dérivé faute de relevé', j1?.enfantReleve === false)

section('3. Une durée non relevée s’annonce interpolée')
const j3 = forfaitPourDuree(LIVRE, false, undefined, 3)
check('3 jours est interpolé', j3?.origine === 'interpolé')
check('3 jours tombe entre les deux bornes relevées', j3!.adulte > 68 && j3!.adulte < 359)
check('les bornes de l’interpolation sont dites', j3?.bornes?.[0] === 1 && j3?.bornes?.[1] === 6)
// 68 + (2/5) × 291 = 184,4 → 184
check('l’interpolation est linéaire entre 1 j et 6 j', j3?.adulte === 184)

section('4. Hors grille : la borne la plus proche, sans extrapoler')
const j12 = forfaitPourDuree(LIVRE, false, undefined, 12)
check('12 jours n’extrapole pas la pente', j12?.adulte === 359)
check('12 jours ne se déclare pas relevé', j12?.origine === 'interpolé')

section('5. Une estimation reste une estimation, même interpolée')
const est = forfaitPourDuree(LIVRE, true, undefined, 3)
check('l’origine estimée survit à l’interpolation', est?.origine === 'estimé')
const est6 = forfaitPourDuree(LIVRE, true, undefined, 6)
check('une durée exacte estimée reste estimée', est6?.origine === 'estimé')

section('6. La saisie prime sur le référentiel livré')
const SAISI: ForfaitSaisi = {
  tarifs: [
    { jours: 1, adulte: 72, enfant: 58 },
    { jours: 2, adulte: 140, enfant: 112 },
    { jours: 6, adulte: 372, enfant: 298 }
  ],
  releveLe: '2026-08-29',
  source: 'officiel'
}
const s6 = forfaitPourDuree(LIVRE, false, SAISI, 6)
check('le tarif saisi remplace celui du fichier', s6?.adulte === 372)
check('l’origine est « saisi »', s6?.origine === 'saisi')
check('la date du relevé est portée', s6?.releveLe === '2026-08-29')

const s4 = forfaitPourDuree(LIVRE, false, SAISI, 4)
check('une durée absente de la grille saisie est interpolée', s4?.origine === 'interpolé')
check('elle est encadrée par les durées saisies', s4?.bornes?.[0] === 2 && s4?.bornes?.[1] === 6)
check('le tarif enfant s’interpole quand les deux bornes le publient', s4?.enfantReleve === true)

section('7. Une saisie prime même sur un domaine estimé')
const sEst = forfaitPourDuree(LIVRE, true, SAISI, 6)
check('la saisie l’emporte sur l’estimation', sEst?.origine === 'saisi' && sEst.adulte === 372)

section('8. Une grille partielle vaut mieux que rien')
const PARTIEL: ForfaitSaisi = {
  tarifs: [
    { jours: 2, adulte: 140, enfant: null },
    { jours: 6, adulte: 372, enfant: null }
  ],
  releveLe: '2026-08-29',
  source: 'office'
}
const p4 = forfaitPourDuree(LIVRE, false, PARTIEL, 4)
check('deux durées suffisent à interpoler', p4?.origine === 'interpolé' && p4.adulte === 256)
check('sans tarif enfant relevé, il est dérivé et annoncé tel quel', p4?.enfantReleve === false)

section('9. Rien à afficher plutôt qu’un zéro')
const vide = forfaitPourDuree({}, false, undefined, 6)
check('un référentiel sans tarif rend null', vide === null)
const saisiVide = forfaitPourDuree({}, false, { tarifs: [], releveLe: '2026-08-29', source: 'autre' }, 6)
check('une grille saisie vide rend null', saisiVide === null)
const saisiNul = forfaitPourDuree(
  LIVRE,
  false,
  { tarifs: [{ jours: 6, adulte: 0, enfant: null }], releveLe: '2026-08-29', source: 'autre' },
  6
)
check('un tarif saisi à zéro n’écrase pas le relevé', saisiNul?.adulte === 359)

section('10. Ce qui s’affiche en italique')
check('interpolé est incertain', forfaitIncertain('interpolé'))
check('estimé est incertain', forfaitIncertain('estimé'))
check('relevé ne l’est pas', !forfaitIncertain('relevé'))
check('saisi ne l’est pas', !forfaitIncertain('saisi'))

if (failures > 0) {
  console.error(`\n${failures} vérification(s) en échec.`)
  process.exit(1)
}
console.log('\nTarifs de forfait par durée : toutes les vérifications passent.')
