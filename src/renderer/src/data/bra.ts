/**
 * Bulletin d'estimation du risque d'avalanche (BRA).
 *
 * L'application **ne modélise aucun risque**. Le BRA intègre la stratigraphie
 * du manteau neigeux, que personne ne déduit d'une prévision de température :
 * un indice inventé à partir des chutes et du vent donnerait un chiffre
 * plausible et faux, exactement là où l'erreur se paie le plus cher.
 *
 * Ce module ne fait donc que deux choses : rattacher un domaine au massif
 * Météo-France qui le couvre, pour pointer le bon bulletin, et conserver le
 * niveau que l'utilisateur y a lu. Ce niveau porte une date : passé 36 heures,
 * il cesse d'être affiché plutôt que de vieillir en silence.
 */

import { useEffect, useState } from 'react'
import type { BraBulletin } from '@shared/ipc-contract'
import { camKey } from './webcams'

export interface BraSubject {
  id: number
  name: string
  pass: string | null
  massif: string
  region: string
  lat: number | null
}

/** Libellé officiel de chaque niveau de l'échelle européenne. */
export const BRA_LABELS: Record<number, string> = {
  1: 'faible',
  2: 'limité',
  3: 'marqué',
  4: 'fort',
  5: 'très fort'
}

/** Un niveau relevé n'est plus affiché passé ce délai. */
export const BRA_MAX_AGE_MS = 36 * 3600 * 1000

export function braColor(level: number | null): string {
  if (level == null) return 'var(--muted)'
  return level >= 3 ? 'var(--warn)' : 'var(--ok)'
}

/**
 * Massifs Météo-France et les stations qui s'y rattachent.
 *
 * Le rapprochement se fait sur le mot-clé le plus long trouvé dans le nom du
 * domaine — « haute maurienne » l'emporte sur « maurienne », qui est un massif
 * distinct avec son propre bulletin.
 */
