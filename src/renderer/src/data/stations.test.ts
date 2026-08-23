/**
 * Alignement des noms de stations sur `tools/skitrack_v25.py`.
 *
 * Le collecteur autonome et l'application doivent nommer les stations pareil,
 * sans quoi leurs résultats ne se rapprochent plus : la colonne `site` des
 * fichiers produits par le collecteur porte les libellés de `STATIONS`, et
 * c'est sous ces mêmes libellés que l'application interroge les sites de
 * réservation.
 *
 * Le fichier Python est **lu**, jamais modifié : c'est lui qui fait foi. Ce
 * test échoue si `V25_STATIONS` s'écarte de sa liste `STATIONS`, si un domaine
 * du référentiel livré se met à chercher sous un libellé inconnu du collecteur,
 * ou si un nom de station redevient un libellé de domaine relié.
 *
 *   npm run stations:test
 */

import { readFileSync } from 'node:fs'
import { BUNDLED_REFERENTIAL } from './referentiel'
import { V25_STATIONS, bookingCentralOf, isV25Station, officialSiteOf, stationNameOf, stationOrigin } from './stations'
import { centralCapabilityOf } from './centralCapability'

const V25_PATH = 'tools/skitrack_v25.py'

/**
 * Liste `STATIONS` telle qu'elle est écrite dans le fichier Python.
 *
 * Lue au texte plutôt qu'importée : on ne fait pas tourner un interpréteur
 * Python pour un test TypeScript, et le littéral est une simple suite de
 * chaînes entre guillemets — ce que la lecture ne saurait mal interpréter.
 */
function stationsFromPython(): string[] {
  const source = readFileSync(V25_PATH, 'utf-8')
  const start = source.indexOf('STATIONS = [')
  if (start === -1) throw new Error(`${V25_PATH} : liste STATIONS introuvable`)
  const end = source.indexOf('\n]', start)
  const block = source.slice(start, end)
  const names: string[] = []
  for (const line of block.split('\n')) {
    // Les commentaires de regroupement (« ===== ALPES DU NORD ===== ») sont
    // écartés avant lecture : ils contiennent des mots, pas des chaînes.
    const code = line.split('#')[0]
    for (const match of code.matchAll(/"([^"]*)"/g)) names.push(match[1])
  }
  return names
}

let failures = 0
const fail = (what: string, detail: string): void => {
  failures++
  console.error(`FAIL  ${what} — ${detail}`)
}

// 1. `V25_STATIONS` est bien la liste du fichier Python, dédoublonnée.
const python = stationsFromPython()
const expected = [...new Set(python)]
if (expected.length === 0) fail('STATIONS', 'aucune station lue dans le fichier Python')
if (expected.join('|') !== V25_STATIONS.join('|')) {
  const missing = expected.filter((s) => !V25_STATIONS.includes(s))
  const extra = V25_STATIONS.filter((s) => !expected.includes(s))
  fail(
    'V25_STATIONS',
    `copie désynchronisée de ${V25_PATH} : ${missing.length} manquante(s) ${JSON.stringify(missing.slice(0, 5))}, ` +
      `${extra.length} en trop ${JSON.stringify(extra.slice(0, 5))}`
  )
}

/**
 * Stations absentes de `STATIONS`, et c'est normal : le collecteur ne couvre
 * pas ces domaines. Elles sont listées une à une pour qu'un nom qui glisse hors
 * de l'alignement se voie, au lieu de se fondre dans un compteur.
 */
const HORS_V25 = new Set([
  'Alpe du Grand Serre',
  'Auris-en-Oisans',
  'Beuil',
  'Chamrousse',
  'Corrençon-en-Vercors',
  'Crest-Voland Cohennoz',
  'Espace Cambre d\'Aze',
  'Espace Nordique du Capcir',
  'Flumet',
  'Gavarnie-Gèdre',
  'Hirmentaz',
  'Iraty',
  'La Joue du Loup',
  'Le Chioula',
  'Le Haut Pilat',
  'Le Mourtis',
  'Le Sauze',
  'Les 7 Laux',
  'Les Brasses',
  'Les Plans d\'Hotonnes',
  'Manigod',
  'Montclar',
  'Oz-en-Oisans',
  'Plateau des Glières',
  'Puy-Saint-Vincent',
  'Saint-Jean-d\'Arves',
  'Sainte-Foy-Tarentaise',
  'Savoie Grand Revard',
  'Superbagnères',
  'Thollon-les-Mémises',
  'Val Cenis',
  'Val d\'Azun',
  'Valfréjus',
  'Vallorcine',
  'Valmorel'
])

