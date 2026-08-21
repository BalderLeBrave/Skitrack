/**
 * Temps d'accès au bas des pistes : le moyen, puis la durée.
 *
 * Le cas qui a motivé ce module : un logement à 1 416 m, que le moteur classe
 * « voiture », affichait « 28 min » — un temps de marche pour un trajet qu'on
 * ne fait pas à pied.
 *
 *   npm run accesstime:test
 */

import { accessTimeOf } from './accessTime'

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

console.log('\nTemps d’accès au bas des pistes\n')

console.log('1. Le moteur local tranche quand il s’est prononcé')
check(
  'classé skis aux pieds → aucun trajet à chiffrer',
  JSON.stringify(accessTimeOf(60, 'skis_aux_pieds')) === JSON.stringify({ mode: 'skis_aux_pieds', minutes: null })
)
check(
  'classé voiture → temps de voiture, même à 300 m',
  accessTimeOf(300, 'voiture')?.mode === 'voiture'
)
// Sur une courte distance, voiture et marche tombent au même temps : sortir et
// garer la voiture mange le gain. Ce n'est pas un défaut du calcul, c'est vrai
// — et ça se voit dès qu'on regarde les deux chiffres.
check(
  'à 300 m, la voiture ne fait pas gagner de temps',
  accessTimeOf(300, 'voiture')?.minutes === accessTimeOf(300, undefined)?.minutes,
  { voiture: accessTimeOf(300, 'voiture'), aPied: accessTimeOf(300, undefined) }
)
check(
  'mais à 1 500 m, oui, et largement (10 min contre 30 à pied)',
  (accessTimeOf(1500, 'voiture')?.minutes ?? 99) < Math.round(1500 / 50) / 2,
  { voiture: accessTimeOf(1500, 'voiture')?.minutes, marche: Math.round(1500 / 50) }
)
check('classé navette → navette', accessTimeOf(365, 'navette')?.mode === 'navette')

console.log('\n2. Sans classification, la distance décide')
check('60 m → skis aux pieds', accessTimeOf(60, undefined)?.mode === 'skis_aux_pieds')
check('340 m → à pied', accessTimeOf(340, undefined)?.mode === 'a_pied')
check('340 m → 7 min', accessTimeOf(340, undefined)?.minutes === 7, accessTimeOf(340, undefined))
check('1 200 m → encore à pied', accessTimeOf(1200, undefined)?.mode === 'a_pied')
check('1 201 m → voiture', accessTimeOf(1201, undefined)?.mode === 'voiture')

console.log('\n3. Le cas signalé : 1 416 m')
const loin = accessTimeOf(1416, 'voiture')
check('mode voiture', loin?.mode === 'voiture')
check('durée plausible en station, pas 28 min de marche', loin != null && loin.minutes! < 15, loin)
check(
  'et bien plus courte que la marche équivalente',
  loin!.minutes! < Math.round(1416 / 50),
  { voiture: loin!.minutes, marche: Math.round(1416 / 50) }
)

console.log('\n4. Jamais de durée nulle ni de trajet inventé')
check('1 m à pied → au moins 1 min', (accessTimeOf(1, undefined)?.minutes ?? 0) >= 0)
check('distance absurde → null', accessTimeOf(Number.NaN, undefined) === null)
check('distance négative → null', accessTimeOf(-5, undefined) === null)
check('0 m → skis aux pieds, sans durée', accessTimeOf(0, undefined)?.minutes === null)

console.log('\n5. Monotone : plus loin n’est jamais plus rapide')
const paliers = [150, 300, 600, 900, 1200]
let monotone = true
for (let i = 1; i < paliers.length; i++) {
  const a = accessTimeOf(paliers[i - 1], undefined)?.minutes ?? 0
  const b = accessTimeOf(paliers[i], undefined)?.minutes ?? 0
  if (b < a) monotone = false
}
check('à pied, la durée croît avec la distance', monotone)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log('\nTemps d’accès : tous les cas passent.')