const BRA_KEYWORDS: [string, string[]][] = [
  ['Haute-Tarentaise', ['tignes', 'val d isere', 'espace killy', 'les arcs', 'la rosiere', 'sainte foy', 'peisey', 'vallandry', 'villaroger', 'bourg saint maurice', 'paradiski', 'san bernardo']],
  ['Vanoise', ['la plagne', 'courchevel', 'meribel', 'les menuires', 'val thorens', '3 vallees', 'trois vallees', 'valmorel', 'champagny', 'pralognan', 'brides', 'la tania', 'saint martin de belleville', 'doucy', 'combelouviere', 'aussois', 'orelle', 'la norma']],
  ['Haute-Maurienne', ['val cenis', 'bessans', 'bonneval', 'haute maurienne', 'termignon', 'lanslebourg', 'lanslevillard']],
  ['Maurienne', ['valloire', 'valmeinier', 'karellis', 'la toussuire', 'le corbier', 'saint sorlin', 'saint jean d arves', 'albiez', 'valfrejus', 'saint francois longchamp', 'sybelles', 'montaimont', 'les bottieres']],
  ['Grandes-Rousses', ['alpe d huez', 'huez', 'vaujany', 'oz en oisans', 'auris', 'villard reculas', 'grand domaine huez']],
  ['Oisans', ['les 2 alpes', 'les deux alpes', 'la grave', 'venosc', 'alpe du grand serre', 'mont de lans']],
  ['Belledonne', ['chamrousse', '7 laux', 'sept laux', 'collet d allevard', 'prapoutel', 'pipay', 'le pleynet']],
  ['Chartreuse', ['saint pierre de chartreuse', 'le sappey', 'col de porte', 'saint hilaire du touvet', 'chartreuse']],
  ['Vercors', ['villard de lans', 'correncon', 'lans en vercors', 'autrans', 'meaudre', 'gresse en vercors', 'font d urle', 'col de rousset', 'vercors']],
  ['Bauges', ['la feclaz', 'savoie grand revard', 'aillon', 'margeriaz', 'le semnoz', 'bauges']],
  ['Beaufortain', ['areches', 'beaufort', 'hauteluce', 'les saisies', 'crest voland', 'cohennoz', 'notre dame de bellecombe', 'espace diamant', 'val d arly', 'flumet', 'praz sur arly']],
  ['Mont-Blanc', ['chamonix', 'les houches', 'argentiere', 'saint gervais', 'les contamines', 'megeve', 'combloux', 'vallorcine', 'servoz', 'grands montets', 'brevent', 'le tour', 'mont blanc']],
  ['Aravis', ['la clusaz', 'grand bornand', 'manigod', 'la giettaz', 'saint jean de sixt', 'flaine', 'samoens', 'morillon', 'sixt', 'les carroz', 'grand massif', 'aravis']],
  ['Chablais', ['avoriaz', 'morzine', 'les gets', 'chatel', 'portes du soleil', 'bernex', 'thollon', 'abondance', 'la chapelle d abondance', 'saint jean d aulps', 'chablais']],
  ['Pelvoux', ['serre chevalier', 'puy saint vincent', 'pelvoux', 'briancon', 'chantemerle', 'villeneuve la salle', 'le monetier']],
  ['Queyras', ['ceillac', 'abries', 'molines', 'saint veran', 'arvieux', 'queyras', 'risoul']],
  ['Embrunais-Parpaillon', ['les orres', 'reallon', 'crevoux', 'vars', 'foret blanche', 'embrun', 'saint apollinaire']],
  ['Devoluy', ['superdevoluy', 'super devoluy', 'joue du loup', 'devoluy']],
  ['Champsaur', ['orcieres', 'merlette', 'ancelle', 'chaillol', 'laye', 'saint leger les melezes', 'champsaur']],
  ['Ubaye', ['pra loup', 'praloup', 'sauze', 'sainte anne', 'la condamine', 'ubaye', 'barcelonnette']],
  ['Haut_Var-Haut_Verdon', ['val d allos', 'la foux d allos', 'allos', 'le seignus', 'la colle saint michel', 'haut verdon']],
  ['Mercantour', ['isola 2000', 'auron', 'valberg', 'beuil', 'la colmiane', 'roubion', 'turini', 'mercantour', 'saint dalmas']],
  ['Aure-Louron', ['saint lary', 'peyragudes', 'piau engaly', 'val louron', 'peyresourde']],
  ['Haute-Bigorre', ['la mongie', 'bareges', 'grand tourmalet', 'cauterets', 'hautacam', 'gavarnie', 'luz ardiden', 'pic du midi', 'tourmalet']],
  ['Aspe-Ossau', ['gourette', 'artouste', 'pierre saint martin', 'issarbe', 'somport', 'le somport', 'ossau']],
  ['Luchonnais', ['superbagneres', 'luchon', 'luchonnais']],
  ['Haute-Ariege', ['ax 3 domaines', 'ax les thermes', 'ascou', 'mijanes', 'beille', 'chioula', 'ariege']],
  ['Capcir-Puymorens', ['formigueres', 'les angles', 'porte puymorens', 'puyvalador', 'capcir']],
  ['Cerdagne-Canigou', ['font romeu', 'pyrenees 2000', 'la quillane', 'err puigmal', 'cambre d aze', 'saint pierre dels forcats', 'canigou']],
  ['Couserans', ['guzet', 'etang de lers', 'goulier', 'couserans']],
  ['Pays-Basque', ['iraty', 'pays basque']]
]

/** Massifs du référentiel qui portent déjà le nom Météo-France. */
const MASSIF_ALIASES = new Map(BRA_KEYWORDS.map(([massif]) => [camKey(massif.replace(/_/g, ' ')), massif]))

function longestMatch(haystack: string): string | null {
  let best: string | null = null
  let length = 0
  for (const [massif, keys] of BRA_KEYWORDS) {
    for (const key of keys) {
      if (key.length > length && haystack.includes(key)) {
        best = massif
        length = key.length
      }
    }
  }
  return best
}

/**
 * Massif Météo-France qui couvre un domaine, ou `null`.
 *
 * Trois essais successifs : le nom du domaine, le massif du référentiel quand
 * il porte déjà un nom Météo-France, puis le nom du forfait relié. Le
 * référentiel OpenSkiMap n'a pas de commune, ce qui limite le rapprochement au
 * nom de la station — sans commune de rattachement, une station isolée sortira
 * simplement sans massif, et l'écran le dira.
 */
export function braMassifOf(domain: BraSubject): string | null {
  const own = longestMatch(camKey(domain.name))
  if (own) return own
  const alias = MASSIF_ALIASES.get(camKey(domain.massif ?? ''))
  if (alias) return alias
  return domain.pass ? longestMatch(camKey(domain.pass)) : null
}

/** Clé de stockage du niveau saisi : le massif, ou le domaine à défaut. */
export function braKeyOf(domain: BraSubject): string {
  return braMassifOf(domain) ?? `dom:${domain.id}`
}

export interface BraLinks {
  massif: string | null
  /** Zone Météo-France : alpes-du-nord, alpes-du-sud, pyrenees, corse. */
  zone: string | null
  /** Portail Météo-France, toujours renseigné. */
  mfUrl: string
  /** Bulletin du jour sur data-avalanche.org, si le massif est identifié. */
  daUrl: string | null
}

