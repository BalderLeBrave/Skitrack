/**
 * Index des lieux : du village au domaine.
 *
 * ## Le problème
 *
 * On ne cherche pas un séjour au ski par le nom du domaine relié. On le cherche
 * par le nom du village où l'on va dormir — « Montchavin », « Val Claret »,
 * « Mottaret » — parce que c'est celui qui figure sur l'annonce de location et
 * dans la conversation. Or l'index de recherche ne connaissait que le libellé
 * du domaine : taper « montchavin » ne menait à rien, alors que Montchavin est
 * une porte d'entrée de Paradiski.
 *
 * Ce module construit l'index inverse — **village → domaine** — à partir du
 * référentiel lui-même :
 *
 * * les segments du nom du domaine, qui accolent presque toujours plusieurs
 *   communes (« Vars – Risoul, La Forêt Blanche », « Montchavin – Les Coches ») ;
 * * le nom de station de `data/stations.ts`, aligné sur le collecteur ;
 * * le **forfait relié** (`pass`), qui est le nom sous lequel on désigne
 *   l'ensemble — Paradiski, Espace Killy, Les 3 Vallées — et que la recherche
 *   ignorait jusqu'ici alors qu'il est dans le référentiel ;
 * * la région et le massif, déjà cherchés auparavant.
 *
 * ## Ce qui vient d'une table tenue à la main
 *
 * Les hameaux et fronts de neige n'ont pas d'entrée propre dans le référentiel :
 * « Val Claret » et « Le Lavachet » sont des quartiers de Tignes, pas des
 * domaines. `VILLAGE_ALIASES` les rattache à leur station, sur le même principe
 * que `STATION_BY_SLUG` — une table courte, explicite, et limitée aux
 * rattachements qui ne prêtent pas à discussion. Un hameau absent de cette table
 * ne se résout pas : mieux vaut un lieu introuvable qu'un lieu rattaché au
 * mauvais domaine.
 *
 * ## Normalisation
 *
 * Tout passe par `fold` (minuscules, sans accents, ponctuation en espaces) puis
 * `squash` (sans espaces). C'est ce qui fait que « montchavin », « Montchavin »,
 * « Saint-Martin » et « st martin » se rencontrent. Une tolérance de frappe d'un
 * caractère est appliquée en dernier recours, sur le début du terme seulement :
 * assez pour « courchvel », pas assez pour confondre deux stations voisines.
 */

import type { Domain } from './referentiel'
import { stationNameOf } from './stations'

/** Forme comparable : minuscules, sans accents, ponctuation réduite à l'espace. */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/’/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Articles français qu'on ne tape pas toujours : « les 2 alpes » / « 2 alpes ». */
const ARTICLES = new Set(['le', 'la', 'les', 'l', 'du', 'de', 'des', 'd', 'aux', 'au'])

/**
 * Nombres écrits en lettres → chiffres.
 *
 * Le référentiel écrit « Les 3 Vallées », « Les 7 Laux », « Aime 2000 » — en
 * chiffres. L'utilisateur, lui, tape aussi bien « Les Trois Vallées » ou
 * « Aime deux mille », et ces saisies ne ramenaient rien. C'était le dernier
 * manque réel de l'index, et il vaut dans les deux sens : la conversion est
 * appliquée à l'indexation **et** à la saisie, par la même fonction, sans quoi
 * les deux formes ne se rencontreraient jamais.
 *
 * Les altitudes des noms de stations en dépendent aussi : « Arc mille huit
 * cents » doit rejoindre « Arc 1800 ».
 */
const UNITS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60
}
/** Multiplicateurs : ils agissent sur ce qui précède, pas sur eux-mêmes. */
const HUNDRED = new Set(['cent', 'cents'])
const THOUSAND = new Set(['mille', 'milles'])

function isNumberWord(word: string): boolean {
  return word in UNITS || HUNDRED.has(word) || THOUSAND.has(word)
}

