/**
 * Le découpage en lots de l'appel au moteur local.
 *
 * Le cas qui a motivé ce fichier, constaté le 2026-08-30 sur le profil réel :
 * un domaine de 349 annonces affichait « Distances aux pistes non calculées
 * (Trop de logements en un appel (349 > 200). Découpez la recherche.) ». Le
 * moteur borne un appel à 200 logements — `MAX_LODGINGS`, voir
 * `sidecar/skitrack/api/routes/lodgings.py` — et son message dit quoi faire ;
 * personne ne le faisait, et la totalité des distances était perdue dès qu'un
 * domaine dépassait la borne. Aucun test ne pouvait le voir : l'appel partait
 * en dur vers `api.lodgingsAccess`.
 *
 * Le découpage ne se relit pas, il se compte. Ces cas passent donc un
 * `AccessCaller` qui note la taille de chaque requête reçue.
 *
 *   npm run access:test
 */

import { configureClient } from '@/api/client'
import type { LodgingAccessRequest, LodgingAccessResponse } from '@/api/types'
import { enrichWithAccess, type AccessCaller } from './lodgingAccess'
import type { Lodging } from './lodgings'

// `enrichWithAccess` refuse avant toute requête tant que le client n'a pas reçu
// son URL de base. Ce n'est pas un contournement : c'est le handshake Electron,
// joué à la main.
configureClient('http://127.0.0.1:0', 'test')

let failures = 0
const check = (label: string, ok: boolean, seen?: unknown): void => {
  if (ok) {
    console.log(`  ✓ ${label}`)
    return
  }
  failures++
  console.error(`  ✗ ${label}${seen === undefined ? '' : ` — vu : ${String(seen)}`}`)
}

/**
 * N annonces positionnées, toutes distinctes par leur `id`.
 *
 * Le contrat complet est écrit, sans raccourci de transtypage : les mesures
 * sont recollées par `id`, et un objet approximatif ferait passer le test pour
 * de mauvaises raisons.
 */
const lodgings = (n: number, from = 0): Lodging[] =>
  Array.from({ length: n }, (_, i): Lodging => {
    const at = from + i
    return {
      id: at,
      name: `Annonce ${at}`,
      type: 'appart',
      pers: 0,
      ch: 0,
      m2: null,
      note: '4,5',
      avis: 12,
      dist: 0,
      walk: 0,
      den: 0,
      skiIn: false,
      src: 'Airbnb',
      pp: 150,
      lift: '',
      liftDist: 0,
      photo: '',
      annul: false,
      total: 900,
      alt: 0,
      stock: 1,
      lat: 45.3 + at / 10000,
      lon: 6.58 + at / 10000
    }
  })

/**
 * Un moteur de bureau d'études : il note ce qu'on lui demande, refuse
 * exactement comme le vrai au-delà de 200, et peut tomber en panne sur les
 * `panne` premiers lots.
 */
function moteur(options: { panne?: number } = {}): {
  call: AccessCaller
  lots: number[]
} {
  const lots: number[] = []
  let restantes = options.panne ?? 0
  const call: AccessCaller = async (body: LodgingAccessRequest) => {
    lots.push(body.lodgings.length)
    // La borne du sidecar, reproduite : sans elle, ce test passerait même si le
    // découpage disparaissait.
    if (body.lodgings.length > 200) {
      throw new Error(
        `Trop de logements en un appel (${body.lodgings.length} > 200). Découpez la recherche.`
      )
    }
    if (restantes > 0) {
      restantes--
      throw new Error('moteur en panne')
    }
    const response: LodgingAccessResponse = {
      domain_id: body.domain_id,
      slopes_available: 0,
      lifts_available: 12,
      results: body.lodgings.map((item) => ({
        ref: item.ref,
        dist_to_nearest_slope_m: null,
        denivele_to_slope_m: null,
        dist_to_nearest_lift_m: 300,
        denivele_to_lift_m: null,
        dist_to_slopes_m: 300,
        denivele_m: 40,
        dist_to_center_m: null,
        altitude_m: 1500,
        slope_access_type: 'navette',
        precision: 'exact'
      }))
    }
    return response
  }
  return { call, lots }
}

const mesures = (list: Lodging[]): number => list.filter((lg) => lg.accessComputed).length

