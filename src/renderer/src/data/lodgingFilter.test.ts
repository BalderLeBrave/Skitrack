/**
 * Le filtre de l'écran Logements.
 *
 * Le cas qui a motivé ce fichier : « 8 voyageurs, 4 chambres » rendait des
 * annonces affichant « 8 pers · 1 ch » sur leur propre vignette. Elles
 * passaient parce qu'elles n'avaient pas de prix, et que la branche
 * carte-redirection sautait *tous* les filtres de capacité au motif qu'une
 * annonce sans tarif « n'a rien à filtrer ». Une annonce sans tarif peut très
 * bien annoncer ses chambres.
 *
 *   npm run lodgfilter:test
 */

import {
  fitsParty,
  isDroppedGitesOffer,
  matchesDemand,
  matchesLodgingFilters,
  normalizedBedrooms,
  partyVerdict,
  hotelRoomsNeeded,
  isCombinableHotel,
  type LodgingFilterCriteria
} from './lodgingFilter'
import { medianTotal } from './lodgings'
import { mergeProviderReadings, noteOnFive } from './runProviderSearch'
import type { Lodging } from './lodgings'

const STAY = { checkIn: '2027-02-06', checkOut: '2027-02-13' }

/** Groupe de 8 en 4 chambres, tout le reste grand ouvert. */
const CRITERIA: LodgingFilterCriteria = {
  travelers: 8,
  rooms: 4,
  onlyAvailable: false,
  freeCancelOnly: false,
  budgetMin: 0,
  budgetMax: 8000,
  budgetCeiling: 8000,
  distMin: 0,
  distMax: 1000,
  distCeiling: 1000,
  types: [],
  srcOff: [],
  // Les scénarios historiques de ce fichier portent sur la capacité, le budget
  // et la distance : ils gardent l'ancienne règle, sinon une annonce sans prix
  // confirmé serait écartée avant même d'être jugée sur le critère testé. La
  // nouvelle règle a sa propre section, en fin de fichier.
  confirmedPricesOnly: false,
  includeUnannounced: true
}

function lodging(over: Partial<Lodging>): Lodging {
  return {
    id: 1,
    name: 'Annonce',
    type: 'Appartement',
    pers: 0,
    ch: 0,
    m2: null,
    note: '',
    avis: 0,
    dist: 120,
    walk: 2,
    den: 0,
    skiIn: false,
    src: 'Booking.com',
    pp: 0,
    lift: '',
    liftDist: 0,
    photo: '',
    annul: false,
    total: 0,
    alt: 1800,
    stock: 0,
    url: 'https://www.booking.com/hotel/fr/x.html',
    priceCheckIn: STAY.checkIn,
    priceCheckOut: STAY.checkOut,
    ...over
  } as Lodging
}

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

const keeps = (over: Partial<Lodging>, criteria = CRITERIA): boolean =>
  matchesLodgingFilters(lodging(over), criteria, STAY)

console.log('\nFiltre Logements — 8 voyageurs, 4 chambres\n')

console.log('1. Annonce tarifée')
check('8 pers, 4 ch → retenue', keeps({ pers: 8, ch: 4, total: 2400 }))
check('8 pers, 1 ch → écartée', !keeps({ pers: 8, ch: 1, total: 1200 }))
check('2 pers, 4 ch → écartée', !keeps({ pers: 2, ch: 4, total: 700 }))

console.log('\n2. Ce que la source n’a pas annoncé passe')
check('chambres non annoncées (0) → retenue', keeps({ pers: 8, ch: 0, total: 1500 }))
check('capacité non annoncée (0) → retenue', keeps({ pers: 0, ch: 4, total: 1500 }))
check('ni l’une ni l’autre → retenue', keeps({ pers: 0, ch: 0, total: 1500 }))

console.log('\n2 bis. Ce que la source n’a pas annoncé, quand on ne veut pas le voir')
/*
 * Le défaut signalé le 2026-08-29 : demander 8 personnes et 4 chambres et
 * recevoir des studios. Sur un relevé de Val d'Isère, 27 annonces sur 39 ne
 * publiaient ni chambres ni pièces et 25 aucune capacité ; toutes traversaient
 * le filtre, et rien à l'écran ne le disait.
 *
 * `partyVerdict` distingue désormais « trop petit » de « n'annonce rien », et
 * l'écran écarte le second par défaut tout en sachant le compter.
 */
