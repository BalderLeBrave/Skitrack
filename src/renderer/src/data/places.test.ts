/**
 * Un village mène-t-il à son domaine ?
 *
 * C'est la seule question que pose ce test, et elle se vérifie sur le
 * référentiel livré plutôt que sur des données de test : un index de lieux qui
 * fonctionne sur trois entrées inventées et rate « Montchavin » ne sert à rien.
 *
 * Chaque cas donne une saisie telle qu'on la tape — minuscules, sans accents,
 * parfois avec une faute — et le domaine ou le forfait relié qu'elle doit
 * atteindre.
 *
 *   npm run places:test
 */

import { placeIndex, squash, villagesOfName } from './places'
import { BUNDLED_REFERENTIAL, domainsFromReferential } from './referentiel'
import { slug } from '@/domain/format'

const domains = domainsFromReferential(BUNDLED_REFERENTIAL, slug)
const index = placeIndex(domains)

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

console.log(`\nIndex des lieux — ${domains.length} domaines du référentiel livré\n`)

/** Domaines que la liste montrerait pour cette saisie. */
function found(query: string): string[] {
  return domains.filter((d) => index.matches(d, query)).map((d) => d.name)
}

/**
 * Villages de grands domaines, tapés comme on les tape.
 *
 * `expect` est un nom que la liste résultante doit contenir : c'est le domaine
 * auquel le village appartient réellement.
 */
const CASES: { query: string; expect: string; hint: string }[] = [
  { query: 'montchavin', expect: 'La Plagne', hint: 'Paradiski' },
  { query: 'val claret', expect: "Tignes – Val d'Isère", hint: 'Espace Killy' },
  { query: 'vaujany', expect: 'Vaujany', hint: "Alpe d'Huez Grand Domaine" },
  { query: 'mottaret', expect: 'Méribel', hint: 'Les 3 Vallées' },
  { query: 'reberty', expect: 'Les Menuires – Saint-Martin', hint: 'Les 3 Vallées' },
  { query: 'la mongie', expect: 'Barèges – La Mongie', hint: 'Grand Tourmalet' },
  { query: 'chantemerle', expect: 'Serre Chevalier – Chantemerle 1350', hint: 'Serre Chevalier' },
  { query: 'arc 1950', expect: 'Les Arcs – Peisey-Vallandry', hint: 'Paradiski' },
  { query: 'les claux', expect: 'Vars – Risoul, La Forêt Blanche', hint: 'La Forêt Blanche' },
  { query: 'lanslevillard', expect: 'Val Cenis – Haute Maurienne', hint: 'Haute-Maurienne' }
]

console.log('1. Villages → domaine')
for (const c of CASES) {
  const hits = found(c.query)
  check(
    `« ${c.query} » → ${c.expect} (${c.hint})`,
    hits.includes(c.expect),
    hits.length > 6 ? `${hits.length} domaines, dont ${hits.slice(0, 6).join(', ')}` : hits
  )
}

console.log('\n2. Forfait relié : le nom de l’ensemble ramène tous ses villages')
const paradiski = found('paradiski')
check('« paradiski » ramène La Plagne et Les Arcs', paradiski.includes('La Plagne') && paradiski.includes('Les Arcs – Peisey-Vallandry'), paradiski)
const killy = found('espace killy')
check('« espace killy » ramène Tignes et Val d’Isère', killy.some((n) => n.startsWith('Tignes')) && killy.includes('Val d’Isère'), killy)

console.log('\n3. Normalisation et tolérance de frappe')
check('accents ignorés', squash('Méribel') === squash('meribel'))
check('tirets et apostrophes ignorés', squash("Val-d'Isère") === squash('val d isere'))
check('article de tête ignoré', squash('Les 2 Alpes') === squash('2 alpes'))
check('« st » vaut « saint »', squash('St-Martin') === squash('Saint-Martin'))
check('une faute de frappe reste trouvable', found('courchvel').includes('Courchevel'), found('courchvel'))
check('deux fautes ne le sont plus', !found('courchvvell').includes('Courchevel'))
check(
  'une saisie courte ne ramène pas tout',
  found('va').length < domains.length,
  { trouves: found('va').length, total: domains.length }
)

