/**
 * Coût complet d'un séjour.
 *
 * Le prix d'une semaine au ski n'est pas le prix du logement : les forfaits
 * pèsent souvent autant, la route pèse par foyer et non par personne, et les
 * cours de ski font basculer un budget familial. Tout l'intérêt de
 * l'application tient dans ce total-là, donc il est calculé au même endroit
 * pour tous les écrans — recherche, offres, combinaisons, décision — plutôt que
 * réimplémenté à chaque fois avec des arrondis divergents.
 */

import type { Domain, Forfait } from '@/data/referentiel'
import type { Lodging } from '@/data/lodgings'
import type { Origin, RouteTable } from './travel'
import { travelOf } from './travel'
import type { ForfaitConfiance } from './forfait'
import { forfaitPourDuree, forfaitUnitaires } from './forfait'

/** Consommation retenue, en euros par kilomètre, aller simple. */
const FUEL_PER_KM = 0.115
/** Péages moyens autoroute, en euros par kilomètre. */
const TOLL_PER_KM = 0.058
export const RENTAL_ADULT = 96
export const RENTAL_KID = 58
/** Au-delà, le tarif enfant des forfaits et du matériel ne s'applique plus. */
export const KID_MAX_AGE = 13

export type LessonKind = 'col' | 'priv'

export interface Person {
  id: number
  first: string
  last: string
  age: number
  /** Index du départ dans la liste des lieux. */
  home: number
  lesson?: LessonKind | null
  lesDays?: number
  lesHours?: number
  disc?: 'ski' | 'snow'
}

export function isKid(p: Person): boolean {
  return p.age < KID_MAX_AGE
}

export function adultsCount(people: Person[]): number {
  return people.filter((p) => !isKid(p)).length
}

export function kidsCount(people: Person[]): number {
  return people.filter(isKid).length
}

/** Foyers réellement utilisés : un départ sans voyageur rattaché ne roule pas. */
export function activeOrigins(people: Person[], origins: Origin[]): Origin[] {
  const used = new Set(people.map((p) => p.home))
  const out = origins.filter((_, i) => used.has(i))
  return out.length ? out : origins.slice(0, 1)
}

export interface TripCost {
  fuel: number
  tolls: number
  total: number
  /** Une voiture par foyer : la route se paie autant de fois qu'il y a de départs. */
  cars: number
}

export function tripCost(
  domain: Domain,
  origins: Origin[],
  routes: RouteTable,
  avoidTolls: boolean
): TripCost {
  let fuel = 0
  let tolls = 0
  let cars = 0
  for (const o of origins) {
    const t = travelOf(domain, o, routes)
    // Un foyer sans adresse ne peut pas voir sa route chiffrée : il ne compte
    // pas dans le total plutôt que d'y entrer pour zéro euro.
    if (t.dist == null) continue
    cars++
    fuel += Math.round(t.dist * 2 * FUEL_PER_KM)
    tolls += avoidTolls ? 0 : Math.round(t.dist * TOLL_PER_KM) * 2
  }
  return { fuel, tolls, total: fuel + tolls, cars }
}

// --- Cours de ski --------------------------------------------------------

export const HOUR_OPTS = [
  { v: 1, label: '1 h' },
  { v: 1.5, label: '1 h 30' },
  { v: 2, label: '2 h' },
  { v: 2.5, label: '2 h 30' },
  { v: 3, label: '3 h' },
  { v: 4, label: '4 h' }
]

export function hoursTxt(h: number): string {
  return HOUR_OPTS.find((o) => o.v === h)?.label ?? `${h} h`
}

/** Barème horaire moyen d'une école de ski, en euros. */
const ESF_BASE = { kid: 12.7, adult: 14.3 }

export interface EsfRate {
  kid: number
  adult: number
  source: 'saisi' | 'estimé'
}

export type EsfRates = Record<number, { kid?: number; adult?: number }>

/**
 * Indice de cherté de la station, calé sur le prix du forfait 6 jours. Une
 * station à 359 € n'a pas les mêmes tarifs de moniteur qu'une station à 210 €,
 * et c'est la seule variable de prix qu'on ait relevée par domaine.
 */