const PARTY = { travelers: 8, rooms: 4 }
const annonce = (o: Partial<Lodging>): Lodging => lodging({ total: 1500, ...o })

check('rien d’annoncé → « non-annonce »', partyVerdict(annonce({ pers: 0, ch: 0 }), PARTY) === 'non-annonce')
check(
  'capacité seule manquante → « non-annonce »',
  partyVerdict(annonce({ pers: 0, ch: 4 }), PARTY) === 'non-annonce'
)
check(
  'pièces seules manquantes → « non-annonce »',
  partyVerdict(annonce({ pers: 8, ch: 0 }), PARTY) === 'non-annonce'
)
check('tout annoncé et suffisant → « convient »', partyVerdict(annonce({ pers: 8, ch: 4 }), PARTY) === 'convient')

// La règle qui a demandé une correction : un refus l'emporte sur une absence.
check(
  'une chambre annoncée insuffisante l’emporte sur la capacité absente',
  partyVerdict(annonce({ pers: 0, ch: 1 }), PARTY) === 'trop-petit'
)
check(
  'une capacité annoncée insuffisante l’emporte sur les pièces absentes',
  partyVerdict(annonce({ pers: 2, ch: 0 }), PARTY) === 'trop-petit'
)

// Les pièces se comparent au seuil converti : 4 chambres demandées = 5 pièces.
check('4 pièces ne suffisent pas pour 4 chambres', partyVerdict(annonce({ pers: 8, ch: 0, rooms: 4 }), PARTY) === 'trop-petit')
check('5 pièces suffisent', partyVerdict(annonce({ pers: 8, ch: 0, rooms: 5 }), PARTY) === 'convient')

// Sans critère, il n'y a rien à ignorer : tout convient.
check(
  'sans minimum demandé, une annonce muette convient',
  partyVerdict(annonce({ pers: 0, ch: 0 }), { travelers: 0, rooms: 0 }) === 'convient'
)

console.log('\n2 bis-2. Le plancher du relevé : la source a filtré par groupe')
/*
 * Airbnb, Booking et les centrales ne rendent que des biens qui acceptent le
 * groupe demandé — `adults`, `group_adults`, `search[capacity]` sont dans
 * chaque URL de relevé. `fitsGuests` porte ce groupe. Ce n'est pas une
 * capacité : demander plus que le groupe du relevé le rend muet.
 */
check(
  'capacité absente, mais rendue pour 8 → convient',
  partyVerdict(annonce({ pers: 0, ch: 4, fitsGuests: 8 }), PARTY) === 'convient'
)
check(
  'rendue pour 8, demandée pour 10 → redevient non jugeable',
  partyVerdict(annonce({ pers: 0, ch: 4, fitsGuests: 8 }), { travelers: 10, rooms: 4 }) === 'non-annonce'
)
check(
  'la capacité publiée prime sur le plancher',
  partyVerdict(annonce({ pers: 6, ch: 4, fitsGuests: 8 }), PARTY) === 'trop-petit'
)
check(
  'le plancher ne dit rien des pièces',
  partyVerdict(annonce({ pers: 0, ch: 0, fitsGuests: 8 }), PARTY) === 'non-annonce'
)

console.log('\n2 ter. Le drapeau qui décide du sort des non-annoncées')
const muette = annonce({ pers: 0, ch: 0 })
check('écartée par défaut', !fitsParty(muette, PARTY))
check('retenue quand on demande à les voir', fitsParty(muette, PARTY, true))
check(
  'une trop petite reste écartée même en les affichant',
  !fitsParty(annonce({ pers: 2, ch: 1 }), PARTY, true)
)

console.log('\n3. Sans prix — le cas qui a fauté')
check(
  '8 pers, 1 ch, sans prix → écartée (elle annonce 1 chambre)',
  !keeps({ pers: 8, ch: 1, total: 0 })
)
check('1 ch seule annoncée, sans prix → écartée', !keeps({ pers: 0, ch: 1, total: 0 }))
check('8 pers, 4 ch, sans prix → retenue', keeps({ pers: 8, ch: 4, total: 0 }))
check(
  'porte OpenStreetMap : rien annoncé, sans prix → retenue',
  keeps({ pers: 0, ch: 0, total: 0 })
)

