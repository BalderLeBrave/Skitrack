/**
 * Relevé des sources autres qu'Airbnb.
 *
 * Le moteur multi-sources vit dans le processus principal depuis toujours —
 * Booking, Expedia, Gîtes de France, LiteAPI, centrales de station — et il est
 * exposé jusqu'au preload. Ce qui manquait était l'appel : aucun fichier du
 * renderer n'invoquait `window.skitrack.providers.search`, si bien que l'écran
 * Logements ne voyait qu'Airbnb, relevé par un chemin séparé
 * (`runAirbnbSearch`). Les quatre autres sources n'existaient dans l'interface
 * que comme filtres et pastilles sur des données qui n'arrivaient jamais.
 *
 * Ce module est cet appel, et la conversion du modèle pivot vers le `Lodging`
 * de l'application.
 *
 * ## Ce qui n'est pas comblé
 *
 * Le modèle pivot ne garantit que `title`, `url`, `source` et `sourceId`. Tout
 * le reste peut manquer, et une valeur absente le reste : capacité, chambres et
 * surface tombent à `0`/`null`, que l'interface sait déjà lire comme « non
 * annoncé » plutôt que comme un vrai zéro. Les métriques d'accès aux pistes
 * (distance, dénivelé, remontée) restent nulles et `accessComputed` reste faux
 * : elles sont calculées par le moteur local à partir de la position, pas par
 * la source. Aucun prix n'est estimé — une offre sans total confirmé garde
 * `total: 0`, ce que la vignette affiche comme une redirection vers le site.
 */

import type { ProviderAccommodation, ProviderOutcome } from '@shared/ipc-contract'
import { formatStationRun, type StationRunLog, type StationRunSource } from '@shared/searchWalk'
import type { Lodging } from './lodgings'
import { CENTRALE_SOURCE, listingKey, listingKeyFromUrl, srcOf } from './lodgings'
import { isDroppedGitesOffer } from './lodgingFilter'
import { isDoorway } from './lodgingAvailability'
import { bookingCentralOf, stationNameOf } from './stations'

/**
 * Nom technique du connecteur → libellé de source de l'interface.
 *
 * Plusieurs connecteurs partagent volontairement un libellé, parce qu'ils
 * mènent au même endroit du point de vue de qui réserve :
 *
 * - `booking` et `booking-web` sont deux chemins — API et relevé Playwright —
 *   vers le même inventaire Booking.com ;
 * - `station-web`, `ceto-*`, `ublo-msem`, `opensystem`, `deskline`,
 *   `locvacances` et `diffusio` sont des implémentations d'une seule chose,
 *   la centrale de réservation de la station. Le prestataire qui l'opère est
 *   une information de maintenance, pas un choix offert à l'utilisateur : il
 *   reste dans `srcConnector` et dans les journaux, pas dans les filtres.
 *
 * Un nom absent de cette table est conservé tel quel plutôt que masqué — mieux
 * vaut une source au nom technique visible qu'une offre silencieusement perdue.
 * C'est notamment le cas des sources MCP déclarées par l'utilisateur : elles
 * portent le nom qu'il leur a donné.
 */
const SOURCE_LABEL: Record<string, string> = {
  booking: 'Booking.com',
  'booking-web': 'Booking.com',
  expedia: 'Expedia',
  'expedia-web': 'Expedia',
  'gites-de-france': 'Gîtes de France',
  'gites-web': 'Gîtes de France',
  'vrbo-web': 'Abritel',
  liteapi: 'LiteAPI',
  airbnb: 'Airbnb',
  'station-web': CENTRALE_SOURCE,
  'ceto-chamonix': CENTRALE_SOURCE,
  'ceto-meribel': CENTRALE_SOURCE,
  'ceto-plagne': CENTRALE_SOURCE,
  'ceto-megeve': CENTRALE_SOURCE,
  'ublo-msem': CENTRALE_SOURCE,
  opensystem: CENTRALE_SOURCE,
  deskline: CENTRALE_SOURCE,
  locvacances: CENTRALE_SOURCE,
  diffusio: CENTRALE_SOURCE
}