export function lessonIndex(forfait: Partial<Forfait>): number {
  const j6 = forfait.j6 ?? 290
  return Math.max(0.82, Math.min(1.28, Math.round((j6 / 290) * 100) / 100))
}

export function esfRate(domainId: number, forfait: Partial<Forfait>, rates: EsfRates): EsfRate {
  const saved = rates[domainId]
  if (saved?.kid) {
    return {
      kid: saved.kid,
      adult: saved.adult ?? Math.round(saved.kid * 1.13 * 10) / 10,
      source: 'saisi'
    }
  }
  const k = lessonIndex(forfait)
  return {
    kid: Math.round(ESF_BASE.kid * k * 10) / 10,
    adult: Math.round(ESF_BASE.adult * k * 10) / 10,
    source: 'estimé'
  }
}

export interface Lesson {
  type: LessonKind
  days: number
  hours: number
  /** Volume total d'heures sur la semaine. */
  total: number
  label: string
  sub: string
  price: number
}

/**
 * Prix des cours d'un voyageur.
 *
 * Collectif : tarif horaire dégressif quand la semaine s'allonge, majoration de
 * 10 % en snowboard (groupes plus petits). Particulier : barème par tranche
 * d'heures, indexé sur la station.
 */
export function lessonOf(p: Person, rate: EsfRate, index: number): Lesson | null {
  const type: LessonKind | null = p.lesson === 'col' || p.lesson === 'priv' ? p.lesson : p.lesson ? 'col' : null
  if (!type) return null

  const days = Math.max(1, Math.min(6, p.lesDays ?? 6))
  const hours = p.lesHours ?? (type === 'col' ? 2.5 : 2)
  const total = days * hours

  let price: number
  if (type === 'col') {
    const base = isKid(p) ? rate.kid : rate.adult
    const degressif = 1 + 0.06 * (6 - days)
    const snow = p.disc === 'snow' ? 1.1 : 1
    price = base * total * degressif * snow
  } else {
    const base = total <= 2 ? 66 : total <= 6 ? 62 : 58
    price = base * total * index
  }

  return {
    type,
    days,
    hours,
    total,
    label: `${type === 'col' ? 'Collectif' : 'Particulier'}, ${days} jour${days > 1 ? 's' : ''} × ${hoursTxt(hours)}`,
    sub:
      `${total.toLocaleString('fr-FR')} h au total · ${p.disc === 'snow' ? 'snowboard' : 'ski'}` +
      (type === 'col' ? ' · tarif dégressif au nombre de jours' : ' · un moniteur pour la personne'),
    price: Math.round(price)
  }
}

export function lessonsCost(people: Person[], rate: EsfRate, index: number): number {
  return people.reduce((n, p) => n + (lessonOf(p, rate, index)?.price ?? 0), 0)
}

export function lessonsCount(people: Person[]): number {
  return people.filter((p) => p.lesson).length
}

// --- Coût du séjour ------------------------------------------------------

export interface SejourCost {
  lodging: number
  forfaits: number
  /**
   * Ce que vaut le poste « forfaits » : relevé, interpolé, ou absent faute de
   * grille. L'écran s'en sert pour marquer `≈` — jamais sur `j1`/`j6`/`enf6`.
   */
  forfaitsConfiance: ForfaitConfiance | 'inconnu'
  rental: number
  lessons: number
  adults: number
  kids: number
  route: number
  fuel: number
  tolls: number
  cars: number
  total: number
}

export interface SejourInputs {
  people: Person[]
  forfait: Partial<Forfait>
  /**
   * Jours de ski facturés — voir `domain/forfait.ts` pour la conversion depuis
   * les nuits. Le coût multipliait `j6` par le nombre de skieurs quelle que
   * soit la durée : un week-end de deux jours était facturé six.
   */
  jours: number
  trip: TripCost
  optRental: boolean
  optLessons: boolean
  esf: EsfRate
  lessonIdx: number
}