/**
 * Valeur d'une suite ininterrompue de mots-nombres.
 *
 * « deux mille » vaut 2 000 et non « 2 » puis « 1000 » : un multiplicateur
 * agit sur ce qui le précède. « quatre-vingts » vaut 80 pour la même raison —
 * `vingt` derrière une unité multiplie au lieu d'additionner, ce qui est la
 * seule irrégularité du français à traiter ici.
 */
function numberFromWords(words: string[]): number {
  let total = 0
  let current = 0
  for (const word of words) {
    if (THOUSAND.has(word)) {
      total += (current || 1) * 1000
      current = 0
      continue
    }
    if (HUNDRED.has(word)) {
      current = (current || 1) * 100
      continue
    }
    const value = UNITS[word]
    if (word === 'vingt' && current >= 2 && current <= 9) current *= 20
    else current += value
  }
  return total + current
}

/** Remplace chaque suite de mots-nombres par sa valeur chiffrée. */
function digitsFromWords(words: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    if (!isNumberWord(words[i])) {
      out.push(words[i])
      continue
    }
    let end = i
    while (end + 1 < words.length && isNumberWord(words[end + 1])) end++
    out.push(String(numberFromWords(words.slice(i, end + 1))))
    i = end
  }
  return out
}

/** Forme sans espaces ni articles : « saint-martin » et « stmartin » se rejoignent. */
export function squash(value: string): string {
  const words = fold(value)
    .split(' ')
    .filter((word) => word.length > 0 && !ARTICLES.has(word))
  return digitsFromWords(words).join('').replace(/^st/, 'saint')
}

/**
 * Distance d'édition bornée à 1.
 *
 * Bornée et non complète : au-delà d'une faute, deux noms de station se
 * ressemblent trop pour qu'une correspondance soit un service — « Vars » et
 * « Var », « Aussois » et « Aussoix » passent, « Tignes » et « Vignes » aussi,
 * mais « Méribel » et « Méribel-Mottaret » ne se confondent pas.
 */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (long.length - short.length > 1) return false

  let i = 0
  let j = 0
  let slack = 1
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++
      j++
      continue
    }
    if (slack === 0) return false
    slack--
    if (short.length === long.length) i++
    j++
  }
  return true
}

/**
 * Hameaux, fronts de neige et communes membres, par nom de station.
 *
 * Tenue à la main, comme `STATION_BY_SLUG` — le référentiel ne descend pas au
 * niveau du quartier. Les clés sont les libellés rendus par `stationNameOf`.
 */
const VILLAGE_ALIASES: Record<string, string[]> = {
  Tignes: ['Val Claret', 'Tignes le Lac', 'Le Lavachet', 'Les Boisses', 'Les Brévières'],
  "Val d'Isère": ['La Daille', 'Le Fornet', 'Le Joseray'],
  'Val Thorens': ['Orelle', 'Caron'],
  'Les Menuires': ['Reberty', 'Les Bruyères', 'La Croisette', 'Preyerand', 'Saint-Martin-de-Belleville'],
  Méribel: ['Mottaret', 'Méribel-Mottaret', 'Méribel-Village', 'Les Allues', 'Le Raffort'],
  Courchevel: ['Moriond', 'Le Praz', 'Saint-Bon', 'La Tania'],
  'La Plagne': [
    'Plagne Centre',
    'Plagne Bellecôte',
    'Belle Plagne',
    'Plagne Soleil',
    'Plagne Villages',
    'Plagne 1800',
    'Aime 2000',
    'Montalbert',
    'Montchavin',
    'Les Coches',
    'Champagny-en-Vanoise'
  ],
  'Les Arcs': [
    'Arc 1600',
    'Arc 1800',
    'Arc 1950',
    'Arc 2000',
    'Bourg-Saint-Maurice',
    'Peisey',
    'Vallandry',
    'Peisey-Vallandry',
    'Villaroger',
    'Landry'
  ],
  "Alpe d'Huez": ['Huez', 'Oz-en-Oisans', 'Vaujany', 'Villard-Reculas', 'Auris-en-Oisans'],
  'Serre Chevalier': ['Chantemerle', 'Villeneuve', 'Le Monêtier-les-Bains', 'Briançon', 'Saint-Chaffrey'],
  'Les Deux Alpes': ['Vénosc', 'Mont-de-Lans'],
  Chamonix: ['Argentière', 'Les Praz', 'Le Tour', 'Les Bossons', 'Les Houches', 'Vallorcine'],
  Morzine: ['Les Prodains', 'Avoriaz'],
  Vars: ['Les Claux', 'Sainte-Marie', 'Sainte-Catherine', 'Saint-Marcellin', 'Risoul'],
  Flaine: ['Les Carroz', 'Samoëns', 'Morillon', 'Sixt-Fer-à-Cheval'],
  'Val Cenis': ['Lanslebourg', 'Lanslevillard', 'Termignon', 'Bramans', 'Sollières'],
  Valmorel: ['Doucy', 'Combelouvière', 'Saint-François-Longchamp'],
  'La Rosière': ['Montvalezan', 'Séez'],
  'Grand Tourmalet': ['La Mongie', 'Barèges'],
  'Saint-Lary-Soulan': ['Espiaube', "Pla d'Adet", 'Vielle-Aure'],
  Peyragudes: ['Peyresourde', 'Les Agudes'],
  'Les Saisies': ['Hauteluce', 'Bisanne', 'Crest-Voland'],
  Megève: ['Rochebrune', 'Le Mont d’Arbois', 'Combloux', 'La Giettaz']
}

