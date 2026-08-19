/**
 * Importe le catalogue France Montagnes livré en classeur Excel.
 *
 *   node tools/import-france-montagnes.mjs
 *   npm run catalogue:import
 *
 * Lit `docs/sources/stations-ski-france-montagnes.xlsx` — la copie versionnée du
 * fichier de travail — et écrit `src/renderer/src/data/franceMontagnesStations.ts`.
 * Le module produit est **généré** : toute correction se fait dans le classeur,
 * jamais dans le TypeScript, sans quoi le prochain import l'effacerait.
 *
 * ## Pourquoi un lecteur xlsx écrit à la main
 *
 * Un `.xlsx` est une archive ZIP de fichiers XML. Le décompresser demande
 * `zlib.inflateRawSync`, que Node fournit, et lire trois XML plats. Ajouter une
 * dépendance de build pour 285 lignes lues une fois par révision du catalogue
 * coûterait plus cher que ces quatre-vingts lignes — et le projet resterait
 * tributaire d'un paquet npm pour régénérer sa donnée de référence.
 *
 * Ce lecteur ne prétend pas être complet : il traite les fichiers produits par
 * Excel et LibreOffice (entrées dégonflées ou stockées, chaînes partagées,
 * chaînes en ligne). Il échoue bruyamment sur le reste plutôt que de rendre des
 * cellules vides.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

const SOURCE = 'docs/sources/stations-ski-france-montagnes.xlsx'
const TARGET = 'src/renderer/src/data/franceMontagnesStations.ts'
const SHEET = 'Stations'

/**
 * Premier identifiant attribué au catalogue.
 *
 * Au-dessus des identifiants du référentiel livré (1 à 259) et de ceux que le
 * moteur local attribue à ses domaines : deux listes ne se rencontrent jamais
 * dans la même collection, mais un identifiant partagé rendrait indétectable le
 * jour où cela arriverait.
 */
const ID_BASE = 1000

// --- Lecture du ZIP ---------------------------------------------------------

/** Entrées d'une archive ZIP, par nom, décompressées. */
function unzip(buffer) {
  const files = new Map()
  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin
  // parce que le commentaire d'archive, s'il existe, la suit.
  let end = buffer.length - 22
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--
  if (end < 0) throw new Error(`${SOURCE} : ce n'est pas une archive ZIP`)

  const count = buffer.readUInt16LE(end + 10)
  let cursor = buffer.readUInt32LE(end + 16)

  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('répertoire central illisible')
    const method = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const offset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.toString('utf-8', cursor + 46, cursor + 46 + nameLength)

    // L'en-tête local redit la taille des champs variables ; eux seuls sont
    // fiables pour trouver le début des données.
    const localNameLength = buffer.readUInt16LE(offset + 26)
    const localExtraLength = buffer.readUInt16LE(offset + 28)
    const start = offset + 30 + localNameLength + localExtraLength
    const raw = buffer.subarray(start, start + compressedSize)

    if (method === 0) files.set(name, raw)
    else if (method === 8) files.set(name, inflateRawSync(raw))
    else throw new Error(`${name} : compression ${method} non gérée`)

    cursor += 46 + nameLength + extraLength + commentLength
  }
  return files
}

// --- Lecture du XML ---------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function unescapeXml(value) {
  return value.replace(/&(amp|lt|gt|quot|apos|#x?[0-9a-fA-F]+);/g, (whole, code) => {
    if (code in ENTITIES) return ENTITIES[code]
    return String.fromCodePoint(
      code[1] === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
    )
  })
}

/** Texte d'un élément, balises internes retirées : `<si><r><t>a</t></r></si>`. */
function textOf(xml) {
  return unescapeXml(xml.replace(/<[^>]*>/g, ''))
}

