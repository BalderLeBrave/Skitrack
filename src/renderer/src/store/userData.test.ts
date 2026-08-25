/**
 * La couche de données utilisateur : favoris, séjours, et ce qu'elle refuse.
 *
 *   npm run userdata:test
 */

import {
  __setBackendForTest,
  addFavorite,
  clearUserData,
  getFavorites,
  getTrips,
  importTrip,
  parseSavedTrip,
  removeFavorite,
  removeTrip,
  saveTrip,
  toggleFavorite,
  type SavedTripInput
} from './userData'

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(
    `  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`
  )
  if (!condition) failures++
}

/** Support de stockage inspectable : on veut voir ce qui est réellement écrit. */
function spyBackend(): { store: Map<string, string>; read: (k: string) => string | null; write: (k: string, v: string) => void; remove: (k: string) => void } {
  const store = new Map<string, string>()
  return {
    store,
    read: (k) => store.get(k) ?? null,
    write: (k, v) => void store.set(k, v),
    remove: (k) => void store.delete(k)
  }
}

const TRIP: SavedTripInput = {
  label: 'La Plagne · févr.',
  stationId: 42,
  dates: { from: '2027-02-07', to: '2027-02-14' },
  party: { adults: 2, children: 2 },
  budget: { max: 3200, mode: 'total' }
}