/**
 * Communes accolées dans le libellé d'un domaine.
 *
 * « Vars – Risoul, La Forêt Blanche » nomme deux stations et un domaine relié ;
 * « Serre Chevalier – Chantemerle 1350 » nomme un domaine et un village. Chaque
 * segment est un terme de recherche à part entière.
 */
export function villagesOfName(name: string): string[] {
  return name
    .replace(/’/g, "'")
    .split(/\s[–—-]\s|[/(),]/)
    .map((part) => part.replace(/\s+\d{3,4}$/, '').trim())
    .filter((part) => part.length > 1)
}

/**
 * Ce qu'une suggestion désigne.
 *
 * `station` est le résultat premier — c'est ce que l'utilisateur cherche et
 * sélectionne. `area` est le domaine skiable, qui résout vers ses stations.
 * `village` est un hameau sans entrée propre, qui mène à sa station.
 */
export type PlaceKind = 'station' | 'village' | 'area'

export interface PlaceSuggestion {
  /** Le lieu tel qu'il s'écrit : nom de station, de village ou de domaine. */
  label: string
  kind: PlaceKind
  /** Le domaine skiable auquel ce lieu mène. Vide quand la station est seule. */
  context: string
  /** Texte écrit dans `domainQuery` à la sélection : ce qui filtre la liste. */
  query: string
}

interface Term {
  /** Le terme tel qu'il s'affiche. */
  label: string
  /** Forme comparable, sans espaces. */
  key: string
  kind: PlaceKind
}

export interface PlaceIndex {
  /** Le domaine répond-il à cette recherche ? */
  matches: (domain: Domain, query: string) => boolean
  /** Suggestions d'autocomplétion, les plus pertinentes d'abord. */
  suggest: (query: string, max: number) => PlaceSuggestion[]
}

/** Ce à quoi mène un lieu : le forfait relié quand il existe, le domaine sinon. */
function areaOf(d: Domain): string {
  return d.pass || d.name
}

function termsOf(d: Domain): Term[] {
  const out: Term[] = []
  const seen = new Set<string>()
  const push = (label: string | null | undefined, kind: PlaceKind): void => {
    if (!label) return
    const key = squash(label)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push({ label, key, kind })
  }

  push(d.name, 'station')
  if (d.pass) push(d.pass, 'area')
  for (const village of villagesOfName(d.name)) push(village, 'village')
  const station = stationNameOf(d.name)
  push(station, 'village')
  for (const alias of VILLAGE_ALIASES[station] ?? []) push(alias, 'village')
  // Région et massif restent cherchables — c'est ce que faisait déjà l'écran —
  // mais ne sont jamais proposés en autocomplétion : « Auvergne-Rhône-Alpes »
  // n'est pas une destination, c'est un tiers du référentiel.
  push(d.region, 'area')
  push(d.massif, 'area')
  return out
}

