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
import type { ForfaitPourDuree } from './forfait'
import type { Lodging } from '@/data/lodgings'
import type { Origin, RouteTable } from './travel'
import { travelOf } from './travel'

/**
 * Barème par défaut du carburant, en euros par kilomètre.
 *
 * Une moyenne nationale, pas une mesure : elle vaut ce que vaut une
 * consommation moyenne multipliée par un prix moyen. `RouteBudget` permet de la
 * remplacer par le prix du litre et la consommation réels du véhicule, ou par
 * un montant relevé sur ViaMichelin.
 */
const FUEL_PER_KM = 0.115
/** Péages moyens autoroute, en euros par kilomètre. Même statut d'estimation. */
const TOLL_PER_KM = 0.058

/**
 * Ce que l'utilisateur a saisi ou relevé pour la route.
 *
 * Trois régimes, du plus fiable au moins fiable, et `tripCost` les applique
 * dans cet ordre :
 *
 *  1. `flatTotal` — un montant forfaitaire pour l'aller-retour d'un foyer,
 *     saisi parce que l'utilisateur le connaît mieux que n'importe quel calcul.
 *  2. `fuelPricePerL` + `consoL100` — sa vraie consommation et le prix qu'il
 *     paie à la pompe, appliqués à la distance.
 *  3. rien — les deux barèmes ci-dessus, et l'écran l'annonce comme estimé.
 *
 * `tollsRoundTrip` se superpose aux trois : un péage relevé sur ViaMichelin ou
 * saisi remplace le barème kilométrique, sans toucher au carburant.
 */
export interface RouteBudget {
  /** Prix du litre saisi, en euros. */
  fuelPricePerL?: number
  /** Consommation saisie, en litres aux 100 km. */
  consoL100?: number
  /** Péages aller-retour, saisis ou relevés, en euros par foyer. */
  tollsRoundTrip?: number
  /** Montant forfaitaire aller-retour par foyer : court-circuite tout le reste. */
  flatTotal?: number
}

/** D'où vient chaque poste de route affiché. */
export interface RouteOrigin {
  fuel: 'saisi' | 'estimé'
  tolls: 'saisi' | 'estimé'
}

/**
 * Un forfait de route est-il en vigueur ?
 *
 * **Un seul prédicat**, partagé avec `legRoundTrip`. Ils divergeaient sur zéro :
 * `routeOriginOf` acceptait `flatTotal: 0` et `legRoundTrip` l'ignorait, si bien
 * qu'un forfait saisi à zéro — le cas de quelqu'un qui covoiture ou se fait
 * déposer — faisait afficher « valeurs saisies » en vert sur un montant que les
 * barèmes moyens venaient de produire. Deux copies d'une même règle finissent
 * toujours par se contredire ; celle-ci n'existe plus qu'une fois.
 */
export function forfaitRouteActif(budget: RouteBudget | undefined): boolean {
  return budget?.flatTotal != null && budget.flatTotal > 0
}

export function routeOriginOf(budget: RouteBudget | undefined, avoidTolls: boolean): RouteOrigin {
  const forfait = forfaitRouteActif(budget)
  const saisiCarburant =
    forfait ||
    (budget?.fuelPricePerL != null && budget.fuelPricePerL > 0 && budget.consoL100 != null && budget.consoL100 > 0)
  const saisiPeages =
    forfait || avoidTolls || (budget?.tollsRoundTrip != null && budget.tollsRoundTrip >= 0)
  return {
    fuel: saisiCarburant ? 'saisi' : 'estimé',
    // « Éviter les péages » met le poste à zéro par décision de l'utilisateur :
    // ce n'est pas une estimation, c'est un choix, et zéro est alors exact.
    tolls: saisiPeages ? 'saisi' : 'estimé'
  }
}
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
  /**
   * Le montant vient-il d'un forfait saisi, sans décomposition ?
   *
   * Sans ce drapeau, un forfait de 180 € se retrouvait entier dans `fuel` et
   * l'écran l'annonçait « carburant 180 € · péages 0 € ». L'utilisateur n'a
   * jamais dit ça : il a dit « la route me coûte 180 € ». Les écrans lisent ce
   * drapeau pour afficher une ligne unique au lieu d'une répartition inventée.
   */
  flat: boolean
}

