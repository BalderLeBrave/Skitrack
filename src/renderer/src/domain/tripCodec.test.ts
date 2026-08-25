/**
 * Un séjour exporté puis réimporté est le même ; un payload corrompu est rejeté.
 *
 *   npm run tripcodec:test
 */

import {
  LINK_MAX_CHARS,
  decodeTrip,
  decodeTripFile,
  decodeTripLink,
  encodeTrip,
  isLinkTooLong,
  parseTripLink,
  tripFileContent,
  tripFileName,
  tripLink
} from './tripCodec'
import type { SavedTrip } from '@/store/userData'

let failures = 0
let total = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  total++
  console.log(
    `  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`
  )
  if (!condition) failures++
}

/**
 * base64url d'un texte quelconque — utilisé pour fabriquer des charges
 * volontairement mauvaises. `btoa` seul ne sait pas encoder un accent, et le
 * libellé de référence en porte : la faute serait dans le test, pas dans le
 * codec.
 */
function b64url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const TRIP: SavedTrip = {
  id: 'trip-abc123',
  label: 'La Plagne · février — chalet côté nord',
  stationId: 42,
  dates: { from: '2027-02-07', to: '2027-02-14' },
  party: { adults: 2, children: 2 },
  budget: { max: 3200, mode: 'total' },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000
}

console.log('\n1. Aller-retour — le séjour survit intact')
const round = decodeTrip(encodeTrip(TRIP))
check('décodage réussi', round !== null)
check('identité', round?.id === TRIP.id)
check('libellé accentué conservé', round?.label === TRIP.label, round?.label)
check('station', round?.stationId === 42)
check('dates', round?.dates.from === '2027-02-07' && round?.dates.to === '2027-02-14')
check('groupe', round?.party.adults === 2 && round?.party.children === 2)
check('budget', round?.budget?.max === 3200 && round?.budget?.mode === 'total')
check('horodatages', round?.createdAt === TRIP.createdAt && round?.updatedAt === TRIP.updatedAt)
check('aller-retour strictement identique', JSON.stringify(round) === JSON.stringify(TRIP), round)

console.log('\n2. Un budget absent le reste')
const noBudget = decodeTrip(encodeTrip({ ...TRIP, budget: null }))
check('budget null traverse', noBudget?.budget === null)

console.log('\n3. base64url — pas de caractère à réencoder dans une URL')
const payload = encodeTrip(TRIP)
check('alphabet URL-safe uniquement', /^[A-Za-z0-9\-_]+$/.test(payload), payload.slice(0, 40))
check('aucun signe égal de remplissage', !payload.includes('='))

console.log('\n4. Lien')
const link = tripLink(TRIP)
check('préfixe du protocole', link.startsWith('skitrack://trip/'))
check('le lien se relit', decodeTripLink(link)?.id === TRIP.id)
check('charge extraite', parseTripLink(link) === payload)
check('barre oblique finale tolérée', decodeTripLink(`${link}/`)?.id === TRIP.id)
check('casse du protocole tolérée', decodeTripLink(link.replace('skitrack://', 'SKITRACK://'))?.id === TRIP.id)
check('espaces autour tolérés', decodeTripLink(`  ${link}  `)?.id === TRIP.id)

console.log('\n5. Lien — ce qui est refusé')
check('autre protocole', parseTripLink(`http://trip/${payload}`) === null)
check('autre hôte', parseTripLink(`skitrack://plan/${payload}`) === null)
check('sans charge', parseTripLink('skitrack://trip/') === null)
check('charge hors alphabet', parseTripLink('skitrack://trip/abc$def') === null)
check('chaîne vide', parseTripLink('') === null)
check('non-chaîne', parseTripLink(undefined as unknown as string) === null)
check('lien tronqué : rien de décodé', decodeTripLink(link.slice(0, link.length - 12)) === null)

console.log('\n6. Charge corrompue — rejet propre, jamais de réparation')
check('base64 illisible', decodeTrip('!!!pas-du-base64!!!') === null)
check('base64 valide mais pas du JSON', decodeTrip(b64url('bonjour')) === null)
check('JSON valide mais pas une enveloppe', decodeTrip(b64url('[1,2,3]')) === null)
check('chaîne vide', decodeTrip('') === null)
check('non-chaîne', decodeTrip(null as unknown as string) === null)
check('charge démesurée refusée sans décodage', decodeTrip('A'.repeat(200_001)) === null)

const badVersion = b64url(JSON.stringify({ v: 99, trip: TRIP }))
check('version inconnue refusée', decodeTrip(badVersion) === null)

const noVersion = b64url(JSON.stringify({ trip: TRIP }))
check('enveloppe sans version refusée', decodeTrip(noVersion) === null)

function envelope(trip: unknown): string {
  return b64url(JSON.stringify({ v: 1, trip }))
}
check('séjour sans station refusé', decodeTrip(envelope({ ...TRIP, stationId: undefined })) === null)
check('séjour à dates inversées refusé', decodeTrip(envelope({ ...TRIP, dates: { from: '2027-02-14', to: '2027-02-07' } })) === null)
check('séjour à groupe démesuré refusé', decodeTrip(envelope({ ...TRIP, party: { adults: 1e9, children: 0 } })) === null)
check('séjour à libellé vide refusé', decodeTrip(envelope({ ...TRIP, label: '' })) === null)
check('enveloppe sans séjour refusée', decodeTrip(envelope(undefined)) === null)

console.log('\n7. Taille du lien')
check('un séjour ordinaire tient dans le lien', !isLinkTooLong(link), link.length)
check('le plafond est celui annoncé', isLinkTooLong('x'.repeat(LINK_MAX_CHARS + 1)))
check('pile au plafond : accepté', !isLinkTooLong('x'.repeat(LINK_MAX_CHARS)))
const longTrip: SavedTrip = { ...TRIP, label: 'A'.repeat(120) }
check(
  'un libellé maximal tient encore dans le lien',
  !isLinkTooLong(tripLink(longTrip)),
  tripLink(longTrip).length
)

console.log('\n8. Fichier .skitrip')
const file = tripFileContent(TRIP)
check('en-tête reconnaissable', file.startsWith('skitrack:trip:1'))
check('le fichier se relit', decodeTripFile(file)?.id === TRIP.id)
check('aller-retour fichier identique', JSON.stringify(decodeTripFile(file)) === JSON.stringify(TRIP))
check('fins de ligne Windows tolérées', decodeTripFile(file.replace(/\n/g, '\r\n'))?.id === TRIP.id)
check('en-tête absent : refusé', decodeTripFile(payload) === null)
check('en-tête d’un autre outil : refusé', decodeTripFile(`autre:chose:1\n${payload}\n`) === null)
check('fichier vide : refusé', decodeTripFile('') === null)
check('en-tête seul : refusé', decodeTripFile('skitrack:trip:1\n') === null)
check('charge corrompue dans un fichier bien formé : refusé', decodeTripFile('skitrack:trip:1\n!!!\n') === null)

console.log('\n9. Nom de fichier proposé')
check('accents et ponctuation retirés', /^[A-Za-z0-9-]+\.skitrip$/.test(tripFileName(TRIP)), tripFileName(TRIP))
check('extension', tripFileName(TRIP).endsWith('.skitrip'))
check('libellé sans caractère utilisable : repli', tripFileName({ ...TRIP, label: '···' }) === 'sejour.skitrip')
check('nom borné', tripFileName({ ...TRIP, label: 'B'.repeat(200) }).length <= 60 + '.skitrip'.length)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log(`\ntripCodec : ${total} contrôles — un séjour reçu est une donnée, validée avant d’être appliquée.`)
