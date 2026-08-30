/**
 * Sélecteurs dérivés de l'état.
 *
 * Tout ce que plusieurs écrans recalculent — le groupe actif, la semaine
 * choisie, le score d'un domaine, le coût complet d'une offre — est dérivé ici
 * une fois, et partagé par contexte. La dérivation est faite **au-dessus** de
 * l'arbre plutôt que dans chaque composant : une quarantaine de vignettes de
 * domaines appellent `useDerived`, et calculer la grille des combinaisons
 * quarante fois à chaque mouvement de curseur rendrait les filtres poussifs.
 *
 * Le référentiel complet compte 277 domaines et chacun porte une quinzaine
 * d'offres : les résultats coûteux par domaine (trajet, score, forfait) sont
 * mémoïsés dans la passe de dérivation, sinon les écrans Offres et
 * Combinaisons recalculeraient le même trajet quinze fois de suite.
 */

import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Lodging } from '@/data/lodgings'
import { belongsToDomain, mergeDupes as mergeDupesList } from '@/data/lodgings'
import { FM_BY_ID } from '@/data/catalogue'
import type { AvailabilityVerdict } from '@/data/lodgingAvailability'
import { availabilityOf, isBookable } from '@/data/lodgingAvailability'
import { domainZone, filterToZone } from '@shared/geo'
import { inRange, inRangeOrNull, rangeOpen } from '@/data/range'
import { fitsParty, hasConfirmedPrice, matchesLodgingFilters } from '@/data/lodgingFilter'
import type { LodgingFilterCriteria } from '@/data/lodgingFilter'
import { stationOwning } from '@/data/stationList'
import type { Domain, Forfait } from '@/data/referentiel'
import { estimateForfait, forfaitIndexByArea, forfaitIndexBySlug, hasCoords } from '@/data/referentiel'
import { placeIndex, squash } from '@/data/places'
import { skiAreaIndex } from '@/data/skiAreas'
import type { Week } from '@/data/snow'
import { WEEKS, weekByArrival, weekFactorFor } from '@/data/snow'
import type { SejourCost, SejourInputs, Split, TripCost } from '@/domain/costs'
import { activeOrigins, adultsCount, esfRate, kidsCount, lessonIndex, sejourCost, splitRows, tripCost } from '@/domain/costs'
import { dur as durFmt, nightsBetween, slug } from '@/domain/format'
import type { ForfaitPourDuree } from '@/domain/forfait'
import { forfaitPourDuree, joursDeSki } from '@/domain/forfait'
import type { Origin, Travel } from '@/domain/travel'
import { originsOf, travelOf, worstDistance, worstTravel } from '@/domain/travel'
import type { Score } from '@/domain/scoring'
import { scoreOf } from '@/domain/scoring'
import { FILTER_RANGES, offresBudgetOpen, useApp } from './appState'

// Les plages à deux bornes vivent dans `data/range.ts` : `lodgingFilter.ts` en
// a besoin, et les importer d'ici aurait fermé un cycle.
export { rangeOpen, inRange, inRangeOrNull } from '@/data/range'

/** Tarif de forfait, avec l'information de savoir s'il a été relevé. */
export type ResolvedForfait = Partial<Forfait> & { estimated: boolean }

export interface ComboCell {
  week: Week
  total: number
  lodging: number
  /**
   * Le montant du logement est-il **projeté** sur une autre semaine ?
   *
   * `false` uniquement pour la semaine du séjour en cours : c'est la seule
   * pour laquelle le prix a été relevé. Les autres cellules reprojettent ce
   * prix par l'écart de saisonnalité national — un ordre de grandeur, pas un
   * tarif. La grille n'a d'intérêt que si elle montre les douze semaines, mais
   * onze d'entre elles sont des estimations et l'écran doit le dire.
   */
  projected: boolean
}

export interface ComboRow {
  d: Domain
  best: { l: Lodging; c: SejourCost }
  cells: ComboCell[]
  min: number
}

export interface ComboGrid {
  rows: ComboRow[]
  lo: number
  hi: number
}

export interface BestOffer {
  d: Domain
  l: Lodging
  c: SejourCost
  /** Nombre d'offres écartées, plus chères, sur le même domaine. */
  alt: number
}

export interface DecisionContext {
  d: Domain
  w: Week
  lg: Lodging
  nights: number
  cost: SejourCost
}

/**
 * Annonce écartée par une **règle de l'écran**, avec le motif qui l'a écartée.
 *
 * L'écran Logements applique deux règles avant tout filtre choisi : une annonce
 * listée doit être réservable et porter un prix vérifié pour ces dates. Jusqu'ici
 * les annonces qui n'y répondaient pas disparaissaient sans un mot, et l'écart
 * entre « la source a renvoyé douze offres » et « j'en vois quatre » était
 * inexplicable depuis l'interface.
 *
 * Le verdict n'est pas recalculé ici : c'est celui d'`availabilityOf`, celui-là
 * même qui a servi à écarter l'annonce.
 */
export interface RejectedLodging {
  lodging: Lodging
  verdict: AvailabilityVerdict
}

