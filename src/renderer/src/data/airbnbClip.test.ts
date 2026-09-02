/**
 * Lecture du collage Airbnb.
 *
 * Aucun réseau : le marque-page produit un JSON, ce module le relit. Les cas
 * couverts sont ceux qui cassent en vrai — le prix localisé, le prix barré, le
 * doublon, l'annonce anonyme.
 *
 *     node --import tsx src/renderer/src/data/airbnbClip.test.ts
 *
 * (ou via le bundle esbuild du projet, comme providers.test.ts)
 */

import {
  airbnbRoomUrl,
  parseAirbnbClipboard,
  parseAirbnbPrice,
  parseAirbnbRating,
  tailleAnnoncee
} from './airbnbClip'

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

// --- Prix ------------------------------------------------------------------
check('prix simple', parseAirbnbPrice('528 € au total') === 528)
check('virgule décimale française arrondie', parseAirbnbPrice('527,50\u00a0€ au total') === 528)
check('espace insécable des milliers', parseAirbnbPrice('1\u00a0234\u00a0€ au total') === 1234)
check(
  'prix barré ignoré : on garde le premier montant',
  parseAirbnbPrice('380 € au total. Prix initial : 437 €') === 380
)
check('libellé sans prix → null', parseAirbnbPrice('Nouvel hébergement') === null)
check('absent → null', parseAirbnbPrice(undefined) === null)

check(
  'carte 2026-08-30 : 2 chambres · 6 lits',
  tailleAnnoncee({
    name: 'Spacieux appartement cœur de station avec garage',
    subtitle: 'Appartement en résidence ⋅ Modane · 2 chambres · 6 lits · 1 salle de bain et 1 toilette'
  }).chambres === 2 &&
    tailleAnnoncee({
      name: 'Spacieux appartement cœur de station avec garage',
      subtitle: 'Appartement en résidence ⋅ Modane · 2 chambres · 6 lits · 1 salle de bain et 1 toilette'
    }).lits === 6
)
check(
  'sans ligne de taille → undefined, pas 0',
  tailleAnnoncee({ name: 'Chalet aux 2 Alpes', subtitle: 'Les 2 Alpes' }).chambres === undefined
)

// --- Note ------------------------------------------------------------------
check(
  'note extraite du libellé long',
  parseAirbnbRating('Évaluation moyenne sur la base de 87 commentaires : 4,98 sur 5') === '4,98'
)
check('« Nouveau » n’invente pas de note', parseAirbnbRating('Nouvel hébergement') === null)

// --- URL -------------------------------------------------------------------
check(
  'URL d’annonce avec dates',
  airbnbRoomUrl('123', { checkIn: '2027-02-06', checkOut: '2027-02-13' }) ===
    'https://www.airbnb.fr/rooms/123?check_in=2027-02-06&check_out=2027-02-13'
)

// --- Collage complet -------------------------------------------------------
const clip = JSON.stringify({
  source: 'airbnb',
  checkIn: '2027-02-06',
  checkOut: '2027-02-13',
  listings: [
    { id: '1722959740873427511', name: 'Appartement cosy vue montagne', priceLabel: '528 € au total', lat: 45.2962, lon: 6.5858, ratingLabel: 'Nouvel hébergement', image: 'https://x/p.jpg' },
    { id: '796404667035526241', name: 'Appart 25m² aux Menuires', priceLabel: '380 € au total. Prix initial : 437 €', ratingLabel: '… : 4,98 sur 5' },
    { id: '796404667035526241', name: 'DOUBLON', priceLabel: '999 €' },
    { name: 'sans identifiant', priceLabel: '100 €' },
    { id: 'sansprix', name: 'Chalet sans prix affiché' }
  ]
})

const result = parseAirbnbClipboard(clip)
check('doublon et annonce sans id écartés → 3 retenues', result.listings.length === 3, result.listings.length)
check('une erreur signalée (annonce sans id)', result.errors.length === 1)
check('prix réel conservé', result.listings[0].total === 528)
check('URL d’annonce reconstruite depuis l’id', result.listings[0].url?.includes('/rooms/1722959740873427511') === true)
check('image conservée', result.listings[0].image === 'https://x/p.jpg')
check('note conservée sur la 2e', result.listings[1].note === '4,98')
check('annonce sans prix → total 0 (carte redirection)', result.listings[2].total === 0)
check('dates et compte remontés dans meta', result.meta.checkIn === '2027-02-06' && result.meta.count === 3)

const sized = parseAirbnbClipboard(
  JSON.stringify({
    source: 'airbnb',
    listings: [
      {
        id: '40088811',
        name: 'Spacieux appartement',
        subtitle: '2 chambres · 6 lits · 1 salle de bain',
        guests: 4,
        bedrooms: 2,
        priceLabel: '1754 € au total'
      }
    ]
  })
)
check('personCapacity du JSON → capacity 4', sized.listings[0]?.capacity === 4)
check('bedrooms du JSON prime sur le texte', sized.listings[0]?.rooms === 2)

check('collage illisible signalé, pas de plantage', parseAirbnbClipboard('{cassé').errors.length === 1)
check('tableau nu accepté', parseAirbnbClipboard('[{"id":"9","name":"X","priceLabel":"200 €"}]').listings.length === 1)

console.log(failures === 0 ? '\n  TOUS LES TESTS PASSENT' : `\n  ${failures} TEST(S) EN ÉCHEC`)
if (failures > 0 && typeof process !== 'undefined') process.exitCode = 1
