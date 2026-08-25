/**
 * L'alerte notifie une fois au franchissement, et jamais sur une estimation.
 *
 *   npm run alerts:test
 */

import { evaluateAlert, evaluateSeries, initialArmed, valueFor } from './priceAlerts'
import type { AlertReading, PriceAlert } from './priceAlerts'

let failures = 0
let total = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  total++
  console.log(
    `  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`
  )
  if (!condition) failures++
}

const base: PriceAlert = {
  trackedKey: 'Studio Choucas|Booking.com',
  mode: 'total',
  threshold: 1000,
  active: true,
  armed: true,
  lastNotifiedAt: null
}

const measured = (value: number, at = 1_000): AlertReading => ({ value, origin: 'measured', at })
const estimated = (value: number, at = 1_000): AlertReading => ({ value, origin: 'estimated', at })

console.log('\n1. Une estimation n’est pas un relevé')
check('sous le seuil, estimé : rien', evaluateAlert(base, estimated(800)).fired === null)
check('au-dessus, estimé : n’arme pas non plus', evaluateAlert({ ...base, armed: false }, estimated(1200)).alert.armed === false)
check(
  'une estimation ne peut pas préparer un déclenchement',
  evaluateSeries({ ...base, armed: false }, [estimated(1200), measured(800)]).fired === null
)
check(
  'la même série, mesurée de bout en bout, déclenche',
  evaluateSeries({ ...base, armed: false }, [measured(1200), measured(800)]).fired !== null
)

console.log('\n2. Franchissement à la baisse')
check('au-dessus du seuil : pas de notification', evaluateAlert(base, measured(1200)).fired === null)
check('au-dessus du seuil : cran armé', evaluateAlert(base, measured(1200)).alert.armed === true)
const crossed = evaluateAlert(base, measured(900, 42))
check('sous le seuil, cran armé : notification', crossed.fired !== null)
check('la notification porte la valeur relevée', crossed.fired?.value === 900)
check('et le seuil franchi', crossed.fired?.threshold === 1000)
check('horodatage repris du relevé', crossed.fired?.at === 42)
check('le cran retombe', crossed.alert.armed === false)
check('la date de notification est enregistrée', crossed.alert.lastNotifiedAt === 42)
check('pile au seuil : c’est un franchissement', evaluateAlert(base, measured(1000)).fired !== null)

console.log('\n3. Anti-spam — hystérésis')
const after = crossed.alert
check('second relevé encore sous le seuil : silence', evaluateAlert(after, measured(880)).fired === null)
check('troisième relevé plus bas encore : silence', evaluateAlert(after, measured(700)).fired === null)
check(
  'quatre relevés sous le seuil ne produisent qu’une notification',
  evaluateSeries(base, [measured(900), measured(880), measured(870), measured(860)]).fired?.value === 900
)

const back = evaluateAlert(after, measured(1100))
check('remontée au-dessus : réarme', back.alert.armed === true)
check('remontée au-dessus : pas de notification', back.fired === null)
const second = evaluateAlert(back.alert, measured(950, 99))
check('nouvelle baisse après remontée : notifie de nouveau', second.fired !== null)
check('la seconde notification porte la nouvelle valeur', second.fired?.value === 950)

console.log('\n4. Cycle complet monte-descend-monte-descend')
const cycle = evaluateSeries({ ...base, armed: false }, [
  measured(1200, 1),
  measured(900, 2),
  measured(880, 3),
  measured(1300, 4),
  measured(950, 5)
])
check('deux franchissements, la dernière notification est la bonne', cycle.fired?.at === 5, cycle.fired)
check('cran retombé en fin de série', cycle.alert.armed === false)

console.log('\n5. Alerte en pause')
const paused: PriceAlert = { ...base, active: false, armed: false }
check('en pause, sous le seuil : pas de notification', evaluateAlert(paused, measured(800)).fired === null)
check('en pause, au-dessus : le cran suit quand même', evaluateAlert(paused, measured(1200)).alert.armed === true)
check(
  'une baisse survenue pendant la pause ne notifie pas à la réactivation',
  evaluateSeries(paused, [measured(1200), measured(800)]).fired === null
)
check(
  'mais le cran est à jour : réactivée, elle notifiera au prochain franchissement',
  evaluateSeries(paused, [measured(1200), measured(800)]).alert.armed === false
)

console.log('\n6. État initial du cran')
check('seuil sous le prix courant : armé', initialArmed(1000, 1400) === true)
check('seuil au-dessus du prix courant : non armé', initialArmed(1000, 800) === false)
check('seuil égal au prix courant : non armé', initialArmed(1000, 1000) === false)
check('prix courant inconnu : non armé', initialArmed(1000, null) === false)
check(
  'un seuil posé au-dessus du prix courant ne notifie pas au premier relevé',
  evaluateAlert({ ...base, armed: initialArmed(1000, 800) }, measured(800)).fired === null
)

console.log('\n7. Mode total / par personne')
check('mode total lit le total', valueFor('total', 1200, 300) === 1200)
check('mode par personne lit le pp', valueFor('pp', 1200, 300) === 300)
const ppAlert: PriceAlert = { ...base, mode: 'pp', threshold: 250 }
check('seuil pp non franchi par un total bas', evaluateAlert(ppAlert, measured(valueFor('pp', 900, 300))).fired === null)
check('seuil pp franchi', evaluateAlert(ppAlert, measured(valueFor('pp', 800, 200))).fired !== null)
check('la notification porte le mode', evaluateAlert(ppAlert, measured(200)).fired?.mode === 'pp')

console.log('\n8. Le module ne mute rien')
const frozen: PriceAlert = { ...base, armed: true }
const snapshot = JSON.stringify(frozen)
evaluateAlert(frozen, measured(500))
check('l’alerte passée en argument est intacte', JSON.stringify(frozen) === snapshot)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log(
  `\npriceAlerts : ${total} contrôles — une notification par franchissement mesuré, et rien sur une estimation.`
)