export function sourceLabelOf(provider: string): string {
  return SOURCE_LABEL[provider] ?? provider
}

const DROPPED_SOURCES = new Set(['cozycozy', 'cozycozy-web', 'tourinsoft'])

/** CozyCozy (doublon) et Tourinsoft (tarif d'appel) ne sont plus des sources. */
export function isDroppedListingSource(source?: string | null, url?: string | null): boolean {
  const s = (source ?? '').toLowerCase()
  if (DROPPED_SOURCES.has(s) || s.includes('cozycozy') || s.includes('tourinsoft')) return true
  if (url && /cozycozy\.com/i.test(url)) return true
  return false
}

export interface ProviderSearchOutcome {
  /** Libellé d'interface, déjà traduit du nom technique. */
  source: string
  provider: string
  count: number
  error: string | null
  elapsedMs: number
  reasonCode?: string
  /** Motif d'arrêt de la pagination, quand le connecteur en rend un. */
  stoppedReason?: string
  pagesFetched?: number
  fetched?: number
  advertised?: number
}

export interface RunProviderSearchResult {
  lodgings: Lodging[]
  outcomes: ProviderSearchOutcome[]
  stationRun: StationRunLog
}

export interface RunProviderSearchParams {
  domainId: number
  /** Nombre de chambres demandé, transmis aux connecteurs qui savent filtrer. */
  bedrooms?: number
  domainName: string
  lat?: number
  lon?: number
  /** Rayon de recherche autour du domaine, en mètres. */
  radiusMeters?: number
  checkIn: string
  checkOut: string
  adults: number
  children?: number
  nights: number
  /** Centrale connue du moteur local (`official_booking_url`), en secours. */
  officialUrl?: string | null
  /** Offres déjà connues : sert à ne pas réintroduire un doublon d'URL. */
  existing: Lodging[]
}

/** Identifiant local stable, dérivé de l'URL : deux relevés du même bien se
 *  rapportent à la même vignette au lieu d'en créer une par passage. */
function idFromUrl(url: string): number {
  const key = listingKeyFromUrl(url) ?? url
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0
  // Décalé hors de la plage des identifiants du catalogue et des imports Airbnb.
  return 900_000_000 + Math.abs(h % 90_000_000)
}

/**
 * Note ramenée sur 5, l'échelle de la vignette et de la fiche.
 *
 * Chaque source note à sa façon : Airbnb sur 5, Booking sur 10 — « 8,2 » sur
 * une fiche Booking. La valeur brute était recopiée telle quelle derrière une
 * étoile sur 5 : une note Booking parfaitement correcte s'affichait alors comme
 * une note impossible. L'échelle est déclarée par le connecteur
 * (`Accommodation.ratingScale`), qui seul la connaît ; 5 par défaut.
 *
 * Une note qui ne tient pas dans [0, 5] après conversion est **abandonnée**
 * plutôt qu'affichée : elle signale une échelle non déclarée, et une note fausse
 * renseigne moins bien qu'une note absente. C'est la règle du projet — une
 * valeur absente reste absente.
 */
export function noteOnFive(rating: number | undefined, scale: number | undefined): string {
  if (rating == null || !Number.isFinite(rating)) return ''
  const from = scale != null && scale > 0 ? scale : 5
  const onFive = Math.round((rating * 5) / from * 10) / 10
  if (onFive < 0 || onFive > 5) return ''
  return String(onFive).replace('.', ',')
}