async function main(): Promise<void> {
  console.log('\n1. Favoris — ajout, idempotence, retrait')
  let be = spyBackend()
  __setBackendForTest(be)

  check('liste vide au départ', (await getFavorites()).length === 0)

  await addFavorite(7)
  await addFavorite(9)
  const favs = await getFavorites()
  check('deux favoris enregistrés', favs.length === 2, favs)
  check('le plus récent en tête', favs[0].stationId === 9, favs.map((f) => f.stationId))

  const before = (await getFavorites()).find((f) => f.stationId === 7)?.addedAt
  await addFavorite(7)
  const after = (await getFavorites()).find((f) => f.stationId === 7)?.addedAt
  check('réétoiler ne duplique pas', (await getFavorites()).length === 2)
  check('réétoiler ne redate pas', before === after, { before, after })

  await removeFavorite(9)
  check('retrait effectif', (await getFavorites()).length === 1)
  check('la bonne station reste', (await getFavorites())[0].stationId === 7)

  await toggleFavorite(7)
  check('bascule retire un favori posé', (await getFavorites()).length === 0)
  await toggleFavorite(7)
  check('bascule repose un favori absent', (await getFavorites()).length === 1)

  console.log('\n2. Favoris — persistance et données corrompues')
  check('écrit sous la clé versionnée', be.store.has('skitrack.favorites.v1'), [...be.store.keys()])

  be.store.set('skitrack.favorites.v1', '{ ceci n’est pas du JSON')
  check('JSON illisible : liste vide, pas de crash', (await getFavorites()).length === 0)

  be.store.set('skitrack.favorites.v1', JSON.stringify([{ stationId: 3 }, { stationId: 'sept' }, null, 42]))
  const mixed = await getFavorites()
  check('les entrées invalides sont écartées', mixed.length === 1, mixed)
  check('sans horodatage, addedAt vaut 0', mixed[0].addedAt === 0)

  console.log('\n3. Séjours — enregistrement et relecture')
  be = spyBackend()
  __setBackendForTest(be)

  await saveTrip(TRIP)
  const trips = await getTrips()
  check('un séjour enregistré', trips.length === 1, trips)
  check('libellé conservé', trips[0].label === TRIP.label)
  check('station conservée', trips[0].stationId === 42)
  check('dates conservées', trips[0].dates.from === '2027-02-07' && trips[0].dates.to === '2027-02-14')
  check('groupe conservé', trips[0].party.adults === 2 && trips[0].party.children === 2)
  check('budget conservé', trips[0].budget?.max === 3200 && trips[0].budget?.mode === 'total')
  check('identité attribuée', typeof trips[0].id === 'string' && trips[0].id.length > 0)

  console.log('\n4. Séjours — même station et mêmes dates = même séjour')
  await saveTrip({ ...TRIP, budget: { max: 2500, mode: 'total' } })
  const after2 = await getTrips()
  check('la liste ne double pas', after2.length === 1, after2.length)
  check('le budget est celui du dernier enregistrement', after2[0].budget?.max === 2500)
  check('l’identité est conservée', after2[0].id === trips[0].id)

  await saveTrip({ ...TRIP, dates: { from: '2027-03-07', to: '2027-03-14' } })
  check('des dates différentes font un second séjour', (await getTrips()).length === 2)

  await removeTrip(after2[0].id)
  check('retrait par identité', (await getTrips()).length === 1)

  console.log('\n5. Séjours — un budget absent reste absent')
  be = spyBackend()
  __setBackendForTest(be)
  await saveTrip({ ...TRIP, budget: null })
  check('budget null relu comme null', (await getTrips())[0].budget === null)

  console.log('\n6. parseSavedTrip — ce qui est refusé')
  const valid = { ...TRIP, id: 'x', createdAt: 1, updatedAt: 1 }
  check('un séjour complet passe', parseSavedTrip(valid) !== null)
  check('non-objet refusé', parseSavedTrip('non') === null)
  check('null refusé', parseSavedTrip(null) === null)
  check('station manquante refusée', parseSavedTrip({ ...valid, stationId: undefined }) === null)
  check('station non numérique refusée', parseSavedTrip({ ...valid, stationId: 'douze' }) === null)
  check('libellé vide refusé', parseSavedTrip({ ...valid, label: '   ' }) === null)
  check('libellé démesuré refusé', parseSavedTrip({ ...valid, label: 'x'.repeat(200) }) === null)
  check('date mal formée refusée', parseSavedTrip({ ...valid, dates: { from: '07/02/2027', to: '2027-02-14' } }) === null)
  check(
    'date inexistante refusée',
    parseSavedTrip({ ...valid, dates: { from: '2027-02-31', to: '2027-03-14' } }) === null
  )
  check('départ après retour refusé', parseSavedTrip({ ...valid, dates: { from: '2027-02-14', to: '2027-02-07' } }) === null)
  check('groupe sans adulte refusé', parseSavedTrip({ ...valid, party: { adults: 0, children: 2 } }) === null)
  check('groupe démesuré refusé', parseSavedTrip({ ...valid, party: { adults: 1e9, children: 0 } }) === null)
  check('groupe manquant refusé', parseSavedTrip({ ...valid, party: undefined }) === null)

  console.log('\n7. parseSavedTrip — le budget à moitié lisible est écarté en entier')
  check('mode inconnu : budget écarté', parseSavedTrip({ ...valid, budget: { max: 100, mode: 'lune' } })?.budget === null)
  check('plafond illisible : budget écarté', parseSavedTrip({ ...valid, budget: { max: 'cher', mode: 'total' } })?.budget === null)
  check('budget absent : null', parseSavedTrip({ ...valid, budget: undefined })?.budget === null)
  check(
    'budget complet : conservé',
    parseSavedTrip({ ...valid, budget: { max: 900, mode: 'perso' } })?.budget?.mode === 'perso'
  )
  check('le reste du séjour survit à un budget écarté', parseSavedTrip({ ...valid, budget: { max: 0, mode: 'total' } })?.stationId === 42)

  console.log('\n8. Import d’un séjour constitué')
  be = spyBackend()
  __setBackendForTest(be)
  const imported = parseSavedTrip(valid)
  check('le séjour de référence est valide', imported !== null)
  if (imported) {
    await importTrip(imported)
    check('séjour importé présent', (await getTrips()).length === 1)
    await importTrip(imported)
    check('réimporter le même séjour ne duplique pas', (await getTrips()).length === 1)
  }

  console.log('\n9. Purge')
  await addFavorite(1)
  await clearUserData()
  check('favoris effacés', (await getFavorites()).length === 0)
  check('séjours effacés', (await getTrips()).length === 0)
  check('les clés sont retirées du stockage', !be.store.has('skitrack.favorites.v1') && !be.store.has('skitrack.trips.v1'))

  if (failures > 0) {
    console.error(`\n${failures} test(s) en échec.`)
    process.exit(1)
  }
  console.log('\nuserData : 45 contrôles — la couche est étanche et ne répare jamais ce qu’elle ne comprend pas.')
}

void main()
