/**
 * Importe le relevé des centrales de réservation.
 *
 *   node tools/import-centrales.mjs
 *   npm run centrales:import
 *
 * Lit `docs/sources/centrales-selecteurs.xlsx` — la copie versionnée du relevé
 * fait à la main, un onglet, une ligne par station — et écrit
 * `src/main/providers/station/centrals.ts`.
 *
 * ## Ce que le relevé contient, et ce qu'il ne contient pas
 *
 * Chaque ligne porte l'adresse de la centrale et le **HTML des contrôles du
 * formulaire de recherche**, copié depuis l'inspecteur du navigateur : le champ
 * d'arrivée, le champ de départ, la durée, le nombre de personnes, le bouton
 * « Rechercher ». C'est le chemin d'aller.
 *
 * Le chemin de retour — les cartes de résultats, leur titre, leur **prix** —
 * n'y est presque pas : six lignes sur soixante-treize donnent un sélecteur de
 * carte, aucune ne donne un sélecteur de prix. L'importeur ne le cache pas : il
 * compte ce qui manque et le journalise. Ce qui manque se relève sur les pages
 * de résultats, pas ici.
 *
 * ## Du HTML collé au sélecteur CSS
 *
 * Le fichier ne donne pas des sélecteurs mais des **éléments**. On en dérive un
 * sélecteur en préférant ce qui est stable :
 *
 * 1. `[name="datedeb"]` — l'attribut que le serveur attend, donc le plus sûr ;
 * 2. `#type_prestataire` — un identifiant, **sauf s'il porte une empreinte**
 *    de session : `form-recherche_6a83281a50911personnes` change à chaque
 *    chargement de page, et un sélecteur bâti dessus ne marcherait qu'une fois ;
 * 3. `.form_search` — une classe ;
 * 4. `[placeholder="Date d'arrivée"]` en dernier recours.
 *
 * Les `<option>` d'un `<select>` sont conservées quand elles décrivent un choix
 * stable — type d'hébergement `G`/`H`, rythme `SS`/`DD`/`LL`, durée 7/14/21, et
 * surtout **la station** dans une centrale qui en dessert plusieurs (Val d'Arly
 * en couvre six). Les listes de dates, elles, sont jetées : elles ne valent que
 * pour la saison du relevé.
 *
 * Une cellule qui ne contient pas un élément exploitable — un fragment
 * `</select>`, une suite d'`<option>` sans leur `<select>` — est conservée
 * telle quelle dans `raw` et déclarée sans sélecteur. Mieux vaut un trou nommé
 * qu'un sélecteur inventé.
 */

import { writeFileSync } from 'node:fs'
import { readSheet } from './lib/xlsx.mjs'

const SOURCE = 'docs/sources/centrales-selecteurs.xlsx'
const TARGET = 'src/main/providers/station/centrals.ts'
const SHEET = 'Feuil1'

/** Colonnes du relevé, dans l'ordre où elles y figurent. */
const CONTROLS = [
  ['station', 'Sélecteur Station'],
  ['lodging', 'Sélecteur hébergements'],
  ['stayType', 'Sélecteur durée séjour (samedi au semedi…)'],
  ['checkIn', 'Sélecteur Arrivée'],
  ['checkOut', 'Sélecteur Départ'],
  ['duration', 'Sélecteur durée'],
  ['guests', 'Sélecteur Adultes / Enfants'],
  ['submit', 'Sélecteur Rechercher'],
  ['cards', 'Sélecteur Cartes'],
  ['title', 'Sélecteur Titre'],
  ['price', 'Sélecteur Prix'],
  ['link', 'Sélecteur Lien']
]

/** Un identifiant qui porte une empreinte hexadécimale est régénéré à chaque
 *  chargement : `form-recherche_6a8329409b543duree`. */
const GENERATED_ID = /[0-9a-f]{10,}/i

/** Une valeur d'option qui est une date ne vaut que pour la saison du relevé. */
const DATE_VALUE = /^\d{2}\/\d{2}\/\d{4}$/

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function unescapeHtml(value) {
  return value.replace(/&(amp|lt|gt|quot|apos|nbsp|#x?[0-9a-fA-F]+);/g, (whole, code) => {
    if (code in ENTITIES) return ENTITIES[code]
    return String.fromCodePoint(
      code[1] === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
    )
  })
}

