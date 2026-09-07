/**
 * Extraction des coûts de route ViaMichelin.
 *
 * Aucun réseau : le test donne des fragments de page et vérifie ce qui en
 * ressort. Le point qui compte n'est pas qu'un chiffre soit lu quand il est
 * là — c'est qu'**aucun** chiffre ne sorte quand il n'y est pas. Un péage
 * absent doit rendre `null`, jamais zéro : un trajet non relevé passerait
 * sinon pour un trajet gratuit, et c'est exactement l'erreur que ce module
 * existe pour ne pas commettre.
 *
 *   npm run routecost:test
 */

import { parseRouteCost, viaMichelinUrl } from './routeCost'

let failures = 0
const check = (label: string, ok: boolean): void => {
  if (!ok) failures++
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
}
const section = (title: string): void => console.log(`\n${title}`)

section('1. Le bloc de données de la page')
const AVEC_JSON = `
<html><body><script>window.__DATA__ = {"summary":{
  "tollCost":{"currency":"EUR","value":48.6},
  "fuelCost":{"currency":"EUR","value":61.2},
  "distance":{"unit":"m","value":623400},
  "duration":{"unit":"s","value":21600}
}}</script></body></html>`
const j = parseRouteCost(AVEC_JSON)
check('le péage est lu', j.tolls === 48.6)
check('le carburant est lu', j.fuel === 61.2)
check('la distance passe des mètres aux kilomètres', j.distanceKm === 623.4)
check('la durée passe des secondes aux minutes', j.durationMin === 360)

section('2. Repli sur le texte visible')
const TEXTE = `
<html><body>
  <div class="summary"><span>Péage : 32,40 €</span><span>Carburant : 55,10 €</span></div>
</body></html>`
const x = parseRouteCost(TEXTE)
check('le péage est lu malgré la virgule décimale', x.tolls === 32.4)
check('le carburant est lu', x.fuel === 55.1)
check('sans bloc de données, la distance reste inconnue', x.distanceKm === null)
check('sans bloc de données, la durée reste inconnue', x.durationMin === null)

section('3. Une page muette ne produit aucun chiffre')
const MUET = '<html><body><h1>Itinéraire</h1><p>Calcul en cours…</p></body></html>'
const m = parseRouteCost(MUET)
check('aucun péage inventé', m.tolls === null)
check('aucun carburant inventé', m.fuel === null)
check('aucune distance inventée', m.distanceKm === null)
check('aucune durée inventée', m.durationMin === null)

section('4. Zéro publié n’est pas absence de relevé')
const GRATUIT = '<html><body><span>Péage : 0 €</span><span>Carburant : 41,00 €</span></body></html>'
const g = parseRouteCost(GRATUIT)
check('un péage à zéro est lu comme zéro, pas comme null', g.tolls === 0)
check('et le carburant l’accompagne', g.fuel === 41)

section('4 bis. Les séparateurs de milliers ne tronquent pas le montant')
const MILLE = '<html><body><span>Péage : 1 234,50 €</span><span>Carburant : 2 001 €</span></body></html>'
const km = parseRouteCost(MILLE)
// Sans retrait des espaces, la première capture s'arrêtait au « 1 ».
check('un péage à quatre chiffres est lu en entier', km.tolls === 1234.5)
check('un carburant à quatre chiffres aussi', km.fuel === 2001)
const INSEC = '<html><body><span>Péage : 1 234,50 €</span></body></html>'
check('y compris avec une espace insécable', parseRouteCost(INSEC).tolls === 1234.5)

section('5. L’URL relevée est celle que l’utilisateur obtiendrait')
const url = viaMichelinUrl({ fromLat: 48.8566, fromLon: 2.3522, toLat: 45.2965, toLon: 6.5806 })
check('l’URL porte le départ', url.includes('48.856600%2C2.352200') || url.includes('departure=48.856600'))
check('l’URL porte l’arrivée', url.includes('45.296500'))
check('l’évitement des péages est explicite', url.includes('avoidTolls=false'))
const urlSansPeage = viaMichelinUrl({
  fromLat: 48.8566,
  fromLon: 2.3522,
  toLat: 45.2965,
  toLon: 6.5806,
  avoidTolls: true
})
check('et il suit la demande', urlSansPeage.includes('avoidTolls=true'))
const urlCarburant = viaMichelinUrl({
  fromLat: 48.8566,
  fromLon: 2.3522,
  toLat: 45.2965,
  toLon: 6.5806,
  fuelPricePerL: 1.82
})
check('le prix du litre saisi est transmis', urlCarburant.includes('fuelPrice=1.82'))

if (failures > 0) {
  console.error(`\n${failures} vérification(s) en échec.`)
  process.exit(1)
}
console.log('\nCoûts de route ViaMichelin : toutes les vérifications passent.')
