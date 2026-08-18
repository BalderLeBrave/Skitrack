/**
 * Une saisie mène-t-elle à sa station ?
 *
 * Le test porte sur la liste **réellement affichée** — les entrées du
 * référentiel repliées en stations par `collapseToStations` — et non sur le
 * fichier brut. C'est la seule façon d'attraper l'écart qui comptait : tant
 * que la liste montrait « Val Thorens – Orelle » à côté de « Val Thorens », un
 * test sur le fichier brut passait au vert sur une liste fausse.
 *
 *   npm run places:test
 */

import { placeIndex, squash, villagesOfName } from './places'
import { BUNDLED_REFERENTIAL, domainsFromReferential } from './referentiel'
import { collapseToStations } from './stationList'
import { slug } from '@/domain/format'

const stations = collapseToStations(domainsFromReferential(BUNDLED_REFERENTIAL, slug))
const index = placeIndex(stations)

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

console.log(`\nRecherche de stations — ${stations.length} stations affichées\n`)

/** Stations que la liste montrerait pour cette saisie. */
function found(query: string): string[] {
  return stations.filter((s) => index.matches(s, query)).map((s) => s.name)
}

console.log('1. La liste est une liste de stations')
check(
  'aucun nom en double',
  new Set(stations.map((s) => s.name)).size === stations.length,
  stations.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i)
)
check(
  'aucun nom composite « A – B » ne subsiste',
  stations.every((s) => !/\s[–—]\s/.test(s.name)),
  stations.filter((s) => /\s[–—]\s/.test(s.name)).map((s) => s.name)
)
check('Val Thorens n’apparaît qu’une fois', found('Val Thorens').filter((n) => n === 'Val Thorens').length === 1)
check('et Orelle reste une station distincte', stations.some((s) => s.name === 'Orelle'))

console.log('\n2. Saisies → station')
const ACCEPTANCE: [string, string][] = [
  ['Méribel', 'Méribel'], ['meribel', 'Méribel'], ['MERIBEL', 'Méribel'],
  ['Méribel-Mottaret', 'Méribel'],
  ['Les Menuires', 'Les Menuires'], ['menuires', 'Les Menuires'], ['menu', 'Les Menuires'],
  ['Saint-Martin-de-Belleville', 'Saint-Martin-de-Belleville'],
  ['st martin de belleville', 'Saint-Martin-de-Belleville'],
  ['La Toussuire', 'La Toussuire'], ['le corbier', 'Le Corbier'],
  // Apostrophe droite : le nom vient de la table `STATION_BY_SLUG`, alignée sur
  // `tools/skitrack_v25.py`, et non du référentiel qui écrit une apostrophe
  // typographique.
  ['st sorlin d arves', "Saint-Sorlin-d'Arves"],
  ['Combloux', 'Combloux'], ['La Giettaz', 'La Giettaz'],
  ['Avoriaz', 'Avoriaz'], ['chatel', 'Chatel'],
  ['Samoëns', 'Samoëns'], ['samoens', 'Samoëns'],
  ['Montchavin', 'Montchavin'], ['Peisey-Vallandry', 'Les Arcs'],
  ['Aime 2000', 'La Plagne'], ['Aime deux mille', 'La Plagne'],
  ['Vaujany', 'Vaujany'], ['Le Monêtier', 'Serre Chevalier'],
  ['Courchevel', 'Courchevel'], ['Brides-les-Bains', 'Brides-les-Bains'],
  ['Val Thorens', 'Val Thorens'], ['Orelle', 'Orelle']
]
for (const [query, expected] of ACCEPTANCE) {
  const list = found(query)
  check(`« ${query} » → ${expected}`, list.includes(expected), { trouves: list.length, tete: list.slice(0, 5) })
}

