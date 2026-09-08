/**
 * Le découpage en lots de l'enrichissement d'accès.
 *
 * Le sidecar refuse plus de 200 logements par appel. `enrichWithAccess` en
 * envoyait la totalité d'un coup : sur un relevé réel de 358 logements
 * (Méribel, 2026-08-31), l'appel repartait en 413 et le `catch` rendait la
 * liste **inchangée** — zéro distance calculée, alors que 200 étaient à
 * portée. L'écran disait « Découpez la recherche », c'est-à-dire demandait à
 * l'utilisateur de faire à la main ce que le code pouvait faire.
 *
 * Ce qui est vérifié ici est ce qu'une relecture ne garantit pas : que les
 * lots respectent le plafond du serveur, qu'ils partent tous, et surtout qu'un
 * lot en échec n'emporte pas les autres — la règle déjà tenue par les
 * itinéraires en masse (`domain/travel.ts`).
 *
 *   npm run lodgaccess:test
 */

import { enrichWithAccess } from './lodgingAccess'
import type { Lodging } from './lodgings'

let failures = 0
const check = (label: string, condition: boolean): void => {
  if (condition) return
  failures++
  console.error(`FAIL  ${label}`)
}

interface Payload {
  lodgings: { ref: string; lat?: number | null; lon?: number | null; address?: string | null }[]
}
interface Stub {
  ready?: boolean
  calls: Payload[]
  handler: (payload: Payload) => unknown
}
const g = globalThis as unknown as { __ACCESS_STUB__?: Stub }

/** Une réponse du sidecar qui mesure tout le lot, à 100 m des pistes. */
const repondre = (payload: Payload): unknown => ({
  domain_id: 1,
  slopes_available: 42,
  lifts_available: 7,
  results: payload.lodgings.map((item) => ({
    ref: item.ref,
    dist_to_slopes_m: 100,
    denivele_m: 10,
    dist_to_nearest_slope_m: 100,
    dist_to_nearest_lift_m: 250,
    altitude_m: 1800,
    altitude_source: 'ign',
    slope_access_type: 'a_pied',
    lat: item.lat ?? 45.1654,
    lon: item.lon ?? 6.4291,
    location_precision: item.lat == null ? 'address' : 'exact',
    geocode_source: item.lat == null ? 'ban' : 'provider'
  }))
})

const lots = (n: number): Lodging[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, lat: 45.4, lon: 6.57 }) as unknown as Lodging)

// --- 358 logements : deux lots, tout est mesuré -----------------------------

g.__ACCESS_STUB__ = { calls: [], handler: repondre }
const gros = await enrichWithAccess(lots(358), 1)
const appels = g.__ACCESS_STUB__.calls

check('358 logements partent en 2 lots', appels.length === 2)
check('aucun lot ne dépasse le plafond du sidecar', appels.every((c) => c.lodgings.length <= 200))
check('les deux lots couvrent tout le monde', appels[0].lodgings.length + appels[1].lodgings.length === 358)
check('aucun logement en double entre les lots', new Set(appels.flatMap((c) => c.lodgings.map((l) => l.ref))).size === 358)
check(
  'les 358 sont enrichis',
  gros.lodgings.filter((l) => l.accessComputed).length === 358
)
check('altitude IGN recopiée, jamais un texte d’annonce', gros.lodgings[0]?.altSource === 'ign')
check('distance aux pistes = min piste/remontée (100), pas la seule gare', gros.lodgings[0]?.dist === 100)
check('distance gare aval conservée en plus (liftDist)', gros.lodgings[0]?.liftDist === 250)
check('la note annonce le compte', gros.note === 'Distances aux pistes calculées pour 358 logement(s).')

// --- Un lot échoue : les autres tiennent ------------------------------------

let appel = 0
g.__ACCESS_STUB__ = {
  calls: [],
  handler: (payload) => {
    appel++
    if (appel === 2) throw new Error('413')
    return repondre(payload)
  }
}
const partiel = await enrichWithAccess(lots(358), 1)