/** Table des chaînes partagées, dans l'ordre où les cellules la référencent. */
function sharedStrings(files) {
  const xml = files.get('xl/sharedStrings.xml')
  if (!xml) return []
  return [...xml.toString('utf-8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
}

/** Chemin de la feuille nommée, résolu par les relations du classeur. */
function sheetPath(files, wanted) {
  const workbook = files.get('xl/workbook.xml').toString('utf-8')
  const rels = files.get('xl/_rels/workbook.xml.rels').toString('utf-8')
  const targets = new Map(
    [...rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]])
  )
  for (const sheet of workbook.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    if (unescapeXml(sheet[1]) !== wanted) continue
    const target = targets.get(sheet[2])
    return target.startsWith('xl/') ? target : `xl/${target.replace(/^\//, '')}`
  }
  throw new Error(`${SOURCE} : feuille « ${wanted} » introuvable`)
}

/** Numéro de colonne d'une référence de cellule : `AE12` → 30. */
function columnOf(ref) {
  let n = 0
  for (const char of ref.match(/^[A-Z]+/)[0]) n = n * 26 + char.charCodeAt(0) - 64
  return n - 1
}

/** Lignes de la feuille, cellules vides comprises. */
function rowsOf(files, path, strings) {
  const xml = files.get(path).toString('utf-8')
  const rows = []
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map()
    // Une cellule vide mais stylée s'écrit `<c r="AA2" s="41"/>` : sans
    // l'alternance, la lecture avalait le contenu de la cellule suivante et
    // décalait toute la fin de ligne d'une colonne.
    for (const cell of row[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = cell[1].match(/r="([A-Z]+\d+)"/)
      const type = cell[1].match(/t="([^"]+)"/)
      const content = cell[2] ?? ''
      const inline = content.match(/<is>([\s\S]*?)<\/is>/)
      const value = content.match(/<v>([\s\S]*?)<\/v>/)
      let text = ''
      if (inline) text = textOf(inline[1])
      else if (!value) continue
      else if (type && type[1] === 's') text = strings[Number(value[1])]
      else text = unescapeXml(value[1])
      cells.set(columnOf(ref[1]), text)
    }
    if (cells.size === 0) continue
    const width = Math.max(...cells.keys()) + 1
    rows.push(Array.from({ length: width }, (_, i) => cells.get(i) ?? ''))
  }
  return rows
}

// --- Conversion en enregistrements -------------------------------------------

/** Nombre, ou `null` quand la cellule est vide : un vide n'est pas un zéro. */
function num(value, decimals = 0) {
  if (value === '' || value == null) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  const factor = 10 ** decimals
  return Math.round(parsed * factor) / factor
}