/**
 * Un terme répond-il à la saisie ?
 *
 * Trois passes, de la plus sûre à la plus permissive. La tolérance de frappe ne
 * s'applique qu'au **début** du terme et à partir de quatre caractères : sur
 * deux ou trois lettres, une faute tolérée fait correspondre n'importe quoi.
 */
function termMatches(term: Term, needle: string): boolean {
  if (term.key.includes(needle)) return true
  if (needle.length < 4) return false
  // Deux longueurs de préfixe : la faute peut être une lettre en trop comme une
  // lettre oubliée, et « courchvel » doit se comparer aux dix premières lettres
  // de « courchevel », pas aux neuf.
  return (
    withinOneEdit(term.key.slice(0, needle.length), needle) ||
    withinOneEdit(term.key.slice(0, needle.length + 1), needle)
  )
}

const CACHE = new WeakMap<Domain[], PlaceIndex>()

/**
 * Index des lieux du référentiel chargé.
 *
 * Mémoïsé sur la référence du tableau : la liste des domaines ne change qu'au
 * chargement ou à l'import d'un référentiel, alors que l'index est consulté à
 * chaque frappe et pour chacun des deux cent soixante-dix-sept domaines.
 */
export function placeIndex(domains: Domain[]): PlaceIndex {
  const cached = CACHE.get(domains)
  if (cached) return cached

  const byDomain = new Map<number, Term[]>()
  for (const d of domains) byDomain.set(d.id, termsOf(d))

  const matches = (domain: Domain, query: string): boolean => {
    const needle = squash(query)
    if (!needle) return true
    const terms = byDomain.get(domain.id) ?? termsOf(domain)
    return terms.some((term) => termMatches(term, needle))
  }

  const suggest = (query: string, max: number): PlaceSuggestion[] => {
    const needle = squash(query)
    if (!needle) return []

    interface Scored extends PlaceSuggestion {
      rank: number
      size: number
    }
    const found = new Map<string, Scored>()

    for (const d of domains) {
      for (const term of byDomain.get(d.id) ?? []) {
        // Région et massif ne sont pas des destinations proposables.
        if (term.kind === 'area' && term.label !== d.pass) continue
        if (!termMatches(term, needle)) continue

        const isStation = term.kind === 'station'
        const suggestion: Scored = {
          label: term.label,
          kind: term.kind,
          // Un domaine se suffit à lui-même ; un village doit dire où il mène,
          // sans quoi « Montchavin » ne lève pas l'ambiguïté qu'il crée.
          context: isStation ? (d.pass ?? '') : areaOf(d),
          query: isStation ? d.name : areaOf(d),
          // Un début de mot vaut mieux qu'une occurrence au milieu, et un nom
          // de domaine mieux qu'un hameau : c'est l'ordre dans lequel on
          // reconnaît ce qu'on cherchait.
          // Les stations d'abord : c'est l'entité que l'on cherche. Un début
          // de mot vaut mieux qu'une occurrence au milieu.
          rank: (term.key.startsWith(needle) ? 0 : 2) + (isStation ? 0 : 1),
          size: d.km
        }
        const key = `${squash(suggestion.label)}|${squash(suggestion.query)}`
        const previous = found.get(key)
        if (!previous || suggestion.rank < previous.rank) found.set(key, suggestion)
      }
    }

    return [...found.values()]
      .sort((a, b) => a.rank - b.rank || b.size - a.size || a.label.localeCompare(b.label, 'fr'))
      .slice(0, max)
      .map(({ label, kind, context, query: q }) => ({ label, kind, context, query: q }))
  }

  const index: PlaceIndex = { matches, suggest }
  CACHE.set(domains, index)
  return index
}
