/**
 * Lecture d'un classeur `.xlsx`, sans dépendance.
 *
 * Un `.xlsx` est une archive ZIP de fichiers XML. Le décompresser demande
 * `zlib.inflateRawSync`, que Node fournit, et lire trois XML plats. Ajouter une
 * dépendance de build pour quelques centaines de lignes lues une fois par
 * révision d'un fichier source coûterait plus cher que ces quatre-vingts
 * lignes — et le projet resterait tributaire d'un paquet npm pour régénérer sa
 * donnée de référence.
 *
 * Ce lecteur ne prétend pas être complet : il traite les fichiers produits par
 * Excel et LibreOffice (entrées dégonflées ou stockées, chaînes partagées,
 * chaînes en ligne). Il échoue bruyamment sur le reste plutôt que de rendre des
 * cellules vides.
 *
 * Deux importeurs s'en servent — `import-france-montagnes.mjs` et
 * `import-centrales.mjs`.
 */

import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

// --- Lecture du ZIP ---------------------------------------------------------

/** Entrées d'une archive ZIP, par nom, décompressées. */
function unzip(buffer, source) {
  const files = new Map()
  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin
  // parce que le commentaire d'archive, s'il existe, la suit.
  let end = buffer.length - 22
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--
  if (end < 0) throw new Error(`${source} : ce n'est pas une archive ZIP`)

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
function sheetPath(files, wanted, source) {
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
  throw new Error(`${source} : feuille « ${wanted} » introuvable`)
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


/**
 * Lignes d'une feuille nommée, cellules vides comprises.
 *
 * `source` ne sert qu'aux messages d'erreur : c'est le chemin du fichier tel
 * que l'appelant le nomme.
 */
export function readSheet(path, sheetName) {
  const files = unzip(readFileSync(path), path)
  const strings = sharedStrings(files)
  return rowsOf(files, sheetPath(files, sheetName, path), strings)
}