// 2. Chaque domaine du référentiel livré cherche sous un nom connu du
//    collecteur, ou sous un nom explicitement admis comme hors périmètre.
for (const domain of BUNDLED_REFERENTIAL.domaines) {
  const station = stationNameOf(domain.name)
  if (!station) {
    fail(domain.name, 'aucun nom de station')
    continue
  }
  if (stationOrigin(domain.name) === 'v25') {
    if (!isV25Station(station)) fail(domain.name, `« ${station} » annoncé v25 mais absent de STATIONS`)
    continue
  }
  if (!HORS_V25.has(station)) {
    fail(domain.name, `« ${station} » n'est ni dans STATIONS ni dans la liste hors périmètre`)
  }
}

// 3. Un nom de station n'est pas un libellé de domaine relié : ni tiret
//    cadratin, ni énumération, ni altitude accolée.
for (const domain of BUNDLED_REFERENTIAL.domaines) {
  const station = stationNameOf(domain.name)
  if (/[\u2013\u2014]/.test(station)) fail(domain.name, `« ${station} » garde un domaine relié`)
  if (station.includes(',')) fail(domain.name, `« ${station} » garde une énumération`)
}

// 4. Les sites officiels sont des adresses HTTPS exploitables.
let sites = 0
for (const domain of BUNDLED_REFERENTIAL.domaines) {
  const site = officialSiteOf(domain.name)
  if (!site) continue
  sites++
  try {
    const url = new URL(site.url)
    if (url.protocol !== 'https:') fail(domain.name, `site officiel non HTTPS : ${site.url}`)
  } catch {
    fail(domain.name, `site officiel illisible : ${site.url}`)
  }
}

// 5. Lookup de la centrale : nom de domaine composite autant que nom court.
const CENTRAL_CASES: [string, string][] = [
  ['Les 2 Alpes', 'reservation.les2alpes.com'],
  ["Alpe d'Huez Grand Domaine", 'reservation.alpedhuez.com'],
  ["Alpe d'Huez", 'reservation.alpedhuez.com'],
  ['Avoriaz', 'reservation.avoriaz.com'],
  ['Avoriaz 1800', 'reservation.avoriaz.com'],
  ['Chamonix', 'booking.chamonix.com'],
  ['Chamonix-Mont-Blanc', 'booking.chamonix.com'],
  ['Tignes', 'reservation.tignes.net'],
  ['Tignes – Val d’Isère', 'reservation.tignes.net'],
  ['Val Thorens', 'reservation.valthorens.com'],
  ['Megève', 'megeve-booking.com'],
  ['Méribel', 'reservations.meribel.net'],
  ['La Plagne', 'laplagneresort.com'],
  ['La Toussuire', 'reservation.la-toussuire.com'],
  ['La Bresse Hohneck', 'reservation.labresse.net'],
  ['Sainte-Foy-Tarentaise', 'saintefoy-reservation.com'],
  ['Valmorel', 'valmorel.com'],
  ['Orcières', 'reservation.orcieres.com'],
  ['Les Carroz', 'reservation.lescarroz.com'],
  ['Les Gets', 'reservation.lesgets.com'],
  ['Les Gets – Morzine', 'reservation.lesgets.com'],
  ['Serre Chevalier', 'reservation.serre-chevalier.com'],
  ['Valloire', 'www.valloire.com'],
  ['Vars', 'alpes-sudlocations.com'],
  ['Barèges', 'n-py.com'],
  ['La Mongie', 'n-py.com'],
  ['Le Grand-Bornand', 'reservation.legrandbornand.com'],
  ['Les Rousses', 'lesrousses-reservation.com'],
  ['Gourette', 'n-py.com'],
  ['Piau Engaly', 'n-py.com'],
  ['Les Deux Alpes 1800', 'reservation.les2alpes.com'],
  ['Oz-en-Oisans', 'oz-en-oisans.com'],
  ['Montchavin – Les Coches', 'laplagneresort.com'],
  ['Peisey-Nancroix', 'peisey-vallandry.com'],
  ['La Féclaz', 'chamberymontagnes.com'],
  ['Corrençon-en-Vercors', 'villarddelans-correnconenvercors.com'],
  ['Hauteluce', 'reservation.lessaisies.com'],
  ['Super-Besse – Le Sancy', 'sancy.com'],
  ['Saint-Gervais – Le Bettex', 'saintgervais.com'],
  ['Manigod – La Croix Fry', 'manigod.com'],
  ['Bessans', 'ac63-bessans.htm'],
  ['Valfréjus', 'ac51-valfrejus.htm'],
  ['Landry', 'peisey-vallandry.com'],
  ['Saint-Nicolas-de-Véroce', 'saintgervais.com'],
  ['Pra Loup', 'yoplanning.pro'],
  ['Flaine', 'flaine.com'],
  ['Bellefontaine', 'lesrousses-reservation.com'],
  ['Luz Ardiden', 'luz-ardiden.com'],
  ['Le Sauze', 'sauze.com']
]
for (const [name, host] of CENTRAL_CASES) {
  const url = bookingCentralOf(name)
  if (!url || !url.includes(host)) {
    fail(name, `centrale attendue ${host}, obtenu ${url ?? 'null'}`)
  }
}