export interface Derived {
  origins: Origin[]
  /** Foyers qui partent réellement : ceux auxquels un voyageur est rattaché. */
  hh: Origin[]
  /** `true` dès qu'un foyer a une adresse géocodée. */
  hasOrigin: boolean
  nights: number
  week: Week | undefined
  /** Écart de prix national de la semaine choisie. */
  weekFactor: number
  adults: number
  kids: number
  forfaitOf: (d: Domain) => ResolvedForfait
  /**
   * Tarif du forfait pour la durée du séjour en cours, avec son origine.
   *
   * `null` quand rien n'est connu. Les écrans qui affichent un montant de
   * forfait lisent celui-ci, pas `forfaitOf(d).j6` : la grille brute ne connaît
   * que 1 et 6 jours et ne dit rien des dates saisies.
   */
  passOf: (d: Domain) => ForfaitPourDuree | null
  travelOf: (d: Domain, o: Origin) => Travel
  worstTravel: (d: Domain) => number | null
  worstDistance: (d: Domain) => number | null
  travelText: (d: Domain) => string
  scoreOf: (d: Domain) => Score
  /** Distance à vol d'oiseau depuis la commune cherchée, en km. */
  geoDistance: (d: Domain) => number | null
  matchesFilters: (d: Domain) => boolean
  filtered: Domain[]
  /** Domaines écartés par le seul cadrage de la carte. */
  domOutOfView: number
  lodgingsFor: (d: Domain, pers?: number) => Lodging[]
  sejourInputs: (d: Domain) => SejourInputs
  sejourCost: (lodging: Pick<Lodging, 'total'>, d: Domain) => SejourCost
  esfOf: (d: Domain) => ReturnType<typeof esfRate>
  lessonIndexOf: (d: Domain) => number
  bestOffers: BestOffer[]
  comboGrid: ComboGrid
  decisionCtx: DecisionContext | null
  split: Split | null
  /** Domaine dont on consulte les logements, avec repli sur le premier. */
  lodgDomain: Domain | null
  lodgAll: Lodging[]
  lodgList: Lodging[]
  /** Annonces du domaine écartées par les filtres. Sert à le dire à l'écran
   *  plutôt que d'afficher une liste vide sans raison. */
  lodgHidden: number
  /** Annonces sans disponibilité confirmée pour le séjour en cours. */
  lodgUnavailable: number
  /** Annonces dont le rattachement à ce domaine vient d'une ancienne numérotation. */
  lodgRattachementIncertain: number
  /** Annonces écartées parce que leur position est hors de la zone du domaine. */
  lodgHorsZone: number
  /** Lignes écartées faute d'avoir jamais porté un prix : ce ne sont pas des offres. */
  lodgSansPrix: number
  /** Annonces écartées par les règles de l'écran, avec leur motif. */
  lodgRejected: RejectedLodging[]
  dupMerged: number
  voteScore: (key: string) => number
  voteOf: (key: string, index: number) => number
  comboKey: (domainId: number, weekArr: string) => string
}

/** Au-delà, les écrans Offres et Combinaisons deviennent illisibles et le
 *  calcul complet de chaque domaine ne se justifie plus. */
const MAX_COMPARED_DOMAINS = 60

const DerivedContext = createContext<Derived | null>(null)

export function useDerived(): Derived {
  const ctx = useContext(DerivedContext)
  if (!ctx) throw new Error('useDerived doit être utilisé dans DerivedProvider')
  return ctx
}

