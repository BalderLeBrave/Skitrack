/**
 * Familles de centrales — ce qui décide si on lance le connecteur Ingénie.
 *
 *   npx esbuild src/shared/bookingFamilies.test.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/families-test.mjs && node node_modules/.cache/families-test.mjs
 */

import { bookingFamilyOf, isKnownNonIngenie } from './bookingFamilies'

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(
    `  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`
  )
  if (!condition) failures++
}

console.log('\nFamilles de centrales\n')
check('2 Alpes n’est pas hors-Ingénie', !isKnownNonIngenie('https://reservation.les2alpes.com/location.html'))
check('Val Thorens n’est pas hors-Ingénie', !isKnownNonIngenie('reservation.valthorens.com'))
check('Chamonix = orchestra', bookingFamilyOf('https://booking.chamonix.com/fr/') === 'orchestra')
check('La Plagne = orchestra', bookingFamilyOf('www.laplagneresort.com') === 'orchestra')
check('Alpe d’Huez = ublo', bookingFamilyOf('reservation.alpedhuez.com') === 'ublo')
check('Sainte-Foy = ublo', bookingFamilyOf('www.saintefoy-reservation.com') === 'ublo')
check('Saint-François = ublo (MSEM)', bookingFamilyOf('reservation.saintfrancoislongchamp.com') === 'ublo')
check('Valberg = ublo (MSEM dump 2026-09-01)', bookingFamilyOf('www.valberg.com') === 'ublo')
check('Écrins = ublo (PDE, pas OT-n)', bookingFamilyOf('www.paysdesecrins.com') === 'ublo')
check('La Bresse = opensystem', bookingFamilyOf('www.labresse.net') === 'opensystem')
check('Toussuire = opensystem', bookingFamilyOf('https://reservation.la-toussuire.com/') === 'opensystem')
check('Dévoluy = opensystem', bookingFamilyOf('reservation.ledevoluy.com') === 'opensystem')
check('Valmorel résa = opensystem', bookingFamilyOf('reservation.valmorel.com') === 'opensystem')
check('N-PY résa = opensystem', bookingFamilyOf('reservation.n-py.com') === 'opensystem')
check('Megève = orchestra', bookingFamilyOf('megeve-booking.com') === 'orchestra')
check('Sancy = sancy', bookingFamilyOf('www.sancy.com') === 'sancy')
check('Pralognan = locvacances', bookingFamilyOf('www.reservationpralognan.fr') === 'locvacances')
check('La Clusaz = deskline', bookingFamilyOf('www.laclusaz.com') === 'deskline')
// Plus de famille `blocked` : elle portait un verdict `robots.txt`, qui
// n'appartient qu'à `providers/station/robots.ts`. Ces deux hôtes portent
// maintenant leur moteur, mesuré par `npm run centrales:recon`.
check('Combloux = orchestra', bookingFamilyOf('reservation.combloux.com') === 'orchestra')
check('Montgenèvre = opensystem', bookingFamilyOf('reservation.montgenevre.com') === 'opensystem')
check('hôte inconnu = unknown', bookingFamilyOf('www.example.com') === 'unknown')

if (failures > 0) {
  console.log(`\n${failures} échec(s)`)
  process.exit(1)
}
console.log('\nok')