const CAP_CASES: [string, 'live' | 'link', string][] = [
  ['https://reservation.les2alpes.com/', 'live', 'station-web'],
  ['https://reservation.la-toussuire.com/', 'live', 'opensystem'],
  ['https://www.n-py.com/fr/grand-tourmalet', 'live', 'opensystem'],
  ['https://reservation.les7laux.com/', 'link', ''],
  ['https://www.valfrejus.com/', 'link', ''],
  ['https://reservation.vaujany.com/', 'link', ''],
  ['https://www.sancy.com/hebergement/', 'link', ''],
  ['https://www.alpes-sudlocations.com/reservation-sejour-vars/', 'link', ''],
  ['https://www.oz-en-oisans.com/ete/sejour/je-reserve-mon-sejour/reserver-mon-hebergement-2/', 'live', 'ublo-msem'],
  ['https://www.saintgervais.com/reserver-mon-sejour/hebergement/', 'live', 'ublo-msem'],
  ['https://www.manigod.com/', 'live', 'station-web'],
  ['https://reservation.haute-maurienne-vanoise.com/ac51-valfrejus.htm', 'live', 'opensystem'],
  ['https://booking.yoplanning.pro/7bb76b54-7795-4657-bb0c-9e63eb66f433/', 'link', '']
]
for (const [url, mode, connector] of CAP_CASES) {
  const cap = centralCapabilityOf(url)
  if (cap.mode !== mode) fail(url, `mode ${mode}, obtenu ${cap.mode}`)
  if (connector && cap.connector !== connector) fail(url, `connecteur ${connector}, obtenu ${cap.connector}`)
}

const total = BUNDLED_REFERENTIAL.domaines.length
const aligned = BUNDLED_REFERENTIAL.domaines.filter((d) => stationOrigin(d.name) === 'v25').length
if (failures > 0) {
  console.error(`\n${failures} écart(s) entre l'application et ${V25_PATH}.`)
  process.exit(1)
}
console.log(
  `Stations alignées : ${aligned}/${total} domaines portent un libellé de STATIONS ` +
    `(${total - aligned} hors périmètre du collecteur), ${sites} sites officiels vérifiables, ` +
    `${V25_STATIONS.length} libellés lus dans ${V25_PATH}.`
)