function str(value) {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

function literal(value) {
  if (value === null) return 'null'
  if (typeof value === 'number') return String(value)
  return JSON.stringify(value)
}

const files = unzip(readFileSync(SOURCE))
const strings = sharedStrings(files)
const rows = rowsOf(files, sheetPath(files, SHEET), strings)
const header = rows[0]
const at = (name) => {
  const index = header.indexOf(name)
  if (index === -1) throw new Error(`${SOURCE} : colonne « ${name} » absente`)
  return index
}

const COLUMNS = {
  name: at('Station'),
  type: at('Type'),
  massif: at('Massif'),
  departement: at('Département'),
  postal: at('Code postal'),
  commune: at('Commune'),
  insee: at('Code INSEE'),
  status: at("Statut d'activité"),
  lat: at('Latitude'),
  lon: at('Longitude'),
  village: at('Altitude village (m)'),
  domain: at('Domaine skiable'),
  min: at('Bas des pistes (m)'),
  max: at('Haut des pistes (m)'),
  median: at('Altitude médiane des pistes (m)'),
  high: at('Pistes ≥ 2 000 m (% des km)'),
  km: at('Pistes du domaine (km)'),
  slopes: at('Nombre de pistes'),
  lifts: at('Remontées mécaniques'),
  green: at('Pistes vertes'),
  blue: at('Pistes bleues'),
  red: at('Pistes rouges'),
  black: at('Pistes noires'),
  unclassed: at('Non classées / freeride'),
  slopeDistance: at('Distance station-pistes (km)'),
  booking: at('Réservation officielle (URL)'),
  map: at('Plan des pistes (PDF)'),
  osmId: at('ID domaine OpenSkiMap'),
  sheet: at('Fiche France Montagnes')
}

const stations = rows.slice(1).map((row, index) => {
  const cell = (key) => row[COLUMNS[key]] ?? ''
  return {
    id: ID_BASE + index,
    fmName: cell('name').trim(),
    kind: cell('type').startsWith('Village') ? 'village' : 'station',
    massif: cell('massif').trim(),
    departement: cell('departement').trim(),
    postal: cell('postal').trim(),
    commune: cell('commune').trim(),
    insee: cell('insee').trim(),
    status: cell('status').trim(),
    lat: num(cell('lat'), 6),
    lon: num(cell('lon'), 6),
    village: num(cell('village')),
    domain: str(cell('domain')),
    osmId: str(cell('osmId')),
    min: num(cell('min')),
    max: num(cell('max')),
    median: num(cell('median')),
    /** Part des kilomètres de pistes situés à 2 000 m ou plus, en pourcentage. */
    highShare: num(Number(cell('high') || 0) * 100, 1),
    km: num(cell('km'), 1),
    slopes: num(cell('slopes')),
    lifts: num(cell('lifts')),
    green: num(cell('green')),
    blue: num(cell('blue')),
    red: num(cell('red')),
    black: num(cell('black')),
    unclassed: num(cell('unclassed')),
    slopeDistance: num(cell('slopeDistance'), 2),
    booking: str(cell('booking')),
    map: str(cell('map')),
    sheet: str(cell('sheet'))
  }
})

const missingCoords = stations.filter((s) => s.lat == null || s.lon == null)
if (missingCoords.length > 0) {
  throw new Error(`${missingCoords.length} station(s) sans coordonnées : ${missingCoords.map((s) => s.fmName).join(', ')}`)
}

const FIELDS = [
  'id', 'fmName', 'kind', 'massif', 'departement', 'postal', 'commune', 'insee', 'status',
  'lat', 'lon', 'village', 'domain', 'osmId', 'min', 'max', 'median', 'highShare', 'km',
  'slopes', 'lifts', 'green', 'blue', 'red', 'black', 'unclassed', 'slopeDistance',
  'booking', 'map', 'sheet'
]

const body = stations
  .map((s) => `  { ${FIELDS.map((f) => `${f}: ${literal(s[f])}`).join(', ')} }`)
  .join(',\n')

const domains = new Set(stations.map((s) => s.domain).filter(Boolean))
const villages = stations.filter((s) => s.kind === 'village').length

const file = `/**
 * Le catalogue des stations de ski françaises — **fichier généré**.
 *
 * Régénéré par \`npm run catalogue:import\` depuis
 * \`docs/sources/stations-ski-france-montagnes.xlsx\`, la copie versionnée du
 * classeur de travail. Toute correction se fait dans le classeur : une
 * modification écrite ici disparaîtrait au prochain import.
 *
 * ## Ce que ce fichier apporte, et que le référentiel n'avait pas
 *
 * ${stations.length} stations, dont ${villages} villages-stations, réparties sur
 * ${domains.size} domaines skiables — chacune avec ses coordonnées, l'altitude de
 * son village et le domaine auquel elle appartient. Le référentiel livré ne
 * décrivait que 115 des 232 noms du catalogue France Montagnes : les 108 autres
 * existaient sans qu'on sache où elles étaient ni à quelle altitude. Voir
 * \`docs/diagnostics/couverture-france-montagnes.md\`.
 *
 * ## Ce que chaque colonne mesure — et à quelle échelle
 *
 * Le classeur documente ses propres sources (feuille « Paramètres ») :
 *
 * * **Stations, réservation, fiches** : France Montagnes
 *   (https://www.france-montagnes.com/les-stations-de-ski/), relevé du
 *   18/08/2026.
 * * **Altitude du village** : modèle numérique de terrain RGE ALTI de l'IGN,
 *   interrogé au point exact de la station. C'est le front de neige, **pas** le
 *   domaine.
 * * **Bas et haut des pistes, kilomètres, remontées, comptages par couleur** :
 *   OpenSkiMap (export du 17/08/2026), qui agrège OpenStreetMap. Ce sont des
 *   valeurs de **domaine** : deux stations des 3 Vallées portent les mêmes, et
 *   c'est voulu — le domaine est ce qu'elles partagent.
 * * **Rattachement au domaine** : par proximité des pistes, vote pondéré par la
 *   distance, jamais par ressemblance de noms. \`slopeDistance\` donne l'écart à
 *   la piste la plus proche ; au-delà de 5 km, la ligne mérite un contrôle.
 *
 * Les kilomètres mesurés sur les tracés OpenStreetMap diffèrent des chiffres
 * commerciaux affichés par les stations, et les comptages de pistes portent sur
 * des **tronçons** OSM, pas sur les pistes d'un plan des pistes : les
 * proportions entre couleurs sont significatives, les valeurs absolues
 * surestiment.
 *
 * ## Ce qui n'y est pas
 *
 * Aucun tarif de forfait, aucune saisonnalité, aucun indicateur de glacier : ces
 * valeurs viennent du référentiel ou du moteur local, posées par
 * \`data/catalogue.ts\`. Une station dont le domaine n'a pas de tarif relevé
 * n'en reçoit pas d'inventé.
 *
 * Les identifiants commencent à ${ID_BASE} et suivent l'ordre du classeur : ils sont
 * stables d'un import à l'autre tant que l'ordre des lignes ne change pas.
 */

/** Une station du catalogue, telle que le classeur la décrit. */
export interface FmStation {
  /** Identifiant applicatif, stable : ${ID_BASE} + rang dans le classeur. */
  id: number
  /** Nom publié par France Montagnes, graphie comprise. Voir \`data/catalogue.ts\`. */
  fmName: string
  /** \`village\` : village-station d'un grand domaine, ajouté au catalogue. */
  kind: 'station' | 'village'
  massif: string
  departement: string
  postal: string
  /** Commune de rattachement, contrôlée sur le fichier officiel La Poste. */
  commune: string
  insee: string
  /** Statut d'activité au 18/08/2026, tel que le classeur le formule. */
  status: string
  lat: number
  lon: number
  /** Altitude du village, mesurée au point de la station (RGE ALTI). */
  village: number | null
  /** Domaine skiable de rattachement. \`null\` : aucune piste cartographiée près. */
  domain: string | null
  /** Identifiant du domaine dans OpenSkiMap. */
  osmId: string | null
  /** Bas des pistes du **domaine**, en mètres. */
  min: number | null
  /** Haut des pistes du **domaine**, en mètres. */
  max: number | null
  /** Altitude médiane des pistes du domaine, pondérée par leur longueur. */
  median: number | null
  /** Part des kilomètres de pistes à 2 000 m ou plus, en pourcentage. */
  highShare: number | null
  /** Kilomètres de pistes du **domaine**, mesurés sur les tracés OSM. */
  km: number | null
  /** Nombre de tronçons de pistes du domaine — pas de pistes commerciales. */
  slopes: number | null
  /** Remontées mécaniques du domaine. */
  lifts: number | null
  green: number | null
  blue: number | null
  red: number | null
  black: number | null
  /** Tronçons sans difficulté renseignée et itinéraires freeride. */
  unclassed: number | null
  /** Distance de la station à la piste la plus proche, en kilomètres. */
  slopeDistance: number | null
  /** Page de réservation officielle, quand le classeur en a retenu une. */
  booking: string | null
  /** Plan des pistes en PDF. */
  map: string | null
  /** Fiche de la station sur france-montagnes.com. */
  sheet: string | null
}

export const FM_STATIONS: FmStation[] = [
${body}
]
`

writeFileSync(TARGET, file, 'utf-8')
console.log(`${TARGET} — ${stations.length} stations, ${villages} villages-stations, ${domains.size} domaines`)