async function main(): Promise<void> {
  console.log('1. 349 annonces — le domaine qui ne calculait plus rien')
  {
    const { call, lots } = moteur()
    const out = await enrichWithAccess(lodgings(349), 42, call)
    check('deux lots : 200 puis 149', JSON.stringify(lots) === '[200,149]', JSON.stringify(lots))
    check('les 349 portent leur distance', mesures(out.lodgings) === 349, mesures(out.lodgings))
    check(
      'et rien ne parle d’échec',
      out.note === 'Distances aux pistes calculées pour 349 logement(s).',
      out.note
    )
  }

  console.log('\n2. La borne elle-même')
  {
    const { call, lots } = moteur()
    await enrichWithAccess(lodgings(200), 42, call)
    check('200 pile tient en un lot', JSON.stringify(lots) === '[200]', JSON.stringify(lots))
  }
  {
    const { call, lots } = moteur()
    await enrichWithAccess(lodgings(201), 42, call)
    check('201 en fait deux', JSON.stringify(lots) === '[200,1]', JSON.stringify(lots))
  }

  console.log('\n3. Les annonces sans position ne partent pas, et ne bloquent rien')
  {
    const { call, lots } = moteur()
    // Des `id` distincts de ceux du premier lot : les mesures sont recollées
    // par `id`, et deux annonces qui en partagent un se recopieraient l'une sur
    // l'autre — ce que le test irait alors prendre pour une réussite.
    const sans = lodgings(3, 900).map(
      (lg): Lodging => ({ ...lg, lat: undefined, lon: undefined })
    )
    const out = await enrichWithAccess([...lodgings(5), ...sans], 42, call)
    check('cinq positions envoyées, pas huit', JSON.stringify(lots) === '[5]', JSON.stringify(lots))
    check('les trois sans position sont rendues intactes', out.lodgings.length === 8)
    check('et seules les cinq positionnées sont mesurées', mesures(out.lodgings) === 5)
  }

  console.log('\n4. Un échec de source reste local')
  {
    const { call } = moteur({ panne: 1 })
    const out = await enrichWithAccess(lodgings(349), 42, call)
    check('le second lot est mesuré malgré la panne du premier', mesures(out.lodgings) === 149)
    // Le compte est dit, et le total avec : « calculées pour 149 » seul
    // laisserait croire que 149 était tout ce qu'il y avait à mesurer.
    check(
      'le message dit combien manquent, et pourquoi',
      out.note ===
        'Distances aux pistes calculées pour 149 logement(s) sur 349 — un lot a échoué (moteur en panne).',
      out.note
    )
  }
  {
    const { call } = moteur({ panne: 9 })
    const out = await enrichWithAccess(lodgings(349), 42, call)
    check('moteur muet : aucune mesure', mesures(out.lodgings) === 0)
    check('les annonces sont rendues quand même', out.lodgings.length === 349)
    check(
      'et l’échec est signalé, pas transformé en erreur',
      out.note === 'Distances aux pistes non calculées (moteur en panne).',
      out.note
    )
  }

  console.log('\n5. Domaine importé sans tracés ni remontées')
  {
    const call: AccessCaller = async (body) => ({
      domain_id: body.domain_id,
      slopes_available: 0,
      lifts_available: 0,
      // Un domaine sans géométrie renvoie bien une ligne par logement, toutes
      // nulles : c'est le nombre de tracés qui fait foi, pas le nombre de
      // lignes. Confondre les deux ferait disparaître ce message.
      results: body.lodgings.map((item) => ({
        ref: item.ref,
        dist_to_nearest_slope_m: null,
        denivele_to_slope_m: null,
        dist_to_nearest_lift_m: null,
        denivele_to_lift_m: null,
        dist_to_slopes_m: null,
        denivele_m: null,
        dist_to_center_m: null,
        altitude_m: null,
        slope_access_type: null,
        precision: 'exact'
      }))
    })
    const out = await enrichWithAccess(lodgings(300), 42, call)
    check(
      'le motif est nommé',
      out.note ===
        'Ce domaine a été importé sans ses tracés ni ses remontées : distances non calculables.',
      out.note
    )
    check('et rien n’est prétendu mesuré', mesures(out.lodgings) === 0)
  }

  console.log('\n6. Domaine non rapproché du moteur : aucune requête')
  {
    const { call, lots } = moteur()
    const out = await enrichWithAccess(lodgings(10), undefined, call)
    check('rien n’est parti', lots.length === 0)
    check(
      'et le motif est dit',
      out.note === 'Ce domaine n’est pas rapproché du moteur local — distances non calculables.',
      out.note
    )
  }

  if (failures > 0) {
    console.error(`\n${failures} test(s) en échec.`)
    process.exit(1)
  }
  console.log('\nAccès aux pistes : le découpage tient, et chaque panne est dite.')
}

void main()
