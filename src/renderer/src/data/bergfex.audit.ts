/**
 * Confronte la liste de stations de SKITRACK à celle de bergfex.fr.
 *
 * ## Ce que cet audit fait, et ce qu'il ne fait pas
 *
 * Il **compare**. Il n'importe rien : la liste tierce vit dans
 * `docs/diagnostics/bergfex-france.txt`, hors du code livré, et n'est jamais
 * chargée par l'application. Ce qui en sort est un rapport, pas de la donnée.
 *
 * La question posée est celle qu'on ne peut pas trancher depuis le référentiel
 * seul : **une entrée de SKITRACK est-elle une station, ou un domaine déguisé ?**
 * Une entrée qu'un annuaire de stations ne connaît pas est suspecte ; une
 * station qu'il liste et que SKITRACK ignore est un manque. Les deux sont
 * écrits, aucun n'est comblé automatiquement.
 *
 * ## Pourquoi la comparaison de noms demande du soin
 *
 * bergfex abrège — « St. Martin Belle », « St François Long », « Grand Serre »,
 * « ND de Bellecombe » — et compose — « Brévent - Flégère / Chamonix ». Une
 * égalité stricte de chaînes déclarerait des dizaines de faux écarts. La
 * comparaison passe donc par `squash` (sans accents, sans articles, sans
 * ponctuation) puis, à défaut, par une comparaison **mot à mot** où chaque mot
 * du nom le plus court doit amorcer un mot de l'autre.
 *
 * Un rapprochement approximatif est signalé comme tel dans le rapport : il vaut
 * comme piste, pas comme preuve.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { BUNDLED_REFERENTIAL, domainsFromReferential } from './referentiel'
import { collapseToStations } from './stationList'
import { skiAreaIndex } from './skiAreas'
import { squash } from './places'
import { slug } from '@/domain/format'

const REFERENCE = 'docs/diagnostics/bergfex-france.txt'
const OUT = 'docs/diagnostics/verification-bergfex.md'

const stations = collapseToStations(domainsFromReferential(BUNDLED_REFERENTIAL, slug))
const { byStation } = skiAreaIndex(stations)

const bergfex = readFileSync(REFERENCE, 'utf-8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'))
const bergfexUnique = [...new Set(bergfex)]

/** Segments comparables d'un nom : le tout, puis chaque morceau séparé. */
function keysOf(name: string): string[] {
  const parts = name.split(/\s*[/–—]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean)
  return [...new Set([squash(name), ...parts.map(squash)])].filter(Boolean)
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
}

/**
 * Deux noms désignent-ils le même lieu ?
 *
 * bergfex abrège — « St. Martin Belle » pour Saint-Martin-de-Belleville,
 * « St François Long » pour Saint-François-Longchamp — et ajoute des altitudes
 * — « Avoriaz 1800 ». Une égalité de chaînes rate tout cela. La règle retenue :
 * **chaque mot du nom le plus court doit être le début d'un mot de l'autre**.
 * « belle » rejoint « belleville », « sixt » rejoint « sixtferacheval », et
 * « avoriaz » rejoint « avoriaz 1800 ».
 *
 * Un seul mot ne suffit que s'il fait cinq caractères : sans ce garde, « grand »
 * ou « col » rapprocheraient n'importe quoi.
 */
function samePlace(a: string, b: string): boolean {
  const [short, long] = tokensOf(a).length <= tokensOf(b).length ? [tokensOf(a), tokensOf(b)] : [tokensOf(b), tokensOf(a)]
  if (short.length === 0) return false
  // Un mot unique de quatre caractères suffit quand il est distinctif — « Gets »,
  // « Sixt » —, mais pas en dessous : « col », « val » ou « mont » ouvriraient
  // la porte à la moitié de la liste.
  if (short.length === 1 && short[0].length < 4) return false
  return short.every((word) => long.some((other) => other.startsWith(word) || word.startsWith(other)))
}