function toLodging(
  a: ProviderAccommodation,
  params: RunProviderSearchParams
): Lodging | null {
  if (!a.url || !a.title) return null
  if (isDroppedListingSource(a.source, a.url)) return null
  if (
    isDroppedGitesOffer({
      src: sourceLabelOf(a.source),
      url: a.url,
      type: a.propertyType ?? ''
    })
  ) {
    return null
  }

  // Séjour formel seulement. Nuit × 7 et « à partir de /semaine » ne passent pas.
  const total =
    a.totalPrice != null && a.totalPrice > 0 ? Math.round(a.totalPrice * 100) / 100 : 0
  if (total <= 0) return null
  if (a.priceConfidence === 'partial') return null
  if (a.availabilityStatus === 'unavailable' || a.availabilityStatus === 'listing_gone') {
    return null
  }

  const nights = Math.max(1, params.nights)
  const publishedGuests = a.guests && a.guests > 0 ? a.guests : 0
  const pp = Math.round((total / nights / Math.max(1, publishedGuests || params.adults)) * 10) / 10
  const image = a.images?.[0] ?? null

  return {
    id: idFromUrl(a.url),
    name: a.title,
    type: a.propertyType ?? '',
    pers: publishedGuests,
    fitsGuests: params.adults > 0 ? params.adults : undefined,
    availabilityStatus: 'available',
    searchPageIndex: a.searchPageIndex,
    distanceStatus: a.latitude != null && a.longitude != null ? undefined : 'no_gps',
    ch: a.bedrooms ?? 0,
    rooms: a.rooms != null && a.rooms > 0 ? a.rooms : undefined,
    priceOptions: a.priceOptions?.length ? a.priceOptions : undefined,
    m2: a.areaSqm ?? null,
    note: noteOnFive(a.rating, a.ratingScale),
    avis: a.reviewCount ?? 0,
    dist: 0,
    walk: 0,
    den: 0,
    skiIn: false,
    src: sourceLabelOf(a.source),
    srcConnector: a.source,
    pp,
    lift: '',
    liftDist: 0,
    photo: image ?? '',
    annul: false,
    total,
    nightly: undefined,
    weekly: undefined,
    alt: 0,
    stock: 0,
    url: a.url,
    image,
    lat: a.latitude,
    lon: a.longitude,
    locPrecision: a.latitude != null ? 'exact' : undefined,
    importDomainId: params.domainId,
    scannedAt: Date.now(),
    priceCheckIn: a.checkIn || params.checkIn,
    priceCheckOut: a.checkOut || params.checkOut,
    accessComputed: false,
    priceConfidence: 'total_confirmed'
  }
}

/**
 * Convertit les résultats d'un outcome (éventuellement partiel) en Lodging.
 *
 * `seenUrls` ne dédoublonne **que le relevé en cours**, jamais contre les
 * offres déjà enregistrées. C'est le correctif d'un défaut coûteux : le jeu
 * était amorcé avec les URL de `existing`, si bien qu'une annonce déjà connue
 * était écartée avant même d'être convertie. Son prix, sa capacité et sa
 * disponibilité étaient donc **figés au premier relevé, définitivement** —
 * dans une application dont le métier est de rafraîchir des prix. Le
 * rapprochement avec l'existant se fait maintenant en aval, par
 * `mergeProviderReadings`, qui remplace au lieu de jeter.
 */
export function lodgingsFromOutcome(
  outcome: ProviderOutcome,
  params: RunProviderSearchParams,
  seenUrls: Set<string>
): Lodging[] {
  const out: Lodging[] = []
  for (const item of outcome.results) {
    if (!item.url) continue
    const identity = listingKeyFromUrl(item.url)
    if (identity && seenUrls.has(identity)) continue
    if (seenUrls.has(item.url)) continue
    if (isDroppedListingSource(item.source, item.url)) continue
    if (
      isDroppedGitesOffer({
        src: sourceLabelOf(item.source),
        url: item.url,
        type: item.propertyType ?? ''
      })
    ) {
      continue
    }
    if (item.availabilityStatus === 'unavailable' || item.availabilityStatus === 'listing_gone') {
      continue
    }
    const lodging = toLodging(item, params)
    if (!lodging) continue
    // Occupancy et plancher : l'écran filtre (`matchesLodgingFilters`). Les
    // jeter ici faisait disparaitre des cartes scrapées (Booking sans
    // « N chambres » sur la tuile) avant même `imported`.
    const key = listingKey(lodging)
    if (seenUrls.has(key)) continue
    seenUrls.add(key)
    if (identity) seenUrls.add(identity)
    seenUrls.add(item.url)
    out.push(lodging)
  }
  return out
}