console.log('\n4. Centrales : le seuil passe en pièces, la donnée reste en pièces')
// « 4 chambres » demandées → 5 pièces au minimum. On traduit la demande, pas
// l'annonce : aucune de ces annonces ne se voit attribuer de chambres.
check('4 ch demandées, 5 pièces → retenue', keeps({ pers: 8, ch: 0, rooms: 5, total: 2400 }))
check('4 ch demandées, 7 pièces → retenue', keeps({ pers: 8, ch: 0, rooms: 7, total: 2400 }))
check('4 ch demandées, 4 pièces → écartée', !keeps({ pers: 8, ch: 0, rooms: 4, total: 2400 }))
check(
  '4 ch demandées, 2 pièces → écartée (le cas Bergers)',
  !keeps({ pers: 8, ch: 0, rooms: 2, total: 2400 })
)
check(
  '4 ch demandées, studio (1 pièce) → écartée',
  !keeps({ pers: 8, ch: 0, rooms: 1, total: 2400 })
)
check('la règle vaut aussi sans prix', !keeps({ pers: 8, ch: 0, rooms: 2, total: 0 }))

const troisChambres: LodgingFilterCriteria = { ...CRITERIA, rooms: 3 }
check(
  '3 ch demandées, 4 pièces → retenue',
  keeps({ pers: 8, ch: 0, rooms: 4, total: 2400 }, troisChambres)
)
check(
  '3 ch demandées, 3 pièces → écartée',
  !keeps({ pers: 8, ch: 0, rooms: 3, total: 2400 }, troisChambres)
)

const uneChambre: LodgingFilterCriteria = { ...CRITERIA, rooms: 1, travelers: 2 }
check(
  '1 ch demandée, studio (1 pièce) → écartée',
  !keeps({ pers: 2, ch: 0, rooms: 1, total: 700 }, uneChambre)
)
check(
  '1 ch demandée, 2 pièces → retenue',
  keeps({ pers: 2, ch: 0, rooms: 2, total: 700 }, uneChambre)
)

// Le repos du seuil : il descend jusqu'au studio, et là il n'écarte plus
// personne. C'est ce que « en dessous d'une chambre » veut dire.
const studio: LodgingFilterCriteria = { ...CRITERIA, rooms: 0, travelers: 2 }
check(
  '0 ch demandée : un studio (1 pièce) passe',
  keeps({ pers: 2, ch: 0, rooms: 1, total: 700 }, studio)
)
check('0 ch demandée : une annonce sans chambre passe', keeps({ pers: 2, ch: 0, total: 700 }, studio))
check('0 ch demandée : 3 chambres annoncées passent aussi', keeps({ pers: 2, ch: 3, total: 700 }, studio))
check('0 ch demandée : la capacité continue de valoir', !keeps({ pers: 1, ch: 0, total: 700 }, studio))

check(
  'les chambres priment quand la source les annonce',
  keeps({ pers: 8, ch: 4, rooms: 2, total: 2400 })
)
check('et elles priment aussi pour écarter', !keeps({ pers: 8, ch: 1, rooms: 9, total: 2400 }))
check('ni chambres ni pièces annoncées → retenue', keeps({ pers: 8, ch: 0, total: 2400 }))

console.log('\n4 bis. Un plafond atteint ne borne plus')
// La règle vit dans `data/range.ts` : `hi >= ceil` lève la borne haute. Elle
// est testée ici parce que c'est ici qu'elle se voit — sans elle, le curseur
// poussé à fond continuerait d'écarter les annonces au-delà de son échelle,
// et l'écran ne dirait pas pourquoi.
const budgetOuvert: LodgingFilterCriteria = { ...CRITERIA, budgetMin: 0, budgetMax: 8000 }
check(
  'budget au plafond : un séjour à 12 000 € passe',
  keeps({ pers: 8, ch: 4, total: 12000 }, budgetOuvert)
)
check(
  'budget au plafond avec un plancher posé : 12 000 € passe encore',
  keeps({ pers: 8, ch: 4, total: 12000 }, { ...budgetOuvert, budgetMin: 2000 })
)
check(
  'budget en deçà du plafond : 12 000 € est écarté',
  !keeps({ pers: 8, ch: 4, total: 12000 }, { ...budgetOuvert, budgetMax: 7900 })
)
const distOuverte: LodgingFilterCriteria = { ...CRITERIA, distMin: 0, distMax: 1000 }
check(
  'distance au plafond : une annonce à 2 500 m des pistes passe',
  keeps({ pers: 8, ch: 4, total: 2400, dist: 2500 }, distOuverte)
)
check(
  'distance en deçà du plafond : 2 500 m est écarté',
  !keeps({ pers: 8, ch: 4, total: 2400, dist: 2500 }, { ...distOuverte, distMax: 950 })
)

