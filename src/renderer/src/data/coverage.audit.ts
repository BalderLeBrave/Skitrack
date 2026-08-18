/**
 * Confronte la liste de stations de SKITRACK aux listes de référence.
 *
 * ## Ce que cet audit fait, et ce qu'il ne fait pas
 *
 * Il **compare**. Il n'importe rien : les listes tierces vivent dans
 * `docs/diagnostics/`, hors du code livré, et ne sont jamais chargées par
 * l'application. Ce qui en sort est un rapport, pas de la donnée.
 *
 * Deux références, dans cet ordre d'autorité :
 *
 * 1. **France Montagnes** — l'association des acteurs de la montagne française.
 *    Sa liste de 233 stations est la réponse la plus légitime à la question
 *    « qu'est-ce qu'une station de ski française ».
 * 2. **bergfex.fr** — annuaire tiers, 259 entrées, qui range sous « France »
 *    quelques stations suisses frontalières. Utile en second regard : ce que
 *    les deux ignorent est plus suspect que ce qu'une seule ignore.
 *
 * ## Pourquoi la comparaison de noms demande du soin
 *
 * Les trois sources n'écrivent pas pareil. France Montagnes met en capitales et
 * accole la vallée — « LES ARCS BOURG ST MAURICE », « MONTCHAVIN LA PLAGNE ».
 * bergfex abrège — « St. Martin Belle », « ND de Bellecombe ». Une égalité de
 * chaînes déclarerait des dizaines de faux écarts.
 *
 * La règle retenue : **chaque mot du nom le plus court doit amorcer un mot de
 * l'autre**. « belle » rejoint « belleville », « sixt » rejoint
 * « sixtferacheval », « avoriaz » rejoint « avoriaz 1800 ». Un mot unique ne
 * suffit qu'à partir de quatre caractères — sans ce garde, « col », « val » ou
 * « mont » rapprocheraient n'importe quoi.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { BUNDLED_REFERENTIAL, domainsFromReferential } from './referentiel'
import { collapseToStations } from './stationList'
import { skiAreaIndex } from './skiAreas'
import { slug } from '@/domain/format'

const REFERENCES: [string, string][] = [
  ['France Montagnes', 'docs/diagnostics/france-montagnes.txt'],
  ['bergfex.fr', 'docs/diagnostics/bergfex-france.txt']
]
const OUT = 'docs/diagnostics/verification-stations.md'

const stations = collapseToStations(domainsFromReferential(BUNDLED_REFERENTIAL, slug))
const { byStation } = skiAreaIndex(stations)

/** Nombres en lettres, tels qu'ils apparaissent dans les noms de stations. */
const NUMBERS: Record<string, string> = {
  un: '1', une: '1', deux: '2', trois: '3', quatre: '4', cinq: '5',
  six: '6', sept: '7', huit: '8', neuf: '9', dix: '10'
}

/** Mots significatifs d'un nom : sans accents, sans articles, sans ponctuation. */
const ARTICLES = new Set(['le', 'la', 'les', 'l', 'du', 'de', 'des', 'd', 'au', 'aux', 'en', 'sur', 'et'])
function tokensOf(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 0 && !ARTICLES.has(w))
    .map((w) => (w === 'st' ? 'saint' : w))
    // « Les Deux Alpes » et « LES 2 ALPES » sont la même station : sans cette
    // conversion, l'audit la déclarait manquante alors qu'elle est là.
    .map((w) => NUMBERS[w] ?? w)
}

/** Deux noms désignent-ils le même lieu ? Voir l'en-tête pour la règle. */
function samePlace(a: string, b: string): boolean {
  const ta = tokensOf(a)
  const tb = tokensOf(b)
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  if (short.length === 0) return false
  if (short.length === 1 && short[0].length < 4) return false
  // Le préfixe doit faire au moins quatre caractères des DEUX côtés : sans ce
  // garde, « or » (Métabief Mont d'Or) amorçait « Orange », et « roc »
  // (Rochejean) amorçait « Roc d'Enfer ». Deux faux rapprochements pour une
  // syllabe commune.
  // L'égalité vaut toujours, quelle que soit la longueur — sans quoi « val »
  // ne rejoindrait pas « val ». Seule l'amorce partielle exige quatre lettres.
  const amorce = (a: string, b: string): boolean => a === b || (a.startsWith(b) && b.length >= 4)
  return short.every((word) => long.some((other) => amorce(other, word) || amorce(word, other)))
}