/** Attributs de la première balise ouvrante du fragment. */
function firstTag(html) {
  const m = /<([a-zA-Z][\w-]*)\s*([^>]*)>/.exec(html)
  if (!m) return null
  const attrs = {}
  for (const attr of m[2].matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
    attrs[attr[1].toLowerCase()] = unescapeHtml(attr[2])
  }
  return { tag: m[1].toLowerCase(), attrs }
}

/** Échappe une valeur d'attribut pour un sélecteur CSS. */
const attrSelector = (tag, name, value) => `${tag}[${name}="${value.replace(/"/g, '\\"')}"]`

function selectorOf(tag, attrs) {
  if (attrs.name) return attrSelector(tag, 'name', attrs.name)
  if (attrs.id && !GENERATED_ID.test(attrs.id)) return `${tag}#${attrs.id}`
  const classes = (attrs.class ?? '').trim().split(/\s+/).filter(Boolean)
  // Les classes utilitaires d'un composant React — `css-1hwfws3` — sont des
  // empreintes de compilation : elles changent au prochain déploiement.
  const stable = classes.filter((c) => !GENERATED_ID.test(c) && !/^css-/.test(c))
  if (stable.length > 0) return `${tag}.${stable.join('.')}`
  if (attrs.placeholder) return attrSelector(tag, 'placeholder', attrs.placeholder)
  if (attrs.type) return attrSelector(tag, 'type', attrs.type)
  return null
}

/** Choix d'un `<select>`, quand ils décrivent autre chose qu'un calendrier. */
function optionsOf(html) {
  const options = []
  for (const m of html.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)) {
    const value = /value\s*=\s*"([^"]*)"/.exec(m[1])
    options.push({
      value: value ? unescapeHtml(value[1]) : '',
      label: unescapeHtml(m[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
    })
  }
  if (options.length === 0) return null
  if (options.some((o) => DATE_VALUE.test(o.value))) return null
  if (options.length > 24) return null
  return options
}

function controlOf(html) {
  const text = (html ?? '').trim()
  if (!text) return null
  const head = firstTag(text)
  // Un fragment sans balise ouvrante — `</select>`, une suite d'`<option>`
  // arrachée à son `<select>` — n'est pas un contrôle. On garde le texte et on
  // le dit.
  if (!head || head.tag === 'option') return { selector: null, raw: text.slice(0, 400) }
  const selector = selectorOf(head.tag, head.attrs)
  const control = { selector, tag: head.tag }
  if (head.attrs.name) control.name = head.attrs.name
  if (head.attrs.type) control.type = head.attrs.type
  if (head.attrs.placeholder) control.placeholder = head.attrs.placeholder
  const options = head.tag === 'select' ? optionsOf(text) : null
  if (options) control.options = options
  if (!selector) control.raw = text.slice(0, 400)
  return control
}

const rows = readSheet(SOURCE, SHEET)
const header = rows[0]
const at = (name) => {
  const index = header.indexOf(name)
  if (index === -1) throw new Error(`${SOURCE} : colonne « ${name} » absente`)
  return index
}
const NAME = at('Nom du domaine skiable / station de ski')
const URL_COL = at('URL du site')
const NOTES = header.indexOf('Remarques')

const centrals = []
const stats = { rows: 0, controls: 0, unusable: 0, missing: {} }

for (const row of rows.slice(1)) {
  const station = (row[NAME] ?? '').trim()
  const url = (row[URL_COL] ?? '').trim()
  if (!station || !url) continue
  stats.rows++

  const controls = {}
  for (const [key, column] of CONTROLS) {
    const control = controlOf(row[at(column)])
    if (!control) {
      stats.missing[key] = (stats.missing[key] ?? 0) + 1
      continue
    }
    stats.controls++
    if (!control.selector) stats.unusable++
    controls[key] = control
  }

  const notes = NOTES === -1 ? '' : (row[NOTES] ?? '').trim()
  centrals.push({
    station,
    url,
    host: new URL(url).host,
    controls,
    ...(notes ? { notes } : {})
  })
}