console.log('\n5. Les filtres de prix ne s’appliquent qu’aux annonces tarifées')
const budget: LodgingFilterCriteria = { ...CRITERIA, budgetMax: 1000 }
check('tarifée au-dessus du budget → écartée', !keeps({ pers: 8, ch: 4, total: 2400 }, budget))
check('sans prix, budget posé → retenue', keeps({ pers: 8, ch: 4, total: 0 }, budget))
const cancel: LodgingFilterCriteria = { ...CRITERIA, freeCancelOnly: true }
check('tarifée sans annulation gratuite → écartée', !keeps({ pers: 8, ch: 4, total: 2400 }, cancel))
check('sans prix, annulation exigée → retenue', keeps({ pers: 8, ch: 4, total: 0 }, cancel))

console.log('\n6. Type et source valent pour toute annonce')
check(
  'source décochée → écartée, même sans prix',
  !keeps({ pers: 8, ch: 4, total: 0 }, { ...CRITERIA, srcOff: ['Booking.com'] })
)
check(
  'centrale décochée écarte aussi les anciens libellés enregistrés',
  !keeps(
    { pers: 8, ch: 4, total: 2400, src: 'Chamonix Réservation' },
    { ...CRITERIA, srcOff: ['Centrale de réservation'] }
  )
)
check(
  'type non coché → écartée',
  !keeps({ pers: 8, ch: 4, total: 2400 }, { ...CRITERIA, types: ['Chalet'] })
)

console.log('\n7. Disponibilité confirmée uniquement')
const avail: LodgingFilterCriteria = { ...CRITERIA, onlyAvailable: true }
check('tarifée à ces dates → retenue', keeps({ pers: 8, ch: 4, total: 2400 }, avail))
check(
  'tarifée pour d’autres dates → écartée',
  !keeps(
    { pers: 8, ch: 4, total: 2400, priceCheckIn: '2027-01-24', priceCheckOut: '2027-01-31' },
    avail
  )
)


console.log('\n8. Médiane du domaine : un prix absent n’est pas un prix bas')
const tarifs = [900, 1100, 1200, 1400, 1500, 1800, 2100, 2400, 2900, 3400]
const offres = tarifs.map((total) => lodging({ total }))
const sansPrix = Array.from({ length: 8 }, () => lodging({ total: 0 }))
const vraie = medianTotal(offres)
check('médiane des seules offres tarifées', vraie === 1650, vraie)
check(
  'huit cartes sans prix ne la déplacent pas',
  medianTotal([...offres, ...sansPrix]) === vraie,
  medianTotal([...offres, ...sansPrix])
)
// Le verdict de prix (« Bon plan », « Au-dessus du marché ») a été retiré de
// l'écran, et `dealOf` avec lui. Ce qui reste à protéger est la mesure
// elle-même : c'est elle qui s'inversait, en comptant les cartes sans prix
// comme des prix nuls et en tirant la médiane vers le bas.
check('rien de tarifé → aucune médiane', medianTotal(sansPrix) === 0)