function readList(path: string): string[] {
  const lines = readFileSync(path, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
  // Dédoublonnage sur les mots : « CHAMONIX-MONT-BLANC » et « Chamonix
  // Mont-Blanc » sont la même station écrite deux fois.
  const seen = new Set<string>()
  return lines.filter((name) => {
    const key = tokensOf(name).join(' ')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const lists = REFERENCES.map(([label, path]) => ({ label, path, names: readList(path) }))
const [official] = lists

/** Une station de SKITRACK est-elle connue de cette référence ? */
const knownBy = (station: string, names: string[]): string | null =>
  names.find((name) => samePlace(name, station)) ?? null

const lines: string[] = []
const w = (s = ''): void => void lines.push(s)

w('# Couverture des stations — confrontation aux listes de référence')
w()
w('*Généré par `npm run refs:audit` — ne pas éditer à la main.*')
for (const list of lists) w(`*Référence : \`${list.path}\` — ${list.names.length} stations distinctes.*`)
w()
w('## Chiffres')
w()
w('| | |')
w('| --- | --- |')
w(`| Stations dans SKITRACK | **${stations.length}** |`)
for (const list of lists) {
  const covered = list.names.filter((name) => stations.some((s) => samePlace(name, s.name))).length
  w(`| Stations de ${list.label} retrouvées | ${covered} / ${list.names.length} |`)
}
const orphan = stations.filter((s) => lists.every((l) => !knownBy(s.name, l.names)))
w(`| Stations SKITRACK inconnues des deux références | **${orphan.length}** |`)
w()

const missingOfficial = official.names.filter((name) => !stations.some((s) => samePlace(name, s.name)))

w(`## Manquent à SKITRACK — ${missingOfficial.length} stations de France Montagnes`)
w()
w('C’est l’écart qui compte : la liste officielle en compte')
w(`${official.names.length}, le référentiel livré en couvre ${official.names.length - missingOfficial.length}.`)
w('Chaque ligne indique si bergfex la connaît aussi — une station listée par les')
w('deux sources est un manque certain ; une station listée par une seule mérite')
w('un examen avant d’être ajoutée.')
w()
w('| Station (France Montagnes) | Aussi chez bergfex |')
w('| --- | --- |')
for (const name of missingOfficial) {
  const alsoBergfex = lists[1].names.find((other) => samePlace(other, name))
  w(`| ${name} | ${alsoBergfex ? `oui — « ${alsoBergfex} »` : '—'} |`)
}
w()

w(`## Stations de SKITRACK qu’aucune référence ne connaît — ${orphan.length}`)
w()
w('Suspectes : un nom que ni l’association professionnelle ni l’annuaire ne')
w('listent désigne probablement autre chose qu’une station — un domaine, un')
w('secteur, un site nordique. Rien n’est retiré automatiquement.')
w()
if (orphan.length === 0) w('*Aucune.*')
else {
  w('| Station SKITRACK | Domaine | Massif |')
  w('| --- | --- | --- |')
  for (const station of orphan) {
    const area = byStation.get(station.id)
    w(`| ${station.name} | ${area && !area.single ? area.name : '—'} | ${station.massif} |`)
  }
}
w()

w('## Connues d’une seule référence')
w()
w('Ni un manque ni une erreur : les deux sources ne tracent pas la même')
w('frontière. Utile pour arbitrer les cas douteux.')
w()
w('| Station SKITRACK | France Montagnes | bergfex |')
w('| --- | --- | --- |')
for (const station of stations) {
  const fm = knownBy(station.name, official.names)
  const bf = knownBy(station.name, lists[1].names)
  if ((fm === null) !== (bf === null)) w(`| ${station.name} | ${fm ?? '—'} | ${bf ?? '—'} |`)
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8')
console.log(
  `${OUT} — ${stations.length} stations SKITRACK ; ` +
    lists
      .map((l) => `${l.label} ${l.names.filter((n) => stations.some((s) => samePlace(n, s.name))).length}/${l.names.length}`)
      .join(' · ') +
    ` ; ${missingOfficial.length} manquantes (officielles), ${orphan.length} inconnues des deux.`
)
