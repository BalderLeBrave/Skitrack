/**
 * Recense les textes français encore écrits en dur dans l'interface.
 *
 *   npm run i18n:scan          rapport
 *   npm run i18n:scan -- --ci  échoue si une catégorie dépasse son plafond
 *   npm run i18n:scan -- --all liste toutes les occurrences, sans troncature
 *
 * Pourquoi un rapport et pas un test rouge : il restait une centaine de
 * chaînes non traduites au moment où ce script a été écrit. Un contrôle qui
 * échoue en permanence n'est plus lu, et finit désactivé. On mesure donc, on
 * affiche le reste à faire, et un plafond empêche la dette de croître.
 *
 * ## Deux catégories, deux plafonds
 *
 * La première version ne cherchait qu'un littéral accentué en position de
 * texte JSX (`>Texte<`). Ce critère a été tenu jusqu'à zéro — mais il ne voyait
 * pas les chaînes rendues depuis une expression :
 *
 *     const scanTxt = phase === 'searching' ? 'Relevé en cours…' : …
 *     <p>{scanTxt}</p>
 *
 * Rien n'était signalé, alors que l'utilisateur lit bien du français. Le
 * rapport annonçait « 0 chaîne à traduire » et le plafond ne protégeait plus
 * rien. D'où la seconde catégorie, `expr` : tout littéral de chaîne accentué,
 * quelle que soit sa position.
 *
 * Les deux plafonds sont séparés pour que le zéro durement obtenu sur `jsx`
 * reste un zéro : fondre les deux totaux permettrait de réintroduire du texte
 * en dur dans le JSX tant que la dette globale baisse par ailleurs.
 *
 * C'est grossier, et c'est voulu : un accent dans une chaîne de l'interface est
 * un signal suffisant, et le faux positif se voit tout de suite dans le
 * rapport — il part alors dans `VERBATIM`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = 'src/renderer/src'

/**
 * Périmètre sous plafond.
 *
 * `components` et `pages` portent le JSX. `data` et `domain` sont inclus parce
 * qu'ils composent aussi des phrases affichées telles quelles — les libellés de
 * `geoStatus`, ceux des postes de coût — et que les y laisser reviendrait à
 * déplacer la dette d'un dossier à l'autre plutôt qu'à la réduire.
 */
const DIRS = ['components', 'pages', 'data', 'domain']

/**
 * Fichiers dont le français est délibéré.
 *
 * Les mentions légales décrivent un positionnement au regard du droit
 * français ; la version française fait foi et une traduction approximative
 * vaudrait moins que l'original. Voir l'en-tête du fichier.
 *
 * Le catalogue de traduction est en français à l'index 0 par construction : le
 * scanner y verrait sept cents faux positifs.
 *
 * `data/stations.ts` ne contient que des noms propres — « Arêches-Beaufort »,
 * « Val d'Isère » — recopiés de `tools/skitrack_v25.py`. Ils ne se traduisent
 * pas : ce sont les clés envoyées aux moteurs de réservation et la charnière
 * avec le collecteur. Les traduire les casserait.
 */
const DELIBERATE = new Set(['pages/LegalSection.tsx', 'i18n/index.ts', 'data/stations.ts'])

/**
 * Chaînes qui ne doivent PAS être traduites.
 *
 * L'attribution ODbL est une obligation de licence : elle se cite telle
 * qu'OpenStreetMap la publie, quelle que soit la langue de l'interface. La
 * traduire l'invaliderait.
 *
 * `€/h` est une unité, pas une phrase — elle n'est signalée que parce que la
 * ligne qui la porte contient un mot accentué.
 *
 * « Gîtes de France » est une marque déposée : elle s'écrit pareil dans les
 * sept langues, et c'est aussi la clé qui identifie la source dans `src` et
 * dans `LODG_SOURCES`. La traduire casserait les deux.
 */
const VERBATIM = [/contributeurs OpenStreetMap/, /^€\/h$/, /^Gîtes de France$/]

/**
 * Plafonds courants. À faire baisser, jamais monter.
 *
 * `jsx` est à zéro et doit y rester. `expr` part du relevé du jour où la
 * détection a été élargie : ce n'est pas une dette nouvelle, c'est la dette qui
 * échappait au critère précédent et qui devient enfin visible.
 */