console.log('\n9. Un relevé neuf remplace l’ancien, il ne s’efface pas devant lui')
// Le défaut qui a survécu à deux correctifs : l'annonce enregistrée gardait à
// vie le prix et la capacité de son tout premier relevé, parce que la
// déduplication l'écartait avant même de la convertir.
const CHAMONIX = 'https://booking.chamonix.com/fr/hotel-324-appart-hotel-aiguille-verte'
const enregistree = lodging({
  url: CHAMONIX,
  name: 'APPART-HOTEL AIGUILLE VERTE ***',
  pers: 8, // capacité recopiée de la demande, par l'ancienne version
  total: 1161, // « à partir de » de la SERP
  priceConfidence: 'partial',
  // calculés par le moteur local : ils doivent survivre à la fusion
  dist: 340,
  den: 25,
  accessComputed: true,
  alt: 1035
})
const releve = lodging({
  url: CHAMONIX,
  name: 'APPART-HOTEL AIGUILLE VERTE ***',
  pers: 6, // capacité réelle, lue sur la grille
  total: 2736,
  priceConfidence: 'total_confirmed',
  priceOptions: [
    { guests: 4, total: 2340 },
    { guests: 6, total: 2736 }
  ],
  dist: 0,
  den: 0,
  accessComputed: false,
  alt: 0
})
const apres = mergeProviderReadings([enregistree], [releve])
check('l’annonce n’est pas dupliquée', apres.length === 1, apres.length)
check('la capacité est corrigée : 8 → 6', apres[0].pers === 6, apres[0].pers)
check('le prix est celui du groupe : 1 161 → 2 736 €', apres[0].total === 2736, apres[0].total)
check('la confiance suit', apres[0].priceConfidence === 'total_confirmed')
check('le barème arrive', apres[0].priceOptions?.length === 2)
check(
  'la distance aux pistes calculée localement survit',
  apres[0].dist === 340 && apres[0].den === 25 && apres[0].accessComputed === true,
  { dist: apres[0].dist, den: apres[0].den, accessComputed: apres[0].accessComputed }
)
check('l’altitude calculée survit', apres[0].alt === 1035, apres[0].alt)

const muet = lodging({ url: CHAMONIX, pers: 0, total: 0, priceConfidence: 'unknown' })
const apresMuet = mergeProviderReadings([enregistree], [muet])
check(
  'un relevé sans prix n’efface pas un prix déjà mesuré',
  apresMuet[0].total === 1161,
  apresMuet[0].total
)
check(
  'mais il efface bien une capacité qui pouvait être inventée',
  apresMuet[0].pers === 0,
  apresMuet[0].pers
)

const nouvelle = lodging({ url: 'https://booking.chamonix.com/fr/hotel-999', total: 900 })
const apresAjout = mergeProviderReadings([enregistree], [releve, nouvelle])
check('une annonce inconnue est ajoutée', apresAjout.length === 2)
check('et l’ordre des existantes est conservé', apresAjout[0].url === CHAMONIX)
check('relevé vide → liste inchangée', mergeProviderReadings([enregistree], []).length === 1)

console.log('\n10. Prix vérifié pour ces dates : la règle de l’écran Logements')
const STRICT: LodgingFilterCriteria = { ...CRITERIA, confirmedPricesOnly: true }
const confirme = (over: Partial<Lodging>): Lodging =>
  lodging({ pers: 8, ch: 4, total: 2000, priceConfidence: 'total_confirmed', ...over })