/**
 * Fusionne un relevé neuf dans la liste enregistrée.
 *
 * Une annonce déjà connue est **mise à jour sur place**, à son rang : ce qui
 * vient d'être mesuré remplace ce qui l'avait été, et ce que le moteur local a
 * calculé — distance aux pistes, dénivelé, altitude — est conservé, parce que
 * la source ne le fournit pas et qu'un remplacement brutal le perdrait.
 *
 * Deux règles asymétriques, et elles ne se déduisent pas l'une de l'autre :
 *
 * - **Le prix** ne s'efface pas. Un relevé qui ne rend aucun tarif ne prouve
 *   pas que le précédent était faux ; il prouve qu'on n'a rien vu cette fois.
 *   Même règle que la fusion Airbnb, pour la même raison.
 * - **La capacité et le barème** s'effacent, eux. Une valeur enregistrée peut
 *   être l'ancienne capacité recopiée de la demande — une invention, pas une
 *   mesure — et la garder au prétexte que le nouveau relevé se tait
 *   perpétuerait exactement ce qu'on vient de corriger. Le silence d'une source
 *   est une information : il vaut mieux que l'ancien mensonge.
 */
export function mergeProviderReadings(existing: Lodging[], readings: Lodging[]): Lodging[] {
  const keep = (lg: Lodging): boolean =>
    !isDroppedListingSource(lg.src, lg.url) &&
    !isDroppedListingSource(lg.srcConnector, lg.url) &&
    !isDroppedGitesOffer(lg)
  const existingClean = existing.filter(keep)
  const readingsClean = readings.filter(keep)
  if (readingsClean.length === 0) return existingClean

  const byKey = new Map<string, Lodging>()
  for (const reading of readingsClean) {
    byKey.set(listingKey(reading), reading)
  }

  const used = new Set<string>()
  const merged = existingClean.map((lodging) => {
    const key = listingKey(lodging)
    const reading = byKey.get(key)
    if (!reading) return lodging
    used.add(key)
    return {
      ...lodging,
      name: reading.name || lodging.name,
      pers: reading.pers,
      fitsGuests: reading.fitsGuests ?? lodging.fitsGuests,
      ch: reading.ch,
      rooms: reading.rooms,
      m2: reading.m2 ?? lodging.m2,
      priceOptions: reading.priceOptions,
      note: reading.note || lodging.note,
      avis: reading.avis || lodging.avis,
      image: reading.image ?? lodging.image,
      photo: reading.image ?? lodging.photo,
      lat: reading.lat ?? lodging.lat,
      lon: reading.lon ?? lodging.lon,
      src: reading.src,
      srcConnector: reading.srcConnector,
      availabilityStatus: reading.availabilityStatus ?? lodging.availabilityStatus,
      ...(reading.total > 0
        ? {
            total: reading.total,
            nightly: undefined,
            weekly: undefined,
            pp: reading.pp,
            priceConfidence: 'total_confirmed' as const,
            priceCheckIn: reading.priceCheckIn,
            priceCheckOut: reading.priceCheckOut,
            scannedAt: reading.scannedAt ?? Date.now(),
            missingSince: undefined,
            availabilityStatus: reading.availabilityStatus ?? 'available'
          }
        : {})
    }
  })

  const added = readingsClean.filter((r) => !used.has(listingKey(r)))
  return added.length > 0 ? [...merged, ...added] : merged
}

/**
 * Un relevé autorise-t-il à conclure qu'une annonce absente n'est plus libre ?
 *
 * `'skip'` : le connecteur n'a pas interrogé (pas câblé, délégué, pas d'URL).
 * `false` : panne, blocage, pagination coupée — l'absence ne prouve rien.
 * `true` : l'inventaire a été vu jusqu'au bout, ou la source a dit stock vide.
 */