const hosts = [...new Set(centrals.map((c) => c.host))].sort()

/** Sérialise sans le bruit d'un `JSON.stringify` brut : une ligne par clé. */
function literal(value, indent) {
  const pad = ' '.repeat(indent)
  if (Array.isArray(value)) {
    return `[\n${value.map((v) => `${pad}  ${literal(v, indent + 2)}`).join(',\n')}\n${pad}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined)
    return `{\n${entries
      .map(([k, v]) => `${pad}  ${/^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${literal(v, indent + 2)}`)
      .join(',\n')}\n${pad}}`
  }
  return JSON.stringify(value)
}

const file = `/**
 * Les centrales de réservation des stations — **fichier généré**.
 *
 * Régénéré par \`npm run centrales:import\` depuis
 * \`docs/sources/centrales-selecteurs.xlsx\`, le relevé fait à la main dans
 * l'inspecteur du navigateur. Toute correction se fait dans le classeur : une
 * modification écrite ici disparaîtrait au prochain import.
 *
 * ## Ce que cette table est
 *
 * ${centrals.length} stations, ${hosts.length} centrales distinctes — plusieurs stations
 * partagent la même : Val d'Arly en dessert six, et son \`controls.station\`
 * porte les valeurs qui les distinguent. Pour chacune, les **contrôles du
 * formulaire de recherche** : le champ d'arrivée, la durée, le nombre de
 * personnes, le bouton qui lance la recherche.
 *
 * ## Ce qu'elle n'est pas
 *
 * Elle ne dit pas comment **lire les résultats**. Sur ${centrals.length} lignes, ${stats.missing.price ?? 0} n'ont
 * aucun sélecteur de prix, ${stats.missing.cards ?? 0} aucun sélecteur de carte. Le prix est
 * pourtant ce qu'on vient chercher : il se relève sur les pages de résultats,
 * plateforme par plateforme, et c'est l'objet de la reconnaissance
 * (\`npm run centrales:recon\`, rapport dans \`docs/diagnostics/\`).
 *
 * Un contrôle dont \`selector\` vaut \`null\` n'a pas pu être dérivé : la cellule
 * ne contenait pas un élément exploitable. Son texte est gardé dans \`raw\` pour
 * qu'on puisse le reprendre, jamais deviné.
 */

/** Un contrôle du formulaire de recherche d'une centrale. */
export interface CentralControl {
  /**
   * Sélecteur CSS dérivé du relevé, \`null\` si la cellule n'était pas un
   * élément. Bâti sur \`[name]\` en priorité, jamais sur un identifiant qui
   * porte une empreinte de session.
   */
  selector: string | null
  /** Absent quand la cellule n'était pas un élément : voir \`raw\`. */
  tag?: string
  name?: string
  type?: string
  placeholder?: string
  /** Choix d'un \`<select>\`, hors listes de dates — elles ne valent que pour la
   *  saison du relevé. */
  options?: { value: string; label: string }[]
  /** Le HTML relevé, gardé quand aucun sélecteur n'a pu en être tiré. */
  raw?: string
}

export interface Central {
  /** La station telle que le relevé la nomme. */
  station: string
  url: string
  host: string
  controls: {
    station?: CentralControl
    lodging?: CentralControl
    stayType?: CentralControl
    checkIn?: CentralControl
    checkOut?: CentralControl
    duration?: CentralControl
    guests?: CentralControl
    submit?: CentralControl
    cards?: CentralControl
    title?: CentralControl
    price?: CentralControl
    link?: CentralControl
  }
  notes?: string
}

export const CENTRALS: Central[] = ${literal(centrals, 0)}

/** Les centrales distinctes : plusieurs stations partagent souvent la même. */
export const CENTRAL_HOSTS: string[] = ${literal(hosts, 0)}
`

writeFileSync(TARGET, file, 'utf-8')
console.log(
  `${TARGET} — ${centrals.length} stations, ${hosts.length} centrales, ` +
    `${stats.controls} contrôles dont ${stats.unusable} sans sélecteur ; ` +
    `manquants : ${Object.entries(stats.missing).map(([k, n]) => `${k} ${n}`).join(', ')}`
)