/**
 * Coût aller-retour d'**un** foyer, pour une distance connue.
 *
 * Définition unique, parce qu'elle avait deux lecteurs — le total du séjour et
 * la répartition entre foyers — qui la réimplémentaient chacun. Ils ne
 * divergeaient pas tant que les deux constantes étaient les seules règles ;
 * avec un prix du litre, une consommation, un péage relevé et un forfait, ils
 * auraient divergé au premier champ rempli.
 */
export function legRoundTrip(
  distKm: number,
  avoidTolls: boolean,
  budget?: RouteBudget
): { fuel: number; tolls: number } {
  // Forfait saisi : il remplace tout le calcul pour ce foyer. L'utilisateur qui
  // connaît son coût de trajet le connaît mieux qu'un barème moyen.
  if (forfaitRouteActif(budget)) {
    return { fuel: Math.round(budget?.flatTotal ?? 0), tolls: 0 }
  }

  const perL = budget?.fuelPricePerL
  const conso = budget?.consoL100
  const saisiCarburant = perL != null && perL > 0 && conso != null && conso > 0
  // L'aller-retour fait deux fois la distance, et la conso s'exprime aux 100 km.
  const fuel = saisiCarburant
    ? Math.round(((distKm * 2) / 100) * conso * perL)
    : Math.round(distKm * 2 * FUEL_PER_KM)

  if (avoidTolls) return { fuel, tolls: 0 }
  const tolls =
    budget?.tollsRoundTrip != null && budget.tollsRoundTrip >= 0
      ? Math.round(budget.tollsRoundTrip)
      : Math.round(distKm * TOLL_PER_KM) * 2
  return { fuel, tolls }
}

export function tripCost(
  domain: Domain,
  origins: Origin[],
  routes: RouteTable,
  avoidTolls: boolean,
  budget?: RouteBudget
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
    const leg = legRoundTrip(t.dist, avoidTolls, budget)
    fuel += leg.fuel
    tolls += leg.tolls
  }
  const flat = forfaitRouteActif(budget)
  return { fuel, tolls, total: fuel + tolls, cars, flat }
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
  /** Tarif horaire collectif enfant. */
  kid: number
  /** Tarif horaire collectif adulte. */
  adult: number
  /**
   * Tarif horaire du cours **particulier**, quand il a été relevé.
   *
   * `null` = personne ne l'a saisi, et `lessonOf` retombe sur le barème par
   * tranche d'heures indexé sur la station. Les deux ne se confondent pas :
   * `privSource` dit lequel des deux a servi.
   */
  priv: number | null
  /** École qui pratique ces tarifs, telle que l'utilisateur l'a nommée. */
  ecole: string | null
  /** Date du relevé de ces tarifs, AAAA-MM-JJ. `null` sur une estimation. */
  releveLe: string | null
  /** Origine du tarif **collectif**. */
  source: 'saisi' | 'estimé'
  /** Origine du tarif **particulier**, qui peut différer du collectif. */
  privSource: 'saisi' | 'estimé'
}

/**
 * Tarifs de cours relevés par l'utilisateur, par domaine.
 *
 * Les champs sont tous facultatifs et s'ajoutent sans casser ce qui est déjà
 * enregistré : une entrée écrite avant l'ajout de `priv` porte encore `kid` et
 * `adult` seuls, et se relit sans conversion.
 */
export type EsfRates = Record<
  number,
  { kid?: number; adult?: number; priv?: number; ecole?: string; releveLe?: string }