export function sourceScanIsConclusive(
  outcome: Pick<ProviderSearchOutcome, 'error' | 'reasonCode' | 'stoppedReason' | 'count'>
): boolean | 'skip' {
  const reason = outcome.reasonCode
  if (reason === 'not_wired' || reason === 'delegated' || reason === 'no_official_url') {
    return 'skip'
  }
  if (outcome.error) return false
  if (reason && reason !== 'ok' && reason !== 'empty_inventory') return false
  const stop = outcome.stoppedReason
  if (stop === 'exhausted' || stop === 'empty_page') return true
  if (
    stop === 'max_pages' ||
    stop === 'max_listings' ||
    stop === 'budget' ||
    stop === 'no_fresh' ||
    stop === 'blocked'
  ) {
    return false
  }
  // API sans rapport de pagination : un lot non vide est l'inventaire rendu.
  // Un zéro sans motif n'est pas une preuve — ça peut être un parse manqué.
  return outcome.count > 0
}

/** Libellés dont **tous** les connecteurs interrogés ont conclu. */
export function conclusiveSourceLabels(outcomes: ProviderSearchOutcome[]): Set<string> {
  const byLabel = new Map<string, boolean[]>()
  for (const outcome of outcomes) {
    const verdict = sourceScanIsConclusive(outcome)
    if (verdict === 'skip') continue
    const flags = byLabel.get(outcome.source) ?? []
    flags.push(verdict)
    byLabel.set(outcome.source, flags)
  }
  const out = new Set<string>()
  for (const [label, flags] of byLabel) {
    if (flags.length > 0 && flags.every(Boolean)) out.add(label)
  }
  return out
}

export interface ScanAbsenceContext {
  checkIn: string
  checkOut: string
  domainId: number
  conclusiveSources: Set<string>
  at: number
}

/**
 * Marque `missingSince` les annonces d'une source conclusive que ce relevé
 * n'a pas revues, au même séjour et au même domaine.
 *
 * Airbnb a son propre chemin (`mergeAirbnbPaste`, `absenceConclusive`) : on
 * ne le retouche pas ici. Un import manuel et une porte d'entrée OSM non plus
 * — aucune source ne les a confrontés à un inventaire.
 *
 * Marquée, pas supprimée. L'écran les retire via `isBookable` ; un relevé
 * ultérieur qui les retrouve lève la marque.
 */
export function markAbsentFromScan(
  lodgings: Lodging[],
  seenKeys: Set<string>,
  ctx: ScanAbsenceContext
): Lodging[] {
  if (ctx.conclusiveSources.size === 0) return lodgings
  return lodgings.map((lodging) => {
    if (isDoorway(lodging) || srcOf(lodging) === 'Import manuel') return lodging
    const source = srcOf(lodging)
    if (source === 'Airbnb') return lodging
    if (!ctx.conclusiveSources.has(source)) return lodging
    const sameStay =
      lodging.priceCheckIn === ctx.checkIn && lodging.priceCheckOut === ctx.checkOut
    const sameDomain = lodging.importDomainId == null || lodging.importDomainId === ctx.domainId
    if (!sameStay || !sameDomain) return lodging
    if (seenKeys.has(listingKey(lodging))) return lodging
    if (lodging.missingSince) return lodging
    return {
      ...lodging,
      missingSince: { checkIn: ctx.checkIn, checkOut: ctx.checkOut, at: ctx.at }
    }
  })
}

/**
 * Sources en panne et sources sans offre, **par libellé affiché**.
 *
 * Un libellé recouvre maintenant plusieurs connecteurs, et un compte-rendu
 * naïf par connecteur ferait apparaître « Centrale de réservation » à la fois
 * en panne et sans offre au même relevé — ce que personne ne saurait lire.
 * L'agrégation tranche donc, et dans cet ordre :
 *
 * 1. un libellé qui a rapporté au moins une offre n'est signalé nulle part ;
 * 2. sinon, s'il a produit au moins une erreur, il est **en panne** — c'est
 *    l'information actionnable, et elle prime sur le silence des autres ;
 * 3. sinon, il a répondu sans rien avoir : **aucune offre**.
 *
 * Le cas n'est pas neuf, il était seulement invisible : `booking` et
 * `booking-web` partageaient déjà « Booking.com ».
 */
