/**
 * Relevé des sources autres qu'Airbnb.
 *
 * Le moteur multi-sources vit dans le processus principal depuis toujours —
 * Booking, Expedia, Gîtes de France, LiteAPI, cozycozy, centrales de station — et il est
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
import type { Lodging } from './lodgings'
import { CENTRALE_SOURCE } from './lodgings'
import { bookingCentralOf, stationNameOf } from './stations'

/**
 * Nom technique du connecteur → libellé de source de l'interface.
 *
 * Plusieurs connecteurs partagent volontairement un libellé, parce qu'ils
 * mènent au même endroit du point de vue de qui réserve :
 *
 * - `booking` et `booking-web` sont deux chemins — API et relevé Playwright —
 *   vers le même inventaire Booking.com ;
 * - `station-web`, `ceto-*`, `ublo-msem` et `opensystem` sont sept
 *   implémentations d'une seule chose, la centrale de réservation de la
 *   station. Le prestataire qui l'opère est une information de maintenance, pas
 *   un choix offert à l'utilisateur : il reste dans `srcConnector` et dans les
 *   journaux, pas dans les filtres.
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
  'cozycozy-web': 'cozycozy',
  liteapi: 'LiteAPI',
  airbnb: 'Airbnb',
  'station-web': CENTRALE_SOURCE,
  'ceto-chamonix': CENTRALE_SOURCE,
  'ceto-meribel': CENTRALE_SOURCE,
  'ceto-plagne': CENTRALE_SOURCE,
  'ceto-megeve': CENTRALE_SOURCE,
  'ublo-msem': CENTRALE_SOURCE,
  opensystem: CENTRALE_SOURCE
}

export function sourceLabelOf(provider: string): string {
  return SOURCE_LABEL[provider] ?? provider
}

export interface ProviderSearchOutcome {
  /** Libellé d'interface, déjà traduit du nom technique. */
  source: string
  provider: string
  count: number
  error: string | null
  elapsedMs: number
}

export interface RunProviderSearchResult {
  lodgings: Lodging[]
  outcomes: ProviderSearchOutcome[]
}

export interface RunProviderSearchParams {
  domainId: number
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
  let h = 0
  for (const ch of url) h = (h * 31 + ch.charCodeAt(0)) | 0
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

  // Montant du séjour si fourni. On affiche dès qu'il y a un prix > 0 :
  // une confiance inconnue ne doit pas faire disparaître l'offre.
  const total =
    a.totalPrice != null && a.totalPrice > 0 ? Math.round(a.totalPrice) : 0

  const nights = Math.max(1, params.nights)
  const guests = a.guests && a.guests > 0 ? a.guests : params.adults
  const pp = total > 0 ? Math.round((total / nights / Math.max(1, guests)) * 10) / 10 : 0

  // Centrale Ingénie : un total relevé via `#total-prestation` est le montant
  // du séjour, pas un « à partir de ». Ne pas le rabattre en `partial`.
  const confidence =
    a.source === 'station-web' && total > 0 && a.priceConfidence !== 'partial'
      ? 'total_confirmed'
      : a.priceConfidence === 'total_confirmed' || a.priceConfidence === 'partial'
        ? a.priceConfidence
        : total > 0
          ? 'partial'
          : 'unknown'