>

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
  const k = lessonIndex(forfait)
  const commun = {
    priv: saved?.priv && saved.priv > 0 ? saved.priv : null,
    ecole: saved?.ecole?.trim() || null,
    releveLe: saved?.releveLe ?? null,
    privSource: (saved?.priv && saved.priv > 0 ? 'saisi' : 'estimé') as 'saisi' | 'estimé'
  }
  if (saved?.kid) {
    return {
      kid: saved.kid,
      adult: saved.adult ?? Math.round(saved.kid * 1.13 * 10) / 10,
      source: 'saisi',
      ...commun
    }
  }
  return {
    kid: Math.round(ESF_BASE.kid * k * 10) / 10,
    adult: Math.round(ESF_BASE.adult * k * 10) / 10,
    source: 'estimé',
    ...commun
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
    // Tarif particulier saisi : il vaut tel quel, sans indexation. Indexer un
    // tarif que l'utilisateur a lu sur le site de l'école reviendrait à
    // corriger une mesure par une estimation.
    const base = rate.priv ?? (total <= 2 ? 66 : total <= 6 ? 62 : 58)
    price = rate.priv != null ? base * total : base * total * index
  }

  return {
    type,
    days,
    hours,
    total,
    label: `${type === 'col' ? 'Collectif' : 'Particulier'}, ${days} jour${days > 1 ? 's' : ''} × ${hoursTxt(hours)}`,
    sub:
      `${total.toLocaleString('fr-FR')} h au total · ${p.disc === 'snow' ? 'snowboard' : 'ski'}` +
      (type === 'col' ? ' · tarif dégressif au nombre de jours' : ' · un moniteur pour la personne') +
      (rate.ecole ? ` · ${rate.ecole}` : ''),
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
   * Tarif du forfait **pour la durée du séjour**, avec son origine.
   *
   * Le calcul facturait `forfait.j6` quelles que soient les dates : deux nuits
   * étaient chiffrées au forfait 6 jours. `forfait` reste là pour ce qui a
   * encore besoin de la grille brute (l'indice de cherté des cours, calé sur le
   * tarif 6 jours par construction) ; le coût du séjour, lui, lit celui-ci.
   *
   * `null` quand aucun tarif n'est connu : le poste vaut alors zéro et l'écran
   * affiche « non renseigné » plutôt qu'un forfait gratuit.
   */
  pass: ForfaitPourDuree | null
  trip: TripCost
  optRental: boolean
  optLessons: boolean
  esf: EsfRate
  lessonIdx: number
}

export function sejourCost(lodging: Pick<Lodging, 'total'>, inputs: SejourInputs): SejourCost {
  const { people, pass, trip } = inputs
  const kids = kidsCount(people)
  const adults = Math.max(0, adultsCount(people))
  const forfaits = pass ? pass.adulte * adults + pass.enfant * kids : 0
  const rental = inputs.optRental ? adults * RENTAL_ADULT + kids * RENTAL_KID : 0
  const lessons = inputs.optLessons ? lessonsCost(people, inputs.esf, inputs.lessonIdx) : 0

  return {
    lodging: lodging.total,
    forfaits,
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
  avoidTolls: boolean,
  budget?: RouteBudget
): Split {
  const { people, pass } = inputs
  const homes = [...new Set(people.map((p) => p.home))]
  const heads = people.length || 1

  const rows: SplitRow[] = homes.map((hi) => {
    const mates = people.filter((p) => p.home === hi)
    const lodging = Math.round((lodgingTotal * mates.length) / heads)
    const forfaits = mates.reduce(
      (n, p) => n + (pass ? (isKid(p) ? pass.enfant : pass.adulte) : 0),
      0
    )
    const rental = inputs.optRental
      ? mates.reduce((n, p) => n + (isKid(p) ? RENTAL_KID : RENTAL_ADULT), 0)
      : 0
    const lessons = inputs.optLessons
      ? mates.reduce((n, p) => n + (lessonOf(p, inputs.esf, inputs.lessonIdx)?.price ?? 0), 0)
      : 0
    const o = origins[hi]
    const t = o ? travelOf(domain, o, routes) : { dur: null, dist: null }
    // Même fonction que le total du séjour : la répartition entre foyers doit
    // sommer exactement au montant affiché en haut de l'écran Décision.
    const leg = t.dist == null ? { fuel: 0, tolls: 0 } : legRoundTrip(t.dist, avoidTolls, budget)
    const fuel = leg.fuel
    const tolls = leg.tolls

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
