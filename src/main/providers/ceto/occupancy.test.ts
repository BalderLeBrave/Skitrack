/**
 * Grille d'occupation Orchestra : ce qu'on en décide.
 *
 * Les chiffres ne sont pas inventés pour le test : ils viennent de la fiche
 * `hotel-324-appart-hotel-aiguille-verte` de booking.chamonix.com, relevée le
 * 2026-08-21 pour un séjour du 09 au 16 janvier 2027 — 201 lignes, occupations
 * 1 à 6. C'est l'annonce qui était proposée pour huit personnes alors qu'elle
 * en loge six.
 *
 *   npm run occupancy:test
 */

import {
  ficheUrlWithStay,
  fitsGroup,
  priceForGroup,
  summarise,
  type OccupancyRow
} from './occupancy'

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

const row = (
  adults: number,
  children: number,
  total: number,
  condition?: string,
  policy?: string
): OccupancyRow => ({
  adults,
  children,
  pax: adults + children,
  total,
  condition,
  policy
})

/** Meilleur tarif par occupation, tel que relevé sur la fiche. */
const AIGUILLE_VERTE: OccupancyRow[] = [
  row(1, 0, 1161),
  row(2, 0, 1161),
  row(2, 1, 1224),
  row(4, 0, 2340, 'Location uniquement Flexible', 'Flexible'),
  row(4, 1, 2736, 'Reservez en avance et Payez moins ! Long sejour', 'Non remboursable'),
  row(4, 2, 2736),
  // quelques lignes plus chères de la même grille : elles ne doivent jamais
  // être retenues quand une moins chère accueille le même groupe
  row(2, 0, 1290),
  row(4, 2, 3100)
]

console.log('\nGrille d’occupation — APPART-HOTEL AIGUILLE VERTE ***\n')

console.log('1. Capacité réelle')
const grid = summarise(AIGUILLE_VERTE)
check('la grille est exploitable', grid != null)
check('capacité maximale : 6', grid?.maxPax === 6, grid?.maxPax)
check(
  'occupations distinctes, croissantes',
  JSON.stringify(grid?.options.map((o) => o.pax)) === JSON.stringify([1, 2, 3, 4, 5, 6]),
  grid?.options.map((o) => o.pax)
)
check(
  'meilleur tarif retenu par occupation',
  JSON.stringify(grid?.options.map((o) => o.total)) ===
    JSON.stringify([1161, 1161, 1224, 2340, 2736, 2736]),
  grid?.options.map((o) => o.total)
)

console.log('\n1 bis. La condition voyage avec son prix')
check(
  'le tarif 4 personnes garde sa condition',
  grid?.options.find((o) => o.pax === 4)?.condition === 'Location uniquement Flexible',
  grid?.options.find((o) => o.pax === 4)
)
check(
  'et sa politique d’annulation',
  grid?.options.find((o) => o.pax === 4)?.policy === 'Flexible'
)
check(
  'le tarif 5 personnes est non remboursable',
  grid?.options.find((o) => o.pax === 5)?.policy === 'Non remboursable'
)

console.log('\n2. Le tarif du groupe demandé, pas le tarif d’appel')
check('2 adultes → 1 161 €', priceForGroup(AIGUILLE_VERTE, 2, 0) === 1161)
check('4 adultes → 2 340 €', priceForGroup(AIGUILLE_VERTE, 4, 0) === 2340)
check('4 adultes + 2 enfants → 2 736 €', priceForGroup(AIGUILLE_VERTE, 4, 2) === 2736)
check(
  'jamais le moins cher de la grille : 6 personnes ne coûtent pas 1 161 €',
  priceForGroup(AIGUILLE_VERTE, 4, 2) !== 1161
)

console.log('\n3. Le cas signalé : huit personnes')
check('aucune composition n’accueille 8 adultes', priceForGroup(AIGUILLE_VERTE, 8, 0) === null)
check('ni 6 adultes + 2 enfants', priceForGroup(AIGUILLE_VERTE, 6, 2) === null)
check('l’annonce est donc écartée, au lieu d’être proposée à 1 161 €', priceForGroup(AIGUILLE_VERTE, 8, 0) === null)

console.log('\n4. Adultes et enfants ne sont pas interchangeables')
check('2 places adulte n’accueillent pas 3 adultes', !fitsGroup(row(2, 1, 1224), 3, 0))
check('mais bien 2 adultes + 1 enfant', fitsGroup(row(2, 1, 1224), 2, 1))
check('un enfant peut prendre une place d’adulte restante', fitsGroup(row(4, 0, 2340), 2, 2))
check('l’inverse est faux : un adulte ne prend pas une place enfant', !fitsGroup(row(2, 2, 1500), 3, 1))

console.log('\n5. Une fiche muette ne produit aucune capacité')
check('grille vide → null, jamais 0', summarise([]) === null)
check('lignes sans prix → null', summarise([row(4, 0, 0)]) === null)
check('lignes sans occupation → null', summarise([{ adults: 0, children: 0, pax: 0, total: 900 }]) === null)

console.log('\n6. Dates recollées sur l’URL de fiche')
const u = ficheUrlWithStay(
  'https://booking.chamonix.com/fr/hotel-324-appart-hotel-aiguille-verte',
  '2027-01-09',
  '2027-01-16',
  'CMB'
)
check('checkin dans le hash', u.includes('s_checkinDate=2027-01-09'), u)
check('checkout dans le hash', u.includes('s_checkoutDate=2027-01-16'))
check('canal de vente', u.includes('s_channel=CMB'))
const deja = ficheUrlWithStay(
  'https://booking.chamonix.com/fr/hotel-324#s_checkinDate=2027-02-06&s_channel=XXX',
  '2027-01-09',
  '2027-01-16',
  'CMB'
)
check('ce que la SERP a déjà posé est respecté', deja.includes('s_checkinDate=2027-02-06') && deja.includes('s_channel=XXX'), deja)
check('et le reste est complété', deja.includes('s_checkoutDate=2027-01-16'))

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log('\nGrille d’occupation : tous les cas passent.')