export function DerivedProvider({ children }: { children: ReactNode }): JSX.Element {
  const { state, ref, domains, screen } = useApp()

  const value = useMemo<Derived>(() => {
    const origins = originsOf(state.places)
    const hh = activeOrigins(state.people, origins)
    const hasOrigin = hh.some((o) => o.lat != null && o.lon != null)
    const nights = nightsBetween(state.arrDate, state.depDate)
    const week = weekByArrival(state.arrDate)
    const weekFactor = week ? week.f : 0
    const adults = state.people.length ? adultsCount(state.people) : Math.max(1, state.travelers - state.children)
    const kids = state.people.length ? kidsCount(state.people) : state.children

    const forfaitIndex = forfaitIndexBySlug(ref, slug)
    const areaForfaitIndex = forfaitIndexByArea(ref, squash)
    const places = placeIndex(domains)
    const areas = skiAreaIndex(domains)

    // --- Caches par domaine, valables le temps de cette dérivation ---------
    const forfaitCache = new Map<number, ResolvedForfait>()
    const travelCache = new Map<number, number | null>()
    const distCache = new Map<number, number | null>()
    const scoreCache = new Map<number, Score>()
    const tripCache = new Map<number, TripCost>()

    /**
     * Tarif de forfait d'une station.
     *
     * Trois lectures avant l'estimation, de la plus précise à la plus large :
     * l'entrée du référentiel qui porte exactement ce nom, la station reconnue
     * par la clé de recherche, puis **le domaine relié** — le forfait s'achète
     * pour un domaine, et les stations d'un même domaine paient le même prix.
     * Sans cette troisième lecture, Orelle et Belle Plagne afficheraient un
     * tarif estimé à côté de Val Thorens et de La Plagne, qui affichent le
     * tarif relevé du même forfait.
     */
    const forfaitOf = (d: Domain): ResolvedForfait => {
      const hit = forfaitCache.get(d.id)
      if (hit) return hit
      const value =
        forfaitIndex.get(d.slug) ??
        areaForfaitIndex.get(squash(d.name)) ??
        (d.pass ? areaForfaitIndex.get(squash(d.pass)) : undefined) ??
        estimateForfait(d.km, d.max)
      forfaitCache.set(d.id, value)
      return value
    }

    const travel = (d: Domain, o: Origin): Travel => travelOf(d, o, state.routes)

    const worst = (d: Domain): number | null => {
      if (travelCache.has(d.id)) return travelCache.get(d.id) ?? null
      const value = worstTravel(d, hh, state.routes)
      travelCache.set(d.id, value)
      return value
    }

    const worstDist = (d: Domain): number | null => {
      if (distCache.has(d.id)) return distCache.get(d.id) ?? null
      const value = worstDistance(d, hh, state.routes)
      distCache.set(d.id, value)
      return value
    }

    const travelText = (d: Domain): string => {
      const parts = hh
        .map((o) => {
          const t = travel(d, o)
          // La langue vient de l'état plutôt que d'un crochet : cette
          // dérivation est une closure de `useMemo`, pas un composant.
          return t.dur == null ? null : `${o.short} ${durFmt(t.dur, state.lang)}`
        })
        .filter((s): s is string => s !== null)
      return parts.length ? parts.join(' · ') : 'aucune adresse de départ'
    }

    const score = (d: Domain): Score => {
      const hit = scoreCache.get(d.id)
      if (hit) return hit
      const f = forfaitOf(d)
      const value = scoreOf(d, {
        travelMin: worst(d),
        forfait: f,
        forfaitEstimated: f.estimated,
        weights: state.weights
      })
      scoreCache.set(d.id, value)
      return value
    }

    /**
     * Distance à vol d'oiseau depuis la commune cherchée.
     *
     * Haversine plutôt qu'un itinéraire : le classement doit être instantané à
     * chaque frappe, et sur ce trajet-là l'ordre à vol d'oiseau et l'ordre
     * routier ne diffèrent qu'à la marge. Le temps de trajet réel reste
     * disponible, calculé une fois, dans la colonne « Trajet ».
     */
    const geoDistance = (d: Domain): number | null => {
      const g = state.geo
      if (!g || d.lat == null || d.lon == null) return null
      const toRad = (deg: number): number => (deg * Math.PI) / 180
      const dLat = toRad(d.lat - g.lat)
      const dLon = toRad(d.lon - g.lon)
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(g.lat)) * Math.cos(toRad(d.lat)) * Math.sin(dLon / 2) ** 2
      return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
    }

    const matchesFilters = (d: Domain): boolean => {
      // Recherche texte : le nom du domaine, mais aussi ses villages, sa
      // station, son forfait relié, sa région et son massif. Un séjour se
      // cherche par le lieu où l'on dort — « montchavin », « val claret » —
      // pas par le libellé du domaine relié. Voir `data/places.ts`.
      if (state.domainQuery.trim() && !places.matches(d, state.domainQuery)) return false
      const R = FILTER_RANGES
      if (!inRange(d.min, state.baseMin, state.baseMax, R.base.max)) return false
      if (!inRange(d.max, state.summitMin, state.summitMax, R.summit.max)) return false
      if (!inRange(d.km, state.kmMin, state.kmMax, R.km.max)) return false
      if (state.massifs.length > 0 && !state.massifs.includes(d.massif)) return false
      if (state.glacier && !d.glacier) return false
      // « Domaine relié » veut dire : d'autres stations partagent ce domaine.
      // Depuis que la liste vient du catalogue, chaque station porte le libellé
      // de son domaine — même seule dessus —, et tester `pass` ne filtrait plus
      // rien. C'est le regroupement qui répond, pas l'étiquette.
      if (state.linked && areas.byStation.get(d.id)?.single !== false) return false
      if (!inRangeOrNull(worst(d), state.travelMin, state.travelMax, R.travel.max)) return false
      if (!inRangeOrNull(worstDist(d), state.distMin, state.distMax, R.dist.max)) return false
      // Un tarif estimé ne peut pas justifier d'écarter un domaine ni de le
      // retenir : il est traité comme une valeur absente dès que la plage de
      // forfait est posée.
      if (!rangeOpen(state.forfaitMin, state.forfaitMax, R.forfait.max)) {
        const f = forfaitOf(d)
        if (f.estimated) return false
        if (!inRangeOrNull(f.j6 ?? null, state.forfaitMin, state.forfaitMax, R.forfait.max)) return false
      }
      return true
    }

    /** Les valeurs absentes passent en fin de tri, jamais en tête. */
    const nullsLast = (a: number | null, b: number | null): number => {
      if (a == null && b == null) return 0
      if (a == null) return 1
      if (b == null) return -1
      return a - b
    }

    const comparators: Record<string, (a: Domain, b: Domain) => number> = {
      relevance: (a, b) => score(b).total - score(a).total,
      forfait_asc: (a, b) => (forfaitOf(a).j6 ?? 1e9) - (forfaitOf(b).j6 ?? 1e9),
      altitude_min_desc: (a, b) => b.min - a.min,
      altitude_max_desc: (a, b) => b.max - a.max,
      altitude_max_asc: (a, b) => a.max - b.max,
      slopes_km_desc: (a, b) => b.km - a.km,
      slopes_km_asc: (a, b) => a.km - b.km,
      travel_time_asc: (a, b) => nullsLast(worst(a), worst(b)),
      name_asc: (a, b) => a.name.localeCompare(b.name, 'fr'),
      name_desc: (a, b) => b.name.localeCompare(a.name, 'fr'),
      // Tri par région (puis nom, pour que chaque région soit ordonnée A→Z en
      // interne plutôt que dans un ordre arbitraire).
      region_asc: (a, b) =>
        (a.region || '').localeCompare(b.region || '', 'fr') || a.name.localeCompare(b.name, 'fr')
    }

    // Une commune cherchée prend le pas sur le tri choisi : c'est ce que
    // l'utilisateur vient de demander, et l'écran le dit en toutes lettres avec
    // un bouton pour retirer le classement.
    const order = state.geo
      ? (a: Domain, b: Domain): number => nullsLast(geoDistance(a), geoDistance(b))
      : (comparators[state.sort] ?? comparators.relevance)

    /**
     * Le cadrage ne filtre que si la carte est **visible** et le suivi actif.
     *
     * Restreindre la liste au rectangle d'une carte qu'on ne voit pas — écran
     * Recherche fermé, ou onglet différent — escamoterait des domaines sans
     * qu'aucune cause ne soit visible à l'écran.
     */
    const boundsActive =
      state.domBounds != null && state.searchMapOpen && state.domMapSync && screen === 'recherche'

    const inBounds = (d: Domain): boolean => {
      const b = state.domBounds
      if (!b) return true
      return hasCoords(d) && d.lon >= b.w && d.lon <= b.e && d.lat >= b.s && d.lat <= b.n
    }

    const passesFilters = domains.filter(matchesFilters)
    // Le domaine épinglé reste listé quel que soit le cadrage : sinon celui
    // qu'on vient de cliquer sur la carte disparaîtrait de la liste au moment
    // même où la carte se recentre sur lui.
    let filtered = [
      ...(boundsActive ? passesFilters.filter((d) => d.id === state.pinnedId || inBounds(d)) : passesFilters)
    ].sort(order)

    /**
     * Domaines écartés par le **seul** cadrage.
     *
     * Compté sur le prédicat et non par différence de longueur de liste : le
     * domaine épinglé, réintroduit juste au-dessus, fausserait la soustraction
     * et l'écran annoncerait un domaine caché de moins qu'il n'y en a.
     */
    const domOutOfView = boundsActive ? passesFilters.filter((d) => !inBounds(d)).length : 0

    // Un domaine cliqué sur la carte remonte en tête même s'il ne passe pas les
    // filtres : sinon le clic n'a aucun effet visible et paraît cassé.
    if (state.pinnedId != null) {
      const pinned = domains.find((d) => d.id === state.pinnedId)
      if (pinned) filtered = [pinned, ...filtered.filter((d) => d.id !== state.pinnedId)]
    }

    /** Jours de forfait du séjour en cours. Sept nuits font six jours. */
    const skiDays = joursDeSki(nights)
    const passCache = new Map<number, ForfaitPourDuree | null>()
    const passOf = (d: Domain): ForfaitPourDuree | null => {
      if (passCache.has(d.id)) return passCache.get(d.id) ?? null
      const resolved = forfaitOf(d)
      const value = forfaitPourDuree(resolved, resolved.estimated, state.forfaitsSaisis[d.id], skiDays)
      passCache.set(d.id, value)
      return value
    }

    const esfOf = (d: Domain): ReturnType<typeof esfRate> => esfRate(d.id, forfaitOf(d), state.esfRates)
    const lessonIndexOf = (d: Domain): number => lessonIndex(forfaitOf(d))

    const tripOf = (d: Domain): TripCost => {
      const hit = tripCache.get(d.id)
      if (hit) return hit
      const value = tripCost(d, hh, state.routes, state.avoidTolls, state.routeBudget)
      tripCache.set(d.id, value)
      return value
    }

    const sejourInputs = (d: Domain): SejourInputs => ({
      people: state.people,
      forfait: forfaitOf(d),
      trip: tripOf(d),
      pass: passOf(d),
      optRental: state.optRental,
      optLessons: state.optLessons,
      esf: esfOf(d),
      lessonIdx: lessonIndexOf(d)
    })

    /** Les dates du séjour en cours, seule période pour laquelle un prix relevé
     *  vaut quelque chose. */
    const stay = { checkIn: state.arrDate, checkOut: state.depDate }

    /**
     * Offres réelles d'un domaine, pour les écrans transversaux.
     *
     * Même matière que l'écran Logements — `state.imported`, c'est-à-dire ce
     * que les relevés ont rapporté et ce que l'utilisateur a saisi — et plus un
     * catalogue de biens types réindexé sur le score de pertinence. Offres,
     * Combinaisons et Décision affichaient jusqu'ici des montants calculés par
     * formule, présentés exactement comme des prix relevés.
     *
     * Mêmes règles que l'écran Logements, et pour la même raison. Le logement
     * appartient au domaine, il porte un prix, ce prix a été **vérifié pour les
     * dates du séjour en cours** (`hasConfirmedPrice`), l'annonce figurait au
     * dernier relevé à ces dates (`isBookable`), et elle accueille le groupe.
     *
     * Les deux règles de date ne sont pas du zèle : un prix relevé pour une
     * autre semaine n'est pas le prix de ce séjour, et ces écrans-ci classent
     * les stations **par leur coût**. Une annonce tarifée en mars remonterait
     * en tête d'un comparatif de février et déciderait du classement. L'écran
     * Logements écarte déjà ces annonces ; les trois écrans qui additionnent
     * par-dessus ne pouvaient pas être plus laxistes qu'eux.
     *
     * Un montant nul est une carte-redirection ou une annonce vue sans tarif :
     * l'écran Logements sait l'afficher comme telle, un comparateur de coûts la
     * classerait première.
     *
     * `fitsParty` remplace l'ancien `l.ch >= state.rooms` : les centrales
     * françaises comptent en pièces et laissent `ch` à zéro, si bien que le
     * critère d'origine écartait la totalité de leurs annonces dès qu'une
     * chambre était demandée. La règle est celle de `data/lodgingFilter.ts`,
     * couverte par `npm run lodgfilter:test`.
     *
     * Les deux tests coûteux — disponibilité et prix daté — sont passés **une
     * fois** sur toute la mémoire (`priced`), pas une fois par domaine :
     * l'écran Offres compare soixante domaines et l'ancien catalogue n'avait
     * que trente-quatre lignes à parcourir, là où un relevé de l'Alpe d'Huez en
     * rapporte neuf cents. Soixante × deux passes sur neuf cents annonces à
     * chaque mouvement de curseur de filtre, c'est l'utilisateur qui les paie.
     */
    const priced = state.imported.filter(
      (l) => l.total > 0 && isBookable(l, stay) && hasConfirmedPrice(l, stay)
    )

    const lodgings = (d: Domain, pers = state.travelers): Lodging[] => {
      const party = { travelers: pers, rooms: state.rooms }
      return priced.filter((l) => belongsToDomain(l, d) && fitsParty(l, party))
    }

    const cost = (lodging: Pick<Lodging, 'total'>, d: Domain): SejourCost => sejourCost(lodging, sejourInputs(d))

    // Les écrans transversaux ne travaillent que sur la tête de liste : calculer
    // les offres des 277 domaines à chaque frappe serait payé par l'utilisateur.
    const compared = filtered.slice(0, MAX_COMPARED_DOMAINS)

    // --- Meilleure offre par domaine ------------------------------------
    const bestOffers: BestOffer[] = []
    for (const d of compared) {
      const list = lodgings(d)
      if (list.length === 0) continue
      const scored = list.map((l) => ({ l, c: cost(l, d) })).sort((a, b) => a.c.total - b.c.total)
      const best = scored[0]
      if (!offresBudgetOpen(state.offresBudget) && best.c.total > state.offresBudget) continue
      bestOffers.push({ d, l: best.l, c: best.c, alt: scored.length - 1 })
    }
    const offerSort: Record<string, (a: BestOffer, b: BestOffer) => number> = {
      total: (a, b) => a.c.total - b.c.total,
      score: (a, b) => score(b.d).total - score(a.d).total,
      travel: (a, b) => nullsLast(worst(a.d), worst(b.d))
    }
    bestOffers.sort(offerSort[state.offresSort] ?? offerSort.total)

    // --- Grille semaine × domaine ---------------------------------------
    const comboRows: ComboRow[] = []
    for (const d of compared) {
      const list = lodgings(d)
      if (list.length === 0) continue
      const best = list.map((l) => ({ l, c: cost(l, d) })).sort((a, b) => a.c.total - b.c.total)[0]
      const cur = weekFactorFor(d, week)
      const cells = WEEKS.map((w) => {
        // On reprojette le prix du logement de la semaine courante vers la
        // semaine visée ; forfaits et route ne bougent pas d'une semaine à
        // l'autre. La cellule de la semaine en cours est la seule à porter le
        // prix tel qu'il a été relevé, et elle est la seule à ne pas être
        // marquée : `projected` suit le montant jusqu'à l'écran.
        const projected = w.arr !== week?.arr
        const lodging = projected
          ? Math.round((best.c.lodging * (1 + weekFactorFor(d, w))) / (1 + cur))
          : best.c.lodging
        return { week: w, total: best.c.total - best.c.lodging + lodging, lodging, projected }
      })
      comboRows.push({ d, best, cells, min: Math.min(...cells.map((c) => c.total)) })
    }
    comboRows.sort((a, b) => a.min - b.min)
    const allTotals = comboRows.flatMap((r) => r.cells.map((c) => c.total))
    const comboGrid: ComboGrid = {
      rows: comboRows,
      lo: allTotals.length ? Math.min(...allTotals) : 0,
      hi: allTotals.length ? Math.max(...allTotals) : 0
    }

    // --- Décision retenue -------------------------------------------------
    let decisionCtx: DecisionContext | null = null
    if (state.decision) {
      const d = domains.find((x) => x.id === state.decision?.domainId)
      const w = WEEKS.find((x) => x.arr === state.decision?.week)
      if (d && w) {
        const decNights = Math.max(1, Math.round((new Date(w.dep).getTime() - new Date(w.arr).getTime()) / 86400000))
        /*
         * Le logement retenu se retrouve **par son identifiant**, dans toute la
         * mémoire, avant de retomber sur la liste filtrée par dates.
         *
         * Sans cela, retenir une combinaison sur une autre semaine que celle du
         * séjour en cours menait à un écran vide : « Retenir » repositionne
         * `arrDate`/`depDate` sur la semaine choisie, ce qui périme d'un coup
         * tous les prix relevés — ils portent les dates de leur relevé — donc
         * `lodgings()` rendait une liste vide et `decisionCtx` tombait à `null`.
         * Onze des douze colonnes de la grille étaient des culs-de-sac.
         *
         * Le prix affiché reste celui du relevé, à ses propres dates, et l'écran
         * le dit (`decision_price_other_dates`). C'est le seul comportement
         * honnête : seule la centrale connaît son tarif pour d'autres dates.
         */
        const list = lodgings(d, state.travelers)
        const retenu =
          state.decision?.lodgingId != null
            ? state.imported.find((l) => l.id === state.decision?.lodgingId)
            : undefined
        const lg = retenu ?? list.find((l) => l.id === state.decision?.lodgingId) ?? [...list].sort((a, b) => a.total - b.total)[0]
        if (lg) {
          // Le prix retenu est celui du relevé, sans reprojection. La décision
          // porte sur un logement précis à des dates précises : lui appliquer
          // l'écart de saisonnalité produisait un montant que personne n'avait
          // jamais vu chez la centrale, et c'est le montant que l'écran
          // Décision présente comme le budget du séjour.
          decisionCtx = { d, w, lg, nights: decNights, cost: cost(lg, d) }
        }
      }
    }

    const split = decisionCtx
      ? splitRows(
          decisionCtx.d,
          decisionCtx.cost.lodging,
          sejourInputs(decisionCtx.d),
          origins,
          state.routes,
          state.avoidTolls,
          state.routeBudget
        )
      : null

    // --- Logements du domaine consulté ------------------------------------
    // La station consultée, retrouvée aussi par les entrées qu'elle a
    // absorbées : un écran ouvert sous « Val Thorens – Orelle » doit rester
    // ouvert quand la liste replie ce libellé sur « Val Thorens ».
    const lodgDomain = stationOwning(domains, state.lodgingDomainId) ?? domains[0] ?? null

    // Seuls les logements RÉELS importés par l'utilisateur sont affichés, et
    // uniquement ceux rattachés au domaine consulté (`importDomainId`). Le
    // catalogue de démonstration a été supprimé : il ne servait qu'à illustrer
    // la mise en page, il avait déjà quitté cet écran-ci, et il alimentait
    // encore Offres, Combinaisons et Décision en se faisant passer pour de
    // vraies offres.
    // Même raison côté annonces : `importDomainId` porte l'identifiant de
    // l'entrée sous laquelle l'import a eu lieu, qui peut être une entrée
    // absorbée depuis.
    // `belongsToDomain` fait foi, et il est partagé avec l'enrichissement de
    // l'accès aux pistes : deux règles séparées avaient fini par diverger.
    const lodgRattachees = lodgDomain
      ? state.imported.filter((lg) => belongsToDomain(lg, lodgDomain))
      : []

    /*
     * La zone du domaine, appliquée à l'**affichage** et non plus seulement au
     * relevé.
     *
     * L'invariant du projet dit qu'un logement hors de la zone est rejeté, pas
     * signalé — mais il n'était tenu qu'au moment du relevé (`keepInZone`,
     * `main/providers/index.ts`). Ce qui était déjà enregistré n'était plus
     * jamais revérifié, et rien ne le rattrapait.
     *
     * Constaté le 2026-08-30 sur le profil réel : l'écran d'une station
     * auvergnate proposait « Le paradis vous attend à Pine, en Arizona », une
     * « escapade au Colorado » et une « maison à 300 m de la plage, du GR 34 ».
     * La cause tient à `importDomainId`, qui porte selon l'ancienneté de
     * l'annonce un identifiant de **référentiel** ou de **moteur** — deux
     * numérotations qui se recouvrent, si bien que `stationOwning` rattachait
     * un lot de Valfréjus au Mont-Dore. Rapprocher les numérotations après coup
     * est impossible : la trace de l'origine n'a pas été gardée.
     *
     * La position, elle, ne ment pas. Un logement dont les coordonnées sont à
     * six mille kilomètres n'appartient à ce domaine sous aucune numérotation,
     * et c'est vérifiable sans rien savoir de son histoire.
     *
     * `filterToZone` conserve les annonces **sans** position : elles restent
     * invérifiables, pas fausses, et les masquer contredirait la règle qui veut
     * qu'une position manquante ne fasse jamais disparaître une annonce.
     */
    /*
     * Rattachement hérité, invérifiable.
     *
     * Une annonce dont l'`importDomainId` n'existe pas au catalogue vient d'une
     * ancienne numérotation (référentiel ou moteur). Avec une position, le
     * schéma 7 l'a rerattachée à la bonne station ; sans position, rien ne
     * permet de le faire — et elle reste affichée sous la station que la
     * collision de numérotation lui a donnée, qui peut être à trois cents
     * kilomètres.
     *
     * On ne la masque pas : elle existe, et un relevé refait la replacera. On
     * ne prétend pas non plus qu'elle est ici. On dit ce qu'on sait.
     */
    const lodgRattachementIncertain = lodgRattachees.filter(
      (lg) =>
        lg.importDomainId != null &&
        !FM_BY_ID.has(lg.importDomainId) &&
        (typeof lg.lat !== 'number' || typeof lg.lon !== 'number')
    ).length

    const lodgZone = lodgDomain && hasCoords(lodgDomain) ? domainZone(lodgDomain) : null
    const lodgHorsZoneList = lodgZone
      ? filterToZone(lodgRattachees, lodgZone, (lg) => ({ lat: lg.lat, lon: lg.lon })).rejected
      : []
    const lodgHorsZone = lodgHorsZoneList.length
    const lodgRaw = lodgZone
      ? filterToZone(lodgRattachees, lodgZone, (lg) => ({ lat: lg.lat, lon: lg.lon })).kept
      : lodgRattachees

    /*
     * Ce qui n'a **jamais** porté de prix n'est pas une offre.
     *
     * À ne pas confondre avec `lodgConfirmedPrices`, qui exige un prix relevé
     * *pour ces dates* et reste un réglage : ici on écarte ce qui n'a de prix à
     * aucune date, jamais. Une telle ligne ne peut être ni comparée, ni
     * réservée, ni rafraîchie — c'est la définition de ce que l'écran liste,
     * pas un filtre.
     *
     * Mesuré le 2026-08-30 sur 592 annonces enregistrées : la règle en écarte
     * exactement 29, toutes issues d'un extracteur Gîtes de France qui prenait
     * le menu du site pour des résultats — « Régions de France », « Camping »,
     * « Le Top 100 des sites touristiques ». Aucune annonce Airbnb, Booking ou
     * de centrale n'est concernée : les trois sources tarifent 100 % de ce
     * qu'elles rapportent. L'extracteur est corrigé par ailleurs ; cette règle
     * traite ce qui est déjà enregistré, et protège des mêmes surprises.
     */
    const lodgSansPrix = lodgRaw.filter((lg) => !(lg.total > 0)).length
    const lodgOffres = lodgRaw.filter((lg) => lg.total > 0)
    const lodgAll = mergeDupesList(lodgOffres, state.mergeDupes)
    const dupMerged = lodgRaw.length - lodgAll.length

    /**
     * Annonces dont la disponibilité n'est pas confirmée pour ce séjour.
     *
     * Compté sur la liste complète et non sur la liste filtrée : c'est un
     * compte qu'on affiche **parce que** ces annonces viennent d'être retirées,
     * et une soustraction faite après coup ne saurait plus les nommer.
     */
    const lodgUnavailable = lodgAll.filter((lg) => !isBookable(lg, stay)).length

    // Le prédicat vit dans `data/lodgingFilter.ts` : en ligne ici, aucun test
    // ne pouvait l'interroger, et une annonce sans prix y a traversé longtemps
    // un « 4 chambres minimum » qu'elle contredisait sur sa propre vignette.
    const lodgCriteria: LodgingFilterCriteria = {
      travelers: state.travelers,
      rooms: state.rooms,
      // Redevenu un réglage le 2026-08-30, éteint par défaut. Câblé à `true`,
      // il retirait des annonces sans que rien à l'écran ne dise combien : le
      // raisonnement — « l'afficher demandait d'aller vérifier ce que
      // l'application savait déjà » — supposait que l'application le savait,
      // alors qu'elle sait seulement que son dernier relevé ne l'a pas vue.
      // La vignette porte l'avertissement (`components/LodgingCard.tsx`).
      onlyAvailable: state.lodgOnlyAvailable,
      freeCancelOnly: state.lodgAnnul,
      budgetMin: state.lodgBudgetMin,
      budgetMax: state.lodgBudgetMax,
      budgetCeiling: FILTER_RANGES.lodgBudget.max,
      distMin: state.lodgDistMin,
      distMax: state.lodgDistMax,
      distCeiling: FILTER_RANGES.lodgDist.max,
      types: state.lodgTypes,
      srcOff: state.lodgSrcOff,
      // Même histoire, même date : un prix relevé pour d'autres dates est une
      // information périmée, affichée comme telle, pas un motif de disparition.
      confirmedPricesOnly: state.lodgConfirmedPrices,
      /*
       * Toujours affichées, et plus jamais réglable.
       *
       * Une annonce qui n'annonce ni capacité ni pièces n'est pas une annonce
       * qui ne convient pas : c'est une annonce sur laquelle la source s'est
       * tue. La masquer retirait 242 appartements Airbnb de la carte d'un
       * domaine réel, et le seul geste qui les ramenait était un bouton dans
       * l'en-tête. Ce que le masquage voulait éviter est dit là où ça se lit,
       * sur la vignette : « ⚠ capacité non annoncée ». Ce qui est démontré
       * **trop petit** reste écarté — voir `partyVerdict`, dont un refus
       * l'emporte toujours sur une absence.
       */
      includeUnannounced: true
    }
    const lodgFiltered = lodgAll.filter((lg) => matchesLodgingFilters(lg, lodgCriteria, stay))

    /*
     * Le compte des « non annoncées » a été retiré avec le masquage qu'il
     * légendait. Il ne servait qu'au bandeau de l'en-tête, et un nombre qu'on
     * affiche pour expliquer une absence n'a plus d'objet quand il n'y a plus
     * d'absence : les annonces sont dans la liste, chacune avec son badge.
     */

    /**
     * Ce que l'écran retire vraiment, et rien d'autre.
     *
     * La section « Ces logements sont écartés » a été écrite quand la
     * disponibilité et le prix confirmé étaient deux **règles** de l'écran,
     * appliquées avant tout filtre : ce qui n'y répondait pas disparaissait, et
     * la section rendait compte de l'écart.
     *
     * Les deux règles sont devenues des réglages le 2026-08-30
     * (`lodgOnlyAvailable`, `lodgConfirmedPrices`), éteints par défaut — mais
     * la liste des écartés, elle, a continué de se construire sur les seuls
     * prédicats. Résultat mesurable sur le profil réel : « 120 écarté(s),
     * listé(s) plus bas » alors que ces 120 annonces étaient déjà dans la
     * mosaïque au-dessus, avec leur prix, et se retrouvaient une seconde fois
     * en bas de page sous un titre qui les disait retirées.
     *
     * L'appartenance à `lodgFiltered` fait donc foi : est écarté ce qui manque
     * à la liste, jamais ce qu'un prédicat désapprouve dans son coin. Les
     * réglages éteints, la section est vide et son compteur disparaît ; cochés,
     * elle explique l'absence, ce pour quoi elle a été écrite.
     */
    const affichees = new Set(lodgFiltered.map((lg) => lg.id))
    const lodgRejected: RejectedLodging[] = lodgAll
      .filter((lg) => !affichees.has(lg.id) && !(isBookable(lg, stay) && hasConfirmedPrice(lg, stay)))
      .map((lg) => ({ lodging: lg, verdict: availabilityOf(lg, stay) }))

    const lodgSorters: Record<string, (a: Lodging, b: Lodging) => number> = {
      pp_asc: (a, b) => a.pp - b.pp,
      total_asc: (a, b) => a.total - b.total,
      dist_asc: (a, b) => a.dist - b.dist,
      note_desc: (a, b) => parseFloat(b.note.replace(',', '.')) - parseFloat(a.note.replace(',', '.'))
    }
    // Les cartes sans prix (OSM → Airbnb) passent toujours après les offres
    // chiffrées, quel que soit le tri : sans cela, un `total` de 0 les ferait
    // remonter en tête d'un tri par prix, devant de vraies offres moins chères.
    const priceless = (lg: Lodging): boolean => lg.total <= 0
    const lodgList = [...lodgFiltered].sort((a, b) => {
      if (priceless(a) !== priceless(b)) return priceless(a) ? 1 : -1
      return (lodgSorters[state.lodgSort] ?? lodgSorters.pp_asc)(a, b)
    })

    // Le logement choisi sur la carte remonte en tête, après le tri : c'est ce
    // qui rend le clic visible quand la liste est longue ou déjà défilée.
    if (state.lodgPickId != null) {
      const at = lodgList.findIndex((lg) => lg.id === state.lodgPickId)
      if (at > 0) lodgList.unshift(lodgList.splice(at, 1)[0])
    }

    const voteOf = (key: string, index: number): number => state.votes[key]?.[index] ?? 0
    const voteScore = (key: string): number => (state.votes[key] ?? []).reduce((a, b) => a + (b || 0), 0)

    return {
      origins,
      hh,
      hasOrigin,
      nights,
      week,
      weekFactor,
      adults,
      kids,
      forfaitOf,
      travelOf: travel,
      worstTravel: worst,
      worstDistance: worstDist,
      travelText,
      scoreOf: score,
      geoDistance,
      matchesFilters,
      filtered,
      domOutOfView,
      lodgingsFor: lodgings,
      sejourInputs,
      sejourCost: cost,
      esfOf,
      lessonIndexOf,
      passOf,
      bestOffers,
      comboGrid,
      decisionCtx,
      split,
      lodgDomain,
      lodgAll,
      lodgList,
      // Ce que les filtres retirent, et que « Réinitialiser les filtres »
      // ramènerait : tout ce qui entre dans `matchesLodgingFilters` est remis à
      // plat par `LODG_FILTER_RESET`. La base était `lodgEligible` — les
      // annonces réservables et tarifées — du temps où ces deux conditions
      // étaient des règles et non des réglages ; depuis, elles sont des filtres
      // comme les autres, et la soustraction pouvait passer sous zéro.
      lodgHidden: lodgAll.length - lodgFiltered.length,
      lodgUnavailable,
      lodgRattachementIncertain,
      lodgHorsZone,
      lodgSansPrix,
      lodgRejected,
      dupMerged,
      voteScore,
      voteOf,
      comboKey: (domainId, weekArr) => `c${domainId}|${weekArr}`
    }
  }, [state, ref, domains, screen])

  return <DerivedContext.Provider value={value}>{children}</DerivedContext.Provider>
}