console.log('\n3. Saisies → domaine, résolu vers ses stations')
const TROIS_VALLEES = [
  'Val Thorens', 'Les Menuires', 'Courchevel', 'Méribel',
  'Brides-les-Bains', 'Orelle', 'Saint-Martin-de-Belleville'
]
for (const query of ['Les 3 Vallées', 'Les Trois Vallées', 'trois vallees', '3 vallées']) {
  const list = found(query)
  check(
    `« ${query} » → les 7 stations du domaine`,
    TROIS_VALLEES.every((n) => list.includes(n)),
    { manquantes: TROIS_VALLEES.filter((n) => !list.includes(n)), trouvees: list }
  )
}
const SAME: [string, string][] = [
  ['Les Deux Alpes', 'Les 2 Alpes'],
  ['Les Sept Laux', 'Les 7 Laux']
]
for (const [a, b] of SAME) {
  check(`« ${a} » et « ${b} » donnent le même résultat`, found(a).join('|') === found(b).join('|'), {
    a: found(a),
    b: found(b)
  })
}
check(
  '« paradiski » ramène La Plagne et Les Arcs',
  ['La Plagne', 'Les Arcs'].every((n) => found('paradiski').includes(n)),
  found('paradiski')
)

console.log('\n4. Normalisation')
check('accents ignorés', squash('Méribel') === squash('meribel'))
check('tirets et apostrophes ignorés', squash("Val-d'Isère") === squash('val d isere'))
check('article de tête ignoré', squash('Les 2 Alpes') === squash('2 alpes'))
check('« st » vaut « saint »', squash('St-Martin') === squash('Saint-Martin'))
const PAIRS: [string, string][] = [
  ['Les Trois Vallées', 'Les 3 Vallées'],
  ['Les Sept Laux', 'Les 7 Laux'],
  ['Les Deux Alpes', 'Les 2 Alpes'],
  ['Aime deux mille', 'Aime 2000'],
  ['Arc mille huit cents', 'Arc 1800'],
  ['Isola deux mille', 'Isola 2000']
]
for (const [words, digits] of PAIRS) {
  check(`« ${words} » ≡ « ${digits} »`, squash(words) === squash(digits), {
    lettres: squash(words),
    chiffres: squash(digits)
  })
}
check(
  'un mot qui commence comme un nombre n’est pas converti',
  squash('Sixt-Fer-à-Cheval') === 'sixtferacheval',
  squash('Sixt-Fer-à-Cheval')
)

console.log('\n5. Tolérance de frappe, et ses limites')
check('une faute reste trouvable', found('courchvel').includes('Courchevel'), found('courchvel'))
check('deux fautes ne le sont plus', !found('courchvvell').includes('Courchevel'))
check(
  'une faute sur un mot court n’ouvre pas les noms longs',
  found('chatel').length === 1 && found('chatel')[0] === 'Chatel',
  found('chatel')
)
check('une saisie courte ne ramène pas tout', found('va').length < stations.length, {
  trouves: found('va').length,
  total: stations.length
})
check('une saisie inconnue ne propose rien', index.suggest('zzzzzz', 8).length === 0)

console.log('\n6. Segments de libellé et contre-test')
check(
  '« Vars – Risoul, La Forêt Blanche » donne trois lieux',
  villagesOfName('Vars – Risoul, La Forêt Blanche').join('|') === 'Vars|Risoul|La Forêt Blanche',
  villagesOfName('Vars – Risoul, La Forêt Blanche')
)
const vallorcine = found('Vallorcine')
check(
  'Vallorcine ne remonte aucune station des Portes du Mont-Blanc',
  !vallorcine.some((n) => /combloux|giettaz|cordon|jaillet/i.test(n)),
  vallorcine
)

console.log('\n7. Suggestions')
const suggestions = index.suggest('montchavin', 8)
check('« montchavin » est proposé', suggestions.some((s) => s.label === 'Montchavin'), suggestions.map((s) => s.label))
check(
  'la suggestion dit à quel domaine elle mène',
  suggestions.every((s) => s.kind === 'station' || s.context.length > 0),
  suggestions
)
check(
  'la sélection écrit un texte qui filtre réellement la liste',
  suggestions.every((s) => found(s.query).length > 0),
  suggestions.filter((s) => found(s.query).length === 0)
)
check('aucune suggestion vide', suggestions.every((s) => s.label.trim().length > 0))

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log(`\n${ACCEPTANCE.length} saisies résolues sur ${stations.length} stations.`)
