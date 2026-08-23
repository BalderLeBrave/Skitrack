/**
 * Familles de centrales — ce qui décide si on lance le connecteur Ingénie.
 *
 *   npx esbuild src/shared/bookingFamilies.test.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/families-test.mjs && node node_modules/.cache/families-test.mjs
 */

import { bookingFamilyOf, isKnownNonIngenie, isOpenSystemLiveHost } from './bookingFamilies'

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
check('La Bresse WordPress = opensystem', bookingFamilyOf('www.labresse.net') === 'opensystem')
check('La Bresse résa = Ingénie', !isKnownNonIngenie('https://reservation.labresse.net/'))
check('Le Corbier = opensystem', bookingFamilyOf('reservation.le-corbier.com') === 'opensystem')
check('Saint-Sorlin résa = opensystem', bookingFamilyOf('reservation.saintsorlindarves.com') === 'opensystem')
check('Les 7 Laux = opensystem', bookingFamilyOf('reservation.les7laux.com') === 'opensystem')
check('7 Laux n’est pas un catalogue meublé live', !isOpenSystemLiveHost('reservation.les7laux.com'))
check('Vaujany n’est pas live meublé', !isOpenSystemLiveHost('reservation.vaujany.com'))
check('Valfréjus n’est pas live meublé', !isOpenSystemLiveHost('www.valfrejus.com'))
check('Toussuire est live meublé', isOpenSystemLiveHost('reservation.la-toussuire.com'))
check('N-PY est live meublé', isOpenSystemLiveHost('www.n-py.com'))
check('Vaujany = opensystem', bookingFamilyOf('reservation.vaujany.com') === 'opensystem')
check('Villard-Reculas = ublo', bookingFamilyOf('reservation.villard-reculas.com') === 'ublo')
check('Villard-de-Lans = ublo', bookingFamilyOf('reservation.villarddelans-correnconenvercors.com') === 'ublo')
check('Toussuire = opensystem', bookingFamilyOf('https://reservation.la-toussuire.com/') === 'opensystem')
check('Dévoluy = opensystem', bookingFamilyOf('reservation.ledevoluy.com') === 'opensystem')
check('Valmorel résa = opensystem', bookingFamilyOf('reservation.valmorel.com') === 'opensystem')
check('N-PY résa = opensystem', bookingFamilyOf('reservation.n-py.com') === 'opensystem')
check('Megève = orchestra', bookingFamilyOf('megeve-booking.com') === 'orchestra')
check('Praz-sur-Arly = orchestra', bookingFamilyOf('booking.prazsurarly.com') === 'orchestra')
check('Haute-Maurienne = opensystem', bookingFamilyOf('reservation.haute-maurienne-vanoise.com') === 'opensystem')
check('Sancy = sancy', bookingFamilyOf('www.sancy.com') === 'sancy')
check('Pralognan = locvacances', bookingFamilyOf('www.reservationpralognan.fr') === 'locvacances')
check('Combloux = blocked', bookingFamilyOf('reservation.combloux.com') === 'blocked')
check('hôte inconnu = unknown', bookingFamilyOf('www.example.com') === 'unknown')
check('Isola = ublo (MSEM)', bookingFamilyOf('isola2000.com') === 'ublo')
check('Valberg = ublo', bookingFamilyOf('www.valberg.com') === 'ublo')
check('Montclar = ublo', bookingFamilyOf('www.montclar.com') === 'ublo')
check('Écrins = ublo', bookingFamilyOf('www.paysdesecrins.com') === 'ublo')
check('Léman = ublo', bookingFamilyOf('www.leman-mountains-explore.com') === 'ublo')
check('Oz-en-Oisans = ublo (MSEM 523)', bookingFamilyOf('www.oz-en-oisans.com') === 'ublo')
check('Saint-Gervais = ublo (MSEM 569)', bookingFamilyOf('www.saintgervais.com') === 'ublo')

if (failures > 0) {
  console.log(`\n${failures} échec(s)`)
  process.exit(1)
}
console.log('\nok')