export function sourceStatuses(outcomes: ProviderSearchOutcome[]): {
  failed: string[]
  empty: string[]
} {
  const byLabel = new Map<string, { count: number; errored: boolean }>()
  for (const outcome of outcomes) {
    const seen = byLabel.get(outcome.source) ?? { count: 0, errored: false }
    seen.count += outcome.count
    seen.errored = seen.errored || outcome.error != null
    byLabel.set(outcome.source, seen)
  }

  const failed: string[] = []
  const empty: string[] = []
  for (const [label, seen] of byLabel) {
    if (seen.count > 0) continue
    if (seen.errored) failed.push(label)
    else empty.push(label)
  }
  return { failed, empty }
}

export function outcomeSummary(o: ProviderOutcome): ProviderSearchOutcome {
  return {
    source: sourceLabelOf(o.provider),
    provider: o.provider,
    count: o.results.length,
    error: o.error,
    elapsedMs: o.elapsedMs,
    reasonCode: o.reasonCode,
    stoppedReason: o.pagination?.stoppedReason,
    pagesFetched: o.pagination?.pagesFetched,
    fetched: o.pagination?.listingsFound ?? o.results.length,
    advertised: o.pagination?.advertised
  }
}

export function stationRunFromOutcomes(
  params: {
    destination: string
    checkIn?: string
    checkOut?: string
    adults?: number
    bedrooms?: number
  },
  outcomes: ProviderSearchOutcome[],
  extra: Omit<StationRunSource, 'fork'>[] = []
): StationRunLog {
  return formatStationRun(params, [
    ...outcomes.map((o) => ({
      provider: o.provider,
      fetched: o.fetched ?? o.count,
      parsed: o.count,
      shown: o.count,
      pages_fetched: o.pagesFetched ?? (o.count > 0 ? 1 : 0),
      stopped_reason: o.stoppedReason,
      reason_code: o.reasonCode,
      error: o.error,
      advertised: o.advertised
    })),
    ...extra
  ])
}

export async function runProviderSearch(
  params: RunProviderSearchParams
): Promise<RunProviderSearchResult> {
  const aggregate = await window.skitrack.providers.search({
    // Le nom de la station, pas celui du domaine relié : voir `data/stations.ts`.
    destination: stationNameOf(params.domainName) || params.domainName,
    // Centrale de réservation de la station : le connecteur `station-web` n'a
    // pas d'autre moyen de savoir quel site interroger. Sans elle, il se tait.
    officialUrl: bookingCentralOf(params.domainName, params.officialUrl) ?? undefined,
    latitude: params.lat,
    longitude: params.lon,
    radiusMeters: params.radiusMeters,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    adults: params.adults,
    children: params.children,
    // Le critère chambres, enfin transmis. Il restait dans le renderer, où il
    // était appliqué après coup sur ce que les sources avaient rapporté — et
    // ni Airbnb ni Booking ne rapportent de chambres. Voir
    // `ProviderSearchParams.bedrooms`.
    bedrooms: params.bedrooms
  })

  // Dédoublonnage interne au relevé seulement : deux connecteurs peuvent servir
  // la même URL. Le rapprochement avec l'existant appartient à
  // `mergeProviderReadings`, qui met à jour au lieu d'écarter.
  const seen = new Set<string>()
  const lodgings: Lodging[] = []
  const shownByProvider = new Map<string, number>()

  for (const outcome of aggregate.outcomes) {
    const before = lodgings.length
    lodgings.push(...lodgingsFromOutcome(outcome, params, seen))
    shownByProvider.set(outcome.provider, lodgings.length - before)
  }

  const stationRun = formatStationRun(
    {
      destination: stationNameOf(params.domainName) || params.domainName,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      adults: params.adults,
      bedrooms: params.bedrooms
    },
    aggregate.outcomes.map((o) => ({
      provider: o.provider,
      fetched: o.pagination?.listingsFound ?? o.results.length,
      parsed: o.results.length,
      shown: shownByProvider.get(o.provider) ?? 0,
      pages_fetched: o.pagination?.pagesFetched ?? (o.results.length > 0 ? 1 : 0),
      stopped_reason: o.pagination?.stoppedReason,
      reason_code: o.reasonCode,
      error: o.error,
      advertised: o.pagination?.advertised
    }))
  )

  return {
    lodgings,
    outcomes: aggregate.outcomes.map(outcomeSummary),
    stationRun
  }
}