const BUDGET = { jsx: 0, expr: 278 }

const ACCENTS = 'àâçéèêëîïôùûüœÀÂÇÉÈÊËÎÏÔÙÛÜŒ'
const ACC = new RegExp(`[${ACCENTS}]`)

/** Texte JSX : `>Texte<` sur une seule ligne, sans accolade ni balise. */
const JSX_TEXT = new RegExp(`>\\s*([^<>{}\\n]*[${ACCENTS}][^<>{}\\n]*?)\\s*<`, 'g')

/** Littéraux de chaîne : `'…'`, `"…"`, `` `…` ``. */
const STRING_LIT = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g

/**
 * Retire commentaires de ligne et de bloc, en conservant le découpage en
 * lignes. Sans cela, les commentaires français du dépôt — nombreux, et voulus —
 * noieraient le rapport.
 */
function stripComments(src) {
  let out = ''
  let mode = 'code'
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    const n = src[i + 1]
    if (mode === 'code') {
      if (c === '/' && n === '/') {
        mode = 'line'
        i++
        continue
      }
      if (c === '/' && n === '*') {
        mode = 'block'
        i++
        continue
      }
      out += c
      continue
    }
    if (c === '\n') {
      out += '\n'
      if (mode === 'line') mode = 'code'
      continue
    }
    if (mode === 'block' && c === '*' && n === '/') {
      mode = 'code'
      i++
    }
  }
  return out
}

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name.endsWith('.tsx') || name.endsWith('.ts')) out.push(p)
  }
  return out
}

const keep = (text) => text.length > 2 && !VERBATIM.some((re) => re.test(text))

const found = { jsx: [], expr: [] }

for (const d of DIRS) {
  for (const file of walk(join(ROOT, d))) {
    const rel = relative(ROOT, file).replace(/\\/g, '/')
    // Les fichiers de test portent des chaînes de fixture, pas de l'interface :
    // `.test.ts` était déjà écarté, `.test.tsx` ne l'était pas — un test de
    // composant en JSX y échappait par sa seule extension.
    if (DELIBERATE.has(rel) || rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue

    const src = stripComments(readFileSync(file, 'utf8'))

    for (const m of src.matchAll(JSX_TEXT)) {
      const text = m[1].trim()
      if (keep(text)) found.jsx.push({ rel, text })
    }

    src.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(STRING_LIT)) {
        const text = m[0].slice(1, -1).trim()
        if (ACC.test(text) && keep(text)) found.expr.push({ rel, line: i + 1, text })
      }
    })
  }
}

const ALL = process.argv.includes('--all')

function report(kind, title) {
  const hits = found[kind]
  const byFile = new Map()
  for (const h of hits) {
    if (!byFile.has(h.rel)) byFile.set(h.rel, [])
    byFile.get(h.rel).push(h)
  }
  const rows = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)

  console.log(`\n── ${title} — ${hits.length} / plafond ${BUDGET[kind]}`)
  for (const [rel, list] of rows) {
    console.log(`${String(list.length).padStart(4)}  ${rel}`)
    for (const h of ALL ? list : list.slice(0, 3)) {
      const where = h.line != null ? `:${h.line}` : ''
      console.log(`        ${where} ${h.text.slice(0, 76)}`)
    }
    if (!ALL && list.length > 3) console.log(`        … ${list.length - 3} de plus`)
  }
  return hits.length
}

const jsx = report('jsx', 'Texte JSX en dur')
const expr = report('expr', 'Littéral de chaîne accentué (position d’expression)')

console.log(`\nExclus volontairement : ${[...DELIBERATE].join(', ')}, et les mentions de licence.`)
console.log(`Périmètre : ${DIRS.map((d) => `${ROOT}/${d}`).join(', ')}`)

if (process.argv.includes('--ci')) {
  const over = [
    jsx > BUDGET.jsx ? `jsx ${jsx} > ${BUDGET.jsx}` : null,
    expr > BUDGET.expr ? `expr ${expr} > ${BUDGET.expr}` : null
  ].filter(Boolean)
  if (over.length > 0) {
    console.error(`\nLa dette de traduction augmente : ${over.join(', ')}.`)
    process.exit(1)
  }
  console.log('\nDette de traduction sous plafond.')
}