/**
 * Liens vers le bulletin officiel.
 *
 * La zone se déduit du massif du référentiel quand il est explicite, sinon de
 * la latitude : Météo-France coupe les Alpes du Nord et du Sud vers 44,85° N.
 */
export function braLinks(domain: BraSubject): BraLinks {
  const massif = braMassifOf(domain)
  const m = camKey(domain.massif ?? '')
  const region = camKey(domain.region ?? '')

  let zone: string | null = null
  if (m === 'pyrenees' || region.includes('pyrenees')) zone = 'pyrenees'
  else if (m === 'corse' || region.includes('corse')) zone = 'corse'
  else if (domain.lat != null) zone = domain.lat >= 44.85 ? 'alpes-du-nord' : 'alpes-du-sud'

  // Date locale et non UTC : à 00 h 30 en France, `toISOString()` renvoie
  // encore la veille et le bulletin pointé n'existe pas.
  const now = new Date()
  const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

  return {
    massif,
    zone,
    mfUrl: zone
      ? `https://meteofrance.com/meteo-montagne/${zone}/risques-avalanche`
      : 'https://meteofrance.com/meteo-montagne',
    daUrl: massif ? `https://www.data-avalanche.org/bra/${iso}/${massif}` : null
  }
}

/**
 * Codes de massif de l'API Météo-France (`DPBRA/v1/liste-massifs`).
 *
 * Ils sont figés ici plutôt que relus à chaque démarrage : la liste n'a pas
 * bougé depuis 2024, elle tient en trente lignes, et une requête réseau pour
 * obtenir une table constante serait un aller-retour de plus avant de pouvoir
 * afficher quoi que ce soit. Les massifs sans domaine dans le référentiel
 * français — Thabor, Corse, Orlu — n'y figurent pas.
 */
const MF_CODES: Record<string, number> = {
  Chablais: 1,
  Aravis: 2,
  'Mont-Blanc': 3,
  Bauges: 4,
  Beaufortain: 5,
  'Haute-Tarentaise': 6,
  Chartreuse: 7,
  Belledonne: 8,
  Maurienne: 9,
  Vanoise: 10,
  'Haute-Maurienne': 11,
  'Grandes-Rousses': 12,
  Vercors: 14,
  Oisans: 15,
  Pelvoux: 16,
  Queyras: 17,
  Devoluy: 18,
  Champsaur: 19,
  'Embrunais-Parpaillon': 20,
  Ubaye: 21,
  'Haut_Var-Haut_Verdon': 22,
  Mercantour: 23,
  'Pays-Basque': 64,
  'Aspe-Ossau': 65,
  'Haute-Bigorre': 66,
  'Aure-Louron': 67,
  Luchonnais: 68,
  Couserans: 69,
  'Haute-Ariege': 70,
  'Capcir-Puymorens': 73,
  'Cerdagne-Canigou': 74
}

/** Code Météo-France du massif qui couvre le domaine, `null` s'il est hors table. */
export function braCodeOf(domain: BraSubject): number | null {
  const massif = braMassifOf(domain)
  return massif ? (MF_CODES[massif] ?? null) : null
}

export type BraManual = Record<string, { n: number; at: number }>

/** Niveau encore valable saisi pour ce domaine, `null` sinon. */
export function braLevelOf(domain: BraSubject, manual: BraManual): number | null {
  const entry = manual[braKeyOf(domain)]
  if (!entry) return null
  return Date.now() - entry.at < BRA_MAX_AGE_MS ? entry.n : null
}

export interface BraState {
  bulletin: BraBulletin | null
  loading: boolean
}

/**
 * Bulletin publié pour le massif du domaine.
 *
 * Le relevé est facultatif : sans clé Météo-France, sans massif identifié ou
 * hors saison, le crochet renvoie simplement un bulletin porteur d'un message
 * et la fiche retombe sur la saisie manuelle. Le niveau relevé prime sur la
 * saisie, mais ne l'efface pas — une lecture faite sur le terrain reste
 * consultable si l'API tombe.
 */
export function useBra(domain: BraSubject | null): BraState {
  const [state, setState] = useState<BraState>({ bulletin: null, loading: false })
  const code = domain ? braCodeOf(domain) : null

  useEffect(() => {
    if (code == null) {
      setState({ bulletin: null, loading: false })
      return
    }
    let cancelled = false
    setState({ bulletin: null, loading: true })
    void window.skitrack
      .bra(code)
      .then((bulletin) => {
        if (!cancelled) setState({ bulletin, loading: false })
      })
      .catch(() => {
        if (!cancelled) setState({ bulletin: null, loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [code])

  return state
}