check(
  'un prix complet daté du séjour passe',
  matchesLodgingFilters(
    confirme({ priceCheckIn: STAY.checkIn, priceCheckOut: STAY.checkOut }),
    STRICT,
    STAY
  )
)
check(
  'un prix daté d’une autre semaine est écarté',
  !matchesLodgingFilters(
    confirme({ priceCheckIn: '2027-01-09', priceCheckOut: '2027-01-16' }),
    STRICT,
    STAY
  )
)
check('un prix non daté mais complet passe', matchesLodgingFilters(confirme({}), STRICT, STAY))
// Le relevé Airbnb (`airbnbMerge.ts`) date ses prix mais ne renseigne jamais
// `priceConfidence`. Exiger le seul drapeau écartait la totalité des annonces
// Airbnb : ne garder qu'elles rendait une liste vide sous un compte de 61.
check(
  'un prix Airbnb daté du séjour, sans drapeau de confiance, passe',
  matchesLodgingFilters(
    lodging({
      pers: 8,
      ch: 4,
      total: 2000,
      src: 'Airbnb',
      priceConfidence: undefined,
      priceCheckIn: STAY.checkIn,
      priceCheckOut: STAY.checkOut
    }),
    STRICT,
    STAY
  )
)
check(
  'mais daté d’une autre semaine, il reste écarté',
  !matchesLodgingFilters(
    lodging({
      pers: 8,
      ch: 4,
      total: 2000,
      src: 'Airbnb',
      priceConfidence: undefined,
      priceCheckIn: '2027-01-09',
      priceCheckOut: '2027-01-16'
    }),
    STRICT,
    STAY
  )
)
check(
  'et sans date ni drapeau, rien ne l’atteste : écarté',
  !matchesLodgingFilters(
    lodging({
      pers: 8,
      ch: 4,
      total: 2000,
      priceConfidence: undefined,
      priceCheckIn: undefined,
      priceCheckOut: undefined
    }),
    STRICT,
    STAY
  )
)
check(
  'un prix partiel est écarté',
  !matchesLodgingFilters(confirme({ priceConfidence: 'partial' }), STRICT, STAY)
)
check(
  'une carte sans prix est écartée',
  !matchesLodgingFilters(confirme({ total: 0 }), STRICT, STAY)
)
// La garde qui compte : sans elle, `confirmedPricesOnly` pourrait devenir un
// filtre inopérant sans qu'un seul test bronche.
check(
  'et la même carte sans prix passe quand la règle est levée',
  matchesLodgingFilters(confirme({ total: 0 }), CRITERIA, STAY)
)

console.log('\n10b. Tarif par nuit : jamais un séjour confirmé')
check(
  '89 €/nuit n’est pas un prix de séjour confirmé',
  !matchesLodgingFilters(
    confirme({ total: 0, nightly: 89, priceConfidence: 'partial' }),
    STRICT,
    STAY
  )
)

console.log('\n10c. CozyCozy n’est plus une source — cartes purgées à la fusion')
const cozyCard = lodging({
  url: 'https://www.cozycozy.com/fr/search/x',
  src: 'cozycozy-web',
  srcConnector: 'cozycozy-web',
  total: 89,
  priceConfidence: 'unknown'
})
check(
  'une carte CozyCozy déjà enregistrée est purgée',
  mergeProviderReadings([cozyCard], []).length === 0
)

console.log('\n10c-bis. Gîte de groupe — hors liste, même avec séjour daté')
const groupeCard = lodging({
  src: 'Gîtes de France',
  type: 'Gîte',
  url: 'https://www.gites-de-france.com/fr/isere/gite-de-groupe-alpe-38g253115',
  pers: 50,
  ch: 12,
  total: 2100,
  priceConfidence: 'total_confirmed'
})
check('URL gite-de-groupe écartée', isDroppedGitesOffer(groupeCard) === true)
check(
  'filtre UI écarte le gîte de groupe',
  matchesLodgingFilters(groupeCard, { ...CRITERIA, confirmedPricesOnly: true, includeUnannounced: false }, STAY) === false
)
check(
  'matchesDemand écarte le gîte de groupe',
  matchesDemand(groupeCard, { guests: 8, bedrooms: 4, datesSet: true }) === false
)
check(
  'fusion purge un gîte de groupe déjà enregistré',
  mergeProviderReadings([groupeCard], []).length === 0
)
const giteOk = lodging({
  src: 'Gîtes de France',
  type: 'Gîte',
  url: 'https://www.gites-de-france.com/fr/isere/chalet-les-copains-38g253122',
  pers: 14,
  ch: 5,
  total: 4261.52,
  priceConfidence: 'total_confirmed'
})
check('Gîte individuel (Copains 14 pers.) conservé', isDroppedGitesOffer(giteOk) === false)
const fauxSejour = lodging({
  url: 'https://www.booking.com/hotel/fr/x.html',
  src: 'Booking.com',
  total: 2448.4,
  priceConfidence: 'total_confirmed'
})
const relevéMuet = lodging({
  url: 'https://www.booking.com/hotel/fr/x.html',
  src: 'Booking.com',
  total: 0,
  nightly: 89,
  priceConfidence: 'partial'
})
const fusionMuet = mergeProviderReadings([fauxSejour], [relevéMuet])
check('un relevé sans séjour ne gomme pas le total confirmé', fusionMuet[0].total === 2448.4)