export function sejourCost(lodging: Pick<Lodging, 'total'>, inputs: SejourInputs): SejourCost {
  const { people, forfait, trip } = inputs
  const kids = kidsCount(people)
  const adults = Math.max(0, adultsCount(people))
  const passes = forfaitPourDuree(forfait, inputs.jours, { adultes: adults, enfants: kids })
  // Grille absente : le poste reste à zéro, comme avant ce changement. La
  // confiance dit `inconnu` pour que l'écran l'annonce au lieu de faire passer
  // un séjour sans forfaits pour un séjour bon marché.
  const forfaits = passes?.total ?? 0
  const rental = inputs.optRental ? adults * RENTAL_ADULT + kids * RENTAL_KID : 0
  const lessons = inputs.optLessons ? lessonsCost(people, inputs.esf, inputs.lessonIdx) : 0

  return {
    lodging: lodging.total,
    forfaits,
    forfaitsConfiance: passes?.confiance ?? 'inconnu',
    rental,
    lessons,
    adults,
    kids,
    route: trip.total,
    fuel: trip.fuel,
    tolls: trip.tolls,
    cars: trip.cars,
    total: lodging.total + forfaits + rental + lessons + trip.total
  }
}

// --- Partage entre foyers ------------------------------------------------

export interface SplitRow {
  home: string
  people: Person[]
  lodging: number
  forfaits: number
  rental: number
  lessons: number
  route: number
  fuel: number
  tolls: number
  dur: number | null
  dist: number | null
  total: number
}

export interface Split {
  rows: SplitRow[]
  grand: number
  /** Ce que donnerait un partage strictement égal entre foyers. */
  even: number
  perHead: number
  heads: number
}

/**
 * Qui paie quoi.
 *
 * Le logement se partage au nombre de personnes, forfaits, matériel et cours
 * suivent chaque voyageur, et la route reste à la charge du foyer qui la fait.
 * L'écart avec un partage strictement égal est affiché : c'est la question que
 * le groupe se pose vraiment.
 */
export function splitRows(
  domain: Domain,
  lodgingTotal: number,
  inputs: SejourInputs,
  origins: Origin[],
  routes: RouteTable,
  avoidTolls: boolean
): Split {
  const { people, forfait } = inputs
  const homes = [...new Set(people.map((p) => p.home))]
  const heads = people.length || 1
  // Mêmes prix unitaires que `sejourCost`, arrondis une seule fois : la somme
  // des foyers tombe alors exactement sur le total du séjour.
  const unit = forfaitUnitaires(forfait, inputs.jours)

  const rows: SplitRow[] = homes.map((hi) => {
    const mates = people.filter((p) => p.home === hi)
    const lodging = Math.round((lodgingTotal * mates.length) / heads)
    const forfaits = mates.reduce((n, p) => n + (isKid(p) ? (unit?.enfant ?? 0) : (unit?.adulte ?? 0)), 0)
    const rental = inputs.optRental
      ? mates.reduce((n, p) => n + (isKid(p) ? RENTAL_KID : RENTAL_ADULT), 0)
      : 0
    const lessons = inputs.optLessons
      ? mates.reduce((n, p) => n + (lessonOf(p, inputs.esf, inputs.lessonIdx)?.price ?? 0), 0)
      : 0
    const o = origins[hi]
    const t = o ? travelOf(domain, o, routes) : { dur: null, dist: null }
    const fuel = t.dist == null ? 0 : Math.round(t.dist * 2 * FUEL_PER_KM)
    const tolls = t.dist == null || avoidTolls ? 0 : Math.round(t.dist * TOLL_PER_KM) * 2

    return {
      home: o ? o.short : `Départ ${hi + 1}`,
      people: mates,
      lodging,
      forfaits,
      rental,
      lessons,
      route: fuel + tolls,
      fuel,
      tolls,
      dur: t.dur,
      dist: t.dist,
      total: lodging + forfaits + rental + lessons + fuel + tolls
    }
  })

  const grand = rows.reduce((n, r) => n + r.total, 0)
  return {
    rows,
    grand,
    even: Math.round(grand / (rows.length || 1)),
    perHead: Math.round(grand / heads),
    heads
  }
}
