/**
 * URL de fiche Ublo : fabrication et réparation.
 *
 * Le cas réel qui a motivé ce fichier — signalé deux fois, parce que le premier
 * correctif ne valait que pour les relevés d'après :
 *
 *   https://reservation.alpedhuez.com/residence-bergers-…-apt-707/   → 404
 *   https://reservation.alpedhuez.com/hebergements/residence-…-707/  → 200
 *
 *   npm run ublourl:test
 */

import { ubloListingPath, repairUbloListingUrl, UBLO_LISTING_SEGMENT } from './ubloUrl'
import { bookingFamilyOf } from './bookingFamilies'

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

console.log('\nURL de fiche Ublo\n')

console.log('1. Fabrication')
check('sans préfixe de langue', ubloListingPath('', 'chalet-test') === '/hebergements/chalet-test')
check(
  'préfixe de langue devant le segment, pas à la place',
  ubloListingPath('/fr', 'chalet-test') === '/fr/hebergements/chalet-test'
)
check('pas de double barre', !ubloListingPath('/fr/', 'chalet-test').includes('//'))

console.log('\n2. Réparation d’une URL enregistrée')
const casse =
  'https://reservation.alpedhuez.com/residence-bergers-p-and-v-residence-les-bergers-p-and-v-apt-707/?from=2027-01-16&to=2027-01-23&adults=8'
const repare = repairUbloListingUrl(casse)
check(
  'le segment est réinséré',
  repare.startsWith(
    `https://reservation.alpedhuez.com/${UBLO_LISTING_SEGMENT}/residence-bergers-p-and-v-residence-les-bergers-p-and-v-apt-707`
  ),
  repare
)
check('les paramètres de séjour sont conservés', repare.includes('from=2027-01-16') && repare.includes('adults=8'))

console.log('\n3. Idempotence — la réparation repasse à chaque démarrage')
check('une URL déjà correcte ne bouge pas', repairUbloListingUrl(repare) === repare)
check('deux passes valent une', repairUbloListingUrl(repairUbloListingUrl(casse)) === repare)

console.log('\n4. Prudence — ne réparer que la forme visée')
const accueil = 'https://reservation.alpedhuez.com/'
check('page d’accueil intacte', repairUbloListingUrl(accueil) === accueil)
const deuxSegments = 'https://reservation.alpedhuez.com/activites/ski-de-fond'
check('chemin à deux segments intact', repairUbloListingUrl(deuxSegments) === deuxSegments)
check('chaîne inanalysable rendue telle quelle', repairUbloListingUrl('pas une url') === 'pas une url')

console.log('\n5. Les hôtes visés sont bien reconnus comme Ublo')
for (const host of [
  'reservation.alpedhuez.com',
  'www.saintefoy-reservation.com',
  'reservation.saintfrancoislongchamp.com'
]) {
  check(host, bookingFamilyOf(host) === 'ublo')
}
check(
  'une centrale Ingénie n’est pas concernée',
  bookingFamilyOf('reservation.les2alpes.com') !== 'ublo'
)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log('\nURL Ublo : tous les cas passent.')