console.log('\n10d. Gîtes : tarif /semaine indicatif, pas un séjour de 1700 €')
check(
  '1700 €/semaine n’est pas un prix de séjour confirmé',
  !matchesLodgingFilters(
    confirme({ total: 0, weekly: 1700, priceConfidence: 'partial' }),
    STRICT,
    STAY
  )
)
const itea = lodging({
  url: 'https://www.gites-de-france.com/fr/x',
  src: 'Gîtes de France',
  srcConnector: 'gites-web',
  total: 2448.4,
  priceConfidence: 'total_confirmed'
})
const teaser = lodging({
  url: 'https://www.gites-de-france.com/fr/x',
  src: 'Gîtes de France',
  srcConnector: 'gites-web',
  total: 0,
  weekly: 1700,
  priceConfidence: 'partial'
})
const fusionItea = mergeProviderReadings([itea], [teaser])
check('le teaser /semaine ne remplace pas le total ITEA', fusionItea[0].total === 2448.4)

console.log('\n11. Notes ramenées sur 5, quelle que soit l’échelle de la source')
check('Booking 8,2 sur 10 devient 4,1', noteOnFive(8.2, 10) === '4,1', noteOnFive(8.2, 10))
check('Booking 10 sur 10 devient 5', noteOnFive(10, 10) === '5', noteOnFive(10, 10))
// Le cas qui rendait la conversion nécessaire : une note basse d'une source
// sur 10. Une heuristique « au-dessus de 5, donc sur 10 » l'aurait laissée
// telle quelle, et 4,8/10 se serait affiché comme un excellent 4,8/5.
check('Booking 4,8 sur 10 devient 2,4', noteOnFive(4.8, 10) === '2,4', noteOnFive(4.8, 10))
check('Airbnb 4,74 sur 5 est inchangé', noteOnFive(4.74, 5) === '4,7', noteOnFive(4.74, 5))
check('échelle absente → lue sur 5', noteOnFive(4.5, undefined) === '4,5', noteOnFive(4.5, undefined))
check('pas de note → chaîne vide', noteOnFive(undefined, 10) === '')
// Une note hors échelle signale une source dont le barème n'est pas déclaré.
// Absente vaut mieux que fausse : c'est la règle du projet.
check('note impossible → abandonnée', noteOnFive(8.2, undefined) === '', noteOnFive(8.2, undefined))

console.log('\n12. matchesDemand — 4p/2chb, null exclus, 0 studio')
const STRICT_PARTY: LodgingFilterCriteria = { ...CRITERIA, includeUnannounced: false, rooms: 2, travelers: 4 }
const demand42 = { guests: 4, bedrooms: 2, datesSet: true }
check(
  '4p/2chb, appart 4 pers 2 ch tarifé → retenu',
  matchesDemand(lodging({ pers: 4, ch: 2, total: 1200, availabilityStatus: 'available' }), demand42)
)
check(
  '4p/2chb, studio 1 pièce → 0 studio',
  !matchesDemand(lodging({ pers: 4, ch: 0, rooms: 1, type: 'Studio', total: 900 }), demand42)
)
check(
  '4p/2chb, type Studio → 0 studio',
  !matchesDemand(lodging({ pers: 8, ch: 0, rooms: 1, type: 'Studio', total: 900 }), demand42)
)
check(
  'capacité null (pers 0) → exclue',
  !matchesDemand(lodging({ pers: 0, ch: 2, total: 1200 }), demand42)
)
check(
  'chambres null (ch 0, rooms unset) → exclue',
  !matchesDemand(lodging({ pers: 4, ch: 0, total: 1200 }), demand42)
)
check(
  'listing_gone → exclue',
  !matchesDemand(
    lodging({ pers: 4, ch: 2, total: 1200, availabilityStatus: 'listing_gone' }),
    demand42
  )
)
check(
  '1 chambre demandée, studio + capacité OK → retenu',
  matchesDemand(lodging({ pers: 2, ch: 0, rooms: 1, type: 'Studio', total: 500, availabilityStatus: 'available' }), {
    guests: 2,
    bedrooms: 1,
    datesSet: true
  })
)
check('normalised : 5 pièces → 4 chambres', normalizedBedrooms(lodging({ pers: 8, ch: 0, rooms: 5 })) === 4)
check('normalised : studio 1 pièce → 0', normalizedBedrooms(lodging({ pers: 2, ch: 0, rooms: 1 })) === 0)
check(
  'UI 4p/2chb, includeUnannounced false, studio écarté',
  !keeps({ pers: 4, ch: 0, rooms: 1, type: 'Studio', total: 800 }, STRICT_PARTY)
)
check(
  'UI 4p/2chb, appart 4/2 retenu',
  keeps({ pers: 4, ch: 2, total: 1400, availabilityStatus: 'available' }, STRICT_PARTY)
)