check(
  'le lot survivant est conservé',
  partiel.lodgings.filter((l) => l.accessComputed).length === 200
)
check(
  'et le reste est dit, pas tu',
  partiel.note === 'Distances aux pistes calculées pour 200 logement(s). 1 lot(s) sur 2 n’ont pas abouti.'
)

// --- Tous les lots échouent : rien n'est inventé -----------------------------

g.__ACCESS_STUB__ = {
  calls: [],
  handler: () => {
    throw new Error('moteur coupé')
  }
}
const rien = await enrichWithAccess(lots(358), 1)

check('aucun logement n’est modifié', rien.lodgings.every((l) => l.accessComputed == null))
check('le motif est rapporté tel quel', rien.note === 'Distances aux pistes non calculées (moteur coupé).')

// --- Un seul lot quand la liste est petite ----------------------------------

g.__ACCESS_STUB__ = { calls: [], handler: repondre }
await enrichWithAccess(lots(12), 1)
check('12 logements tiennent en un seul appel', g.__ACCESS_STUB__.calls.length === 1)

// --- Le domaine sans tracés reste annoncé comme tel --------------------------

g.__ACCESS_STUB__ = {
  calls: [],
  handler: (payload) => ({ ...(repondre(payload) as object), slopes_available: 0, lifts_available: 0 })
}
const sansTraces = await enrichWithAccess(lots(250), 1)
check(
  'sans tracés ni remontées, on le dit au lieu de mesurer',
  sansTraces.note === 'Ce domaine a été importé sans ses tracés ni ses remontées : distances non calculables.'
)

// --- Adresse sans GPS : le lot part quand même, le GPS raffiné est recollé ---

g.__ACCESS_STUB__ = { calls: [], handler: repondre }
const adresseSeule = await enrichWithAccess(
  [{ id: 99, addressText: "3 place de l'Église, 73450 Valloire" } as Lodging],
  1
)
check('une adresse sans GPS part au moteur', g.__ACCESS_STUB__.calls[0]?.lodgings.length === 1)
check('le GPS BAN est recollé', adresseSeule.lodgings[0]?.lat === 45.1654)

g.__ACCESS_STUB__ = { calls: [], handler: repondre }
await enrichWithAccess([{ id: 7, lat: 0, lon: 0 } as Lodging], 1)
check('(0, 0) n’est pas envoyé comme un logement', (g.__ACCESS_STUB__.calls[0]?.lodgings.length ?? 0) === 0)

g.__ACCESS_STUB__ = { calls: [], handler: repondre }
await enrichWithAccess(
  [{ id: 3, name: 'Chalet les Copains', lat: 45.01, lon: 6.12, ch: 0, pers: 0 } as Lodging],
  1
)
const envoyé = g.__ACCESS_STUB__.calls[0]?.lodgings[0] as
  | { name?: string | null; bedrooms?: number | null; capacity_max?: number | null }
  | undefined
check('le nom part au moteur (collage OSM)', envoyé?.name === 'Chalet les Copains')
check('chambres inconnues → null, pas 0', envoyé?.bedrooms == null)
check('capacité inconnue → null, pas 0', envoyé?.capacity_max == null)

g.__ACCESS_STUB__ = {
  calls: [],
  handler: (payload) => ({
    ...(repondre(payload) as object),
    results: payload.lodgings.map((item) => ({
      ...(repondre(payload) as { results: object[] }).results[0],
      ref: item.ref,
      bedrooms: 3,
      capacity_max: 8,
      capacity_source: 'osm'
    }))
  })
}
const osmFill = await enrichWithAccess(
  [{ id: 4, name: 'Chalet les Copains', lat: 45.01, lon: 6.12, ch: 0, pers: 0 } as Lodging],
  1
)
check('OSM remplit 8 pers. quand le provider se tait', osmFill.lodgings[0]?.pers === 8)
check('OSM remplit 3 ch.', osmFill.lodgings[0]?.ch === 3)
check('la source reste osm', osmFill.lodgings[0]?.capacitySource === 'osm')

if (failures > 0) {
  console.error(`\n${failures} échec(s).`)
  process.exit(1)
}
console.log('Découpage de l’enrichissement d’accès : tous les cas passent.')