const bergfexKeys = new Map<string, string>()
for (const name of bergfexUnique) for (const key of keysOf(name)) if (!bergfexKeys.has(key)) bergfexKeys.set(key, name)

interface Match {
  station: string
  bergfex: string | null
  exact: boolean
}

const matches: Match[] = stations.map((station) => {
  const keys = keysOf(station.name)
  const exactKey = keys.find((k) => bergfexKeys.get(k) && squash(bergfexKeys.get(k) as string) === k)
  if (exactKey) return { station: station.name, bergfex: bergfexKeys.get(exactKey) as string, exact: true }
  // À défaut d'égalité, la comparaison mot à mot, signalée comme approximative.
  const loose = bergfexUnique.find((name) => samePlace(name, station.name))
  return { station: station.name, bergfex: loose ?? null, exact: false }
})

const missing = bergfexUnique.filter((name) => !stations.some((s) => samePlace(name, s.name)))
const unknown = matches.filter((m) => m.bergfex === null)
const loose = matches.filter((m) => m.bergfex !== null && !m.exact)

const lines: string[] = []
const w = (s = ''): void => void lines.push(s)

w('# Vérification de la liste de stations contre bergfex.fr')
w()
w('*Généré par `npm run bergfex:audit` — ne pas éditer à la main.*')
w(`*Référence : \`${REFERENCE}\`, relevée le 18 août 2026 sur https://www.bergfex.fr/frankreich/*`)
w()
w('## Chiffres')
w()
w('| | |')
w('| --- | --- |')
w(`| Stations SKITRACK | **${stations.length}** |`)
w(`| Stations bergfex | **${bergfexUnique.length}** |`)
w(`| Rapprochées exactement | ${matches.filter((m) => m.exact).length} |`)
w(`| Rapprochées approximativement | ${loose.length} |`)
w(`| SKITRACK sans équivalent bergfex | **${unknown.length}** |`)
w(`| bergfex absentes de SKITRACK | **${missing.length}** |`)
w()
w('## Stations de SKITRACK que bergfex ne connaît pas')
w()
w('Ce sont les **suspectes** : un annuaire de stations qui ignore un nom laisse')
w('penser que ce nom désigne autre chose — un domaine, un secteur, un lieu-dit.')
w('Chaque ligne est à trancher à la main ; rien n’est retiré automatiquement.')
w()
if (unknown.length === 0) w('*Aucune.*')
else {
  w('| Station SKITRACK | Domaine | Massif |')
  w('| --- | --- | --- |')
  for (const m of unknown) {
    const station = stations.find((s) => s.name === m.station)!
    const area = byStation.get(station.id)
    w(`| ${m.station} | ${area && !area.single ? area.name : '—'} | ${station.massif} |`)
  }
}
w()
w('## Stations de bergfex absentes de SKITRACK')
w()
w('Manques possibles du référentiel. La liste inclut des stations suisses')
w('frontalières que bergfex range sous « France » (Champéry, La Dôle, Torgon) et')
w('des sites qui ne sont pas des stations de ski alpin — elles sont laissées,')
w('signalées plutôt que triées d’office.')
w()
for (const name of missing) w(`- ${name}`)
w()
w('## Rapprochements approximatifs')
w()
w('Rapprochés par un segment de nom, pas par égalité. À relire : un segment')
w('commun ne prouve pas qu’il s’agit du même lieu.')
w()
if (loose.length === 0) w('*Aucun.*')
else {
  w('| SKITRACK | bergfex |')
  w('| --- | --- |')
  for (const m of loose) w(`| ${m.station} | ${m.bergfex} |`)
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8')
console.log(
  `${OUT} — ${stations.length} stations SKITRACK vs ${bergfexUnique.length} bergfex : ` +
    `${matches.filter((m) => m.exact).length} exactes, ${loose.length} approximatives, ` +
    `${unknown.length} inconnues de bergfex, ${missing.length} absentes de SKITRACK.`
)