console.log('\n4. Segments de libellé')
check(
  '« Vars – Risoul, La Forêt Blanche » donne trois lieux',
  villagesOfName('Vars – Risoul, La Forêt Blanche').join('|') === 'Vars|Risoul|La Forêt Blanche',
  villagesOfName('Vars – Risoul, La Forêt Blanche')
)
check(
  'l’altitude accolée est retirée',
  villagesOfName('Serre Chevalier – Chantemerle 1350').includes('Chantemerle'),
  villagesOfName('Serre Chevalier – Chantemerle 1350')
)

console.log('\n5. Suggestions')
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
check('une saisie inconnue ne propose rien', index.suggest('zzzzzz', 8).length === 0)

console.log('\n6. Liste d’acceptation du modèle « stations d’abord »')

/** Chaque saisie doit ramener la station nommée, quelle que soit sa graphie. */
const ACCEPTANCE: [string, string][] = [
  ['Méribel', 'Méribel'], ['meribel', 'Méribel'], ['MERIBEL', 'Méribel'],
  ['Méribel-Mottaret', 'Méribel-Mottaret'],
  ['Les Menuires', 'Les Menuires – Saint-Martin'], ['menuires', 'Les Menuires – Saint-Martin'],
  ['menu', 'Les Menuires – Saint-Martin'],
  ['Saint-Martin-de-Belleville', 'Saint-Martin-de-Belleville'],
  ['st martin de belleville', 'Saint-Martin-de-Belleville'],
  ['La Toussuire', 'La Toussuire – Les Sybelles'],
  ['le corbier', 'Le Corbier – Les Sybelles'],
  ['st sorlin d arves', 'Saint-Sorlin-d’Arves'],
  ['Combloux', 'Combloux'], ['La Giettaz', 'La Giettaz'],
  ['Avoriaz', 'Avoriaz 1800'], ['chatel', 'Châtel'],
  ['Samoëns', 'Samoëns – Le Grand Massif'], ['samoens', 'Samoëns – Le Grand Massif'],
  ['Montchavin', 'Montchavin – Les Coches'],
  ['Peisey-Vallandry', 'Les Arcs – Peisey-Vallandry'],
  ['Aime 2000', 'Aime 2000'], ['Aime deux mille', 'Aime 2000'],
  ['Vaujany', 'Vaujany'], ['Le Monêtier', 'Serre Chevalier – Le Monêtier 1500'],
  // Saisir le domaine résout vers ses stations.
  ['Les 3 Vallées', 'Méribel'], ['Les Trois Vallées', 'Méribel'],
  ['trois vallees', 'Méribel'], ['3 vallées', 'Méribel'],
  ['Les Deux Alpes', 'Les 2 Alpes'], ['Les 2 Alpes', 'Les 2 Alpes'],
  ['Les Sept Laux', 'Les 7 Laux'], ['Les 7 Laux', 'Les 7 Laux']
]
for (const [query, expected] of ACCEPTANCE) {
  const list = found(query)
  check(`« ${query} » → ${expected}`, list.includes(expected), { trouves: list.length, tete: list.slice(0, 4) })
}

console.log('\n7. Nombres en lettres : les deux graphies donnent la même clé')
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

console.log('\n8. Contre-test de rattachement')
const vallorcine = found('Vallorcine')
check(
  'Vallorcine ne remonte aucune station des Portes du Mont-Blanc',
  !vallorcine.some((n) => /combloux|giettaz|cordon|jaillet/i.test(n)),
  vallorcine
)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log(`\nIndex des lieux : ${CASES.length} villages résolus sur ${domains.length} domaines.`)
