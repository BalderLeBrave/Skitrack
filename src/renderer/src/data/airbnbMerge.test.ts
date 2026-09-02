/**
 * Ce que la fusion Airbnb a le droit d'affirmer.
 *
 * Deux affirmations, deux pièges, et le même défaut de fond : l'application
 * disait à l'écran plus que ce qu'elle avait mesuré.
 *
 * ## 1. Le plancher de groupe
 *
 * Airbnb ne publie pas la capacité en personnes sur ses cartes de résultats :
 * `pers` reste à 0, et c'est voulu — l'inventer serait pire que le silence.
 * Ce qui est réel, en revanche, c'est le groupe pour lequel la recherche a été
 * filtrée : `adults` part dans l'URL du relevé, donc une annonce rendue pour
 * quatre en accueille au moins quatre. Cette valeur vit dans `fitsGuests`.
 *
 * Ce fichier existe parce que la donnée a été perdue **deux fois sur le même
 * chemin** : `runAirbnbSearch` ne passait pas `searchAdults` à la fusion, et le
 * type intermédiaire `PassResult` laissait tomber `meta.adults` avant même
 * d'y arriver. Résultat à l'écran : « capacité non annoncée » sur la totalité
 * des annonces Airbnb d'un relevé, l'application accusant la source de ne rien
 * publier alors qu'elle jetait ce qu'elle savait.
 *
 * Un typage ne suffit pas à garder ça : `searchAdults` est optionnel, et une
 * option qu'on oublie de passer compile parfaitement.
 *
 * ## 2. La conclusion d'absence
 *
 * Marquer `missingSince`, c'est afficher « probablement réservée ». Ça ne vaut
 * que si le relevé a vu tout ce qu'Airbnb propose — or son balayage
 * s'interrompt pour des motifs étrangers à la disponibilité : budget de temps,
 * passe expirée, tranches de prix qui cessent de borner, lot jugé égaré. Une
 * annonce absente d'un relevé tronqué est **non revue**, pas prise.
 *
 *   npm run airbnbmerge:test
 */

import { mergeAirbnbPaste } from './airbnbMerge'
import { partyVerdict } from './lodgingFilter'
import type { RawListing } from './bulkImport'
import type { Lodging } from './lodgings'

let failures = 0
const check = (label: string, condition: boolean): void => {
  if (condition) return
  failures++
  console.error(`FAIL  ${label}`)
}

const annonces: RawListing[] = [
  { name: 'Studio Val Claret', total: 1200, url: 'https://www.airbnb.fr/rooms/40088811' }
]

const base = {
  checkIn: '2027-01-08',
  checkOut: '2027-01-15',
  domainId: 1,
  capacity: 4,
  nights: 7,
  fallbackAltitude: 2100
}

// --- Le relevé transmet son groupe -----------------------------------------

const avec = mergeAirbnbPaste([], annonces, { ...base, searchAdults: 4 })
const lodgAvec = avec.added[0]

check('une annonce est bien ajoutée', avec.added.length === 1)
check('la capacité n’est pas inventée : pers reste à 0', lodgAvec.pers === 0)
check('le plancher relevé est conservé', lodgAvec.fitsGuests === 4)
check(
  'le groupe du relevé est jugé : l’annonce convient',
  partyVerdict(lodgAvec, { travelers: 4, rooms: 0 }) === 'convient'
)
check(
  'un groupe plus petit convient aussi',
  partyVerdict(lodgAvec, { travelers: 2, rooms: 0 }) === 'convient'
)
check(
  'demander plus que le relevé la rend de nouveau non jugeable',
  partyVerdict(lodgAvec, { travelers: 6, rooms: 0 }) === 'non-annonce'
)

// --- Le relevé ne transmet rien : la signature du défaut ---------------------

const sans = mergeAirbnbPaste([], annonces, base)
const lodgSans = sans.added[0]

check('sans searchAdults, aucun plancher n’est inventé', lodgSans.fitsGuests === undefined)
check(
  'et l’annonce retombe en « capacité non annoncée » — le symptôme constaté',
  partyVerdict(lodgSans, { travelers: 4, rooms: 0 }) === 'non-annonce'
)

// --- Le plancher n'est pas une capacité -------------------------------------

// `pers` reste nul : rien ne doit faire croire à une capacité publiée, ni la
// vignette, ni un futur tri par capacité. C'est la règle de
// `providers/types.ts`, où sept connecteurs avaient recopié `params.adults`
// dans `guests` et rapportaient « 8 pers » pour tout bien trouvé à huit.
check('le plancher ne contamine jamais pers', lodgAvec.pers === 0 && lodgSans.pers === 0)

// --- « Probablement réservée » n'est dit que si le relevé a tout vu ----------

const connue = (): Lodging[] => [
  {
    id: 1,
    name: 'Studio Val Claret',
    src: 'Airbnb',
    url: 'https://www.airbnb.fr/rooms/40088811',
    total: 1200,
    priceCheckIn: base.checkIn,
    priceCheckOut: base.checkOut,
    importDomainId: base.domainId
  } as unknown as Lodging
]

// Le relevé ne la ramène pas, et il est allé à son terme : la conclusion tient.
const complet = mergeAirbnbPaste(connue(), [], { ...base, absenceConclusive: true })
check('un relevé complet marque l’absence', complet.imported[0].missingSince != null)
check('et la compte', complet.missing === 1)
check(
  'les dates de l’absence sont celles du séjour relevé',
  complet.imported[0].missingSince?.checkIn === base.checkIn &&
    complet.imported[0].missingSince?.checkOut === base.checkOut
)

// Le même relevé, interrompu : l'annonce n'a pas été revue, ce qui n'est pas
// la même chose qu'avoir disparu. C'est le défaut constaté à l'écran.
const tronque = mergeAirbnbPaste(connue(), [], { ...base, absenceConclusive: false })
check('un relevé tronqué ne conclut rien', tronque.imported[0].missingSince === undefined)
check('et n’annonce aucune disparition', tronque.missing === 0)

// Sans l'option, on ne conclut pas : le défaut sûr.
const parDefaut = mergeAirbnbPaste(connue(), [], base)
check('le défaut est de ne pas conclure', parDefaut.imported[0].missingSince === undefined)

check('sans image publiée, photo n’est pas le nom', lodgAvec.photo === '')
check(
  'photo publiée conservée',
  mergeAirbnbPaste(
    [],
    [{ name: 'Chalet', total: 2000, url: 'https://www.airbnb.fr/rooms/9', image: 'https://a0.muscache.com/im/pictures/x.jpg' }],
    { ...base, searchAdults: 4 }
  ).added[0].photo === 'https://a0.muscache.com/im/pictures/x.jpg'
)

if (failures > 0) {
  console.error(`\n${failures} échec(s).`)
  process.exit(1)
}
console.log('Fusion Airbnb — plancher de groupe et conclusion d’absence : tous les cas passent.')
