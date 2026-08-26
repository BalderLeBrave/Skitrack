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

import {
  ubloListingPath,
  repairUbloListingUrl,
  ubloEntryUrl,
  UBLO_ENTRY_ONLY,
  UBLO_LISTING_SEGMENT
} from './ubloUrl'
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

console.log('\n4. Centrale sans fiche par logement (Isola 2000)')
check('Isola est bien de famille Ublo', bookingFamilyOf('isola2000.com') === 'ublo')
const entree = ubloEntryUrl('https://isola2000.com', UBLO_ENTRY_ONLY['isola2000.com'], 'studio-front-de-neige')
check(
  'le lien mène à la page d’entrée, avec le logement pour identité',
  entree === 'https://isola2000.com/reservez-votre-sejour/?lodging=studio-front-de-neige',
  entree
)
check('aucune date accrochée : le widget ne les lit pas', !entree.includes('from=') && !entree.includes('to='))
check(
  'deux logements, deux URL — sinon le relevé n’en garderait qu’un',
  ubloEntryUrl('https://isola2000.com', '/reservez-votre-sejour/', 'a') !==
    ubloEntryUrl('https://isola2000.com', '/reservez-votre-sejour/', 'b')
)

// La réparation : une URL déjà enregistrée sous le patron des autres centrales
// menait à une 404, et faisait apparaître le logement en double au relevé
// suivant. Elle doit converger vers la forme ci-dessus.
const reparee = repairUbloListingUrl('https://isola2000.com/hebergements/studio-front-de-neige')
check('l’ancienne URL en 404 est ramenée sur la page d’entrée', reparee === entree, reparee)
check('idempotente : la repasser ne dérive pas', repairUbloListingUrl(reparee) === reparee, repairUbloListingUrl(reparee))
check(
  'une centrale qui publie ses fiches garde les siennes',
  repairUbloListingUrl('https://reservation.alpedhuez.com/hebergements/chalet-x') ===
    'https://reservation.alpedhuez.com/hebergements/chalet-x'
)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log('\nURL Ublo : tous les cas passent.')