  return {
    id: idFromUrl(a.url),
    name: a.title,
    // Le modèle pivot ne porte pas de typologie exploitable : laisser vide
    // plutôt que deviner « Appartement ».
    type: '',
    pers: a.guests ?? 0,
    // La recherche envoyée au connecteur portait le groupe : Booking reçoit
    // `group_adults`, Airbnb `adults`, les centrales `search[capacity]` — voir
    // `webscrape/urls.ts` et `deeplinks.ts`. La source n'a rendu cette annonce
    // que parce qu'elle accepte ce groupe-là.
    fitsGuests: params.adults > 0 ? params.adults : undefined,
    // Les centrales de station comptent des **pièces**, pas des chambres, et
    // n'annoncent les secondes nulle part : `ch` reste à zéro — « non annoncé »
    // — plutôt que de traduire un deux-pièces en une chambre, qui serait une
    // convention d'annonce et non une donnée relevée.
    ch: a.bedrooms ?? 0,
    // Les pièces, elles, sont bien là : c'est la mesure que publient Ingénie et
    // Ublo. Les jeter, comme on le faisait, rendait toute annonce de centrale
    // infiltrable sur la taille — `ch` valant zéro, elles traversaient
    // n'importe quel « 4 chambres minimum ».
    rooms: a.rooms != null && a.rooms > 0 ? a.rooms : undefined,
    // Barème de la centrale, quand elle en publie un.
    priceOptions: a.priceOptions?.length ? a.priceOptions : undefined,
    m2: a.areaSqm ?? null,
    note: noteOnFive(a.rating, a.ratingScale),
    avis: a.reviewCount ?? 0,
    // Accès aux pistes : calculé par le moteur local depuis la position, pas
    // fourni par la source. Reste à zéro tant qu'il ne l'a pas été.
    dist: 0,
    walk: 0,
    den: 0,
    skiIn: false,
    src: sourceLabelOf(a.source),
    // Le connecteur exact, que le libellé regroupé ne dit plus : c'est lui qui
    // décide des paramètres de séjour recollés sur l'URL de l'annonce.
    srcConnector: a.source,
    pp,
    lift: '',
    liftDist: 0,
    photo: '',
    annul: false,
    total,
    alt: 0,
    stock: 0,
    url: a.url,
    image: a.images?.[0] ?? null,
    lat: a.latitude,
    lon: a.longitude,
    locPrecision: a.latitude != null ? 'exact' : undefined,
    importDomainId: params.domainId,
    // Dates du relevé : celles de la fiche si le connecteur les a figées,
    // sinon les critères de recherche (cas nominal Ceto / Booking).
    scannedAt: Date.now(),
    priceCheckIn: a.checkIn || params.checkIn,
    priceCheckOut: a.checkOut || params.checkOut,
    accessComputed: false,
    priceConfidence: confidence
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
    if (!item.url || seenUrls.has(item.url)) continue
    const lodging = toLodging(item, params)
    if (!lodging) continue
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
  if (readings.length === 0) return existing

  const byUrl = new Map<string, Lodging>()
  for (const reading of readings) {
    if (reading.url) byUrl.set(reading.url, reading)
  }

  const used = new Set<string>()
  const merged = existing.map((lodging) => {
    const reading = lodging.url ? byUrl.get(lodging.url) : undefined
    if (!reading) return lodging
    used.add(lodging.url as string)
    return {
      ...lodging,
      // Ce que la source vient de publier.
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
      lat: reading.lat ?? lodging.lat,
      lon: reading.lon ?? lodging.lon,
      src: reading.src,
      srcConnector: reading.srcConnector,
      // Un relevé muet n'efface pas un prix déjà mesuré.
      ...(reading.total > 0
        ? {
            total: reading.total,
            pp: reading.pp,
            priceConfidence: reading.priceConfidence,
            priceCheckIn: reading.priceCheckIn,
            priceCheckOut: reading.priceCheckOut,
            // Revue au relevé : la marque d'absence tombe.
            missingSince: undefined
          }
        : {})
    }
  })

  const added = readings.filter((r) => r.url && !used.has(r.url))
  return added.length > 0 ? [...merged, ...added] : merged
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
    elapsedMs: o.elapsedMs
  }
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
    children: params.children
  })

  // Dédoublonnage interne au relevé seulement : deux connecteurs peuvent servir
  // la même URL. Le rapprochement avec l'existant appartient à
  // `mergeProviderReadings`, qui met à jour au lieu d'écarter.
  const seen = new Set<string>()
  const lodgings: Lodging[] = []

  for (const outcome of aggregate.outcomes) {
    lodgings.push(...lodgingsFromOutcome(outcome, params, seen))
  }

  return {
    lodgings,
    outcomes: aggregate.outcomes.map(outcomeSummary)
  }
}