console.log('\n12 bis. Plancher, pas un match exact — 8p/4chb')
const demand84 = { guests: 8, bedrooms: 4, datesSet: true }
check(
  '8p/4chb, gîte 14 pers 7 ch → retenu',
  matchesDemand(lodging({ pers: 14, ch: 7, total: 3200, availabilityStatus: 'available' }), demand84)
)
check(
  '8p/4chb, 8 pers 4 ch → retenu (plancher atteint)',
  matchesDemand(lodging({ pers: 8, ch: 4, total: 2400, availabilityStatus: 'available' }), demand84)
)
check(
  '8p/4chb, 16 pers 8 ch → retenu',
  matchesDemand(lodging({ pers: 16, ch: 8, total: 4800, availabilityStatus: 'available' }), demand84)
)
check(
  '8p/4chb, 7 pers 4 ch → trop petit',
  !matchesDemand(lodging({ pers: 7, ch: 4, total: 1800, availabilityStatus: 'available' }), demand84)
)
check(
  '8p/4chb, 8 pers 3 ch → trop petit',
  !matchesDemand(lodging({ pers: 8, ch: 3, total: 1800, availabilityStatus: 'available' }), demand84)
)
check(
  '8p/4chb, 6 pers 3 ch → trop petit',
  !matchesDemand(lodging({ pers: 6, ch: 3, total: 1400, availabilityStatus: 'available' }), demand84)
)
check(
  'partyVerdict 14/7 convient pour 8/4',
  partyVerdict(annonce({ pers: 14, ch: 7 }), PARTY) === 'convient'
)

console.log('\n12 ter. Appartement = chambres du bien ; hôtel = chambres combinables')
check(
  '8p/4chb, appart 8 pers 3 ch → trop petit (chambres du logement)',
  !matchesDemand(lodging({ pers: 8, ch: 3, type: 'Appartement', total: 1800, availabilityStatus: 'available' }), demand84)
)
check(
  '8p/4chb, hôtel chambre 2 pers / 1 ch → 4 chambres pour 8 pers',
  matchesDemand(lodging({ pers: 2, ch: 1, type: 'Hôtel', total: 900, availabilityStatus: 'available' }), demand84)
)
check(
  'combinable : hôtel 1 ch',
  isCombinableHotel(lodging({ pers: 2, ch: 1, type: 'Hôtel' }))
)
check(
  'non combinable : suite 3 ch',
  !isCombinableHotel(lodging({ pers: 6, ch: 3, type: 'Hôtel' }))
)
check(
  '8p/4chb, suite hôtel 3 ch / 6 pers → trop petit (unité)',
  !matchesDemand(lodging({ pers: 6, ch: 3, type: 'Hôtel', total: 2100, availabilityStatus: 'available' }), demand84)
)
check('4 chambres × occ. 2 = 4', hotelRoomsNeeded(2, { guests: 8, bedrooms: 4 }) === 4)
check('occ. 1 → 8 chambres', hotelRoomsNeeded(1, { guests: 8, bedrooms: 4 }) === 8)
check(
  'appart-hôtel 3 ch n’est pas un hôtel combinable',
  !isCombinableHotel(lodging({ pers: 6, ch: 3, type: 'Appart-hôtel' }))
)
check(
  'partyVerdict hôtel 2p/1ch convient pour 8/4',
  partyVerdict(annonce({ pers: 2, ch: 1, type: 'Hôtel' }), PARTY) === 'convient'
)
check(
  'partyVerdict appart 8p/3ch trop-petit',
  partyVerdict(annonce({ pers: 8, ch: 3, type: 'Appartement' }), PARTY) === 'trop-petit'
)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log('\nFiltre Logements : tous les cas passent.')
