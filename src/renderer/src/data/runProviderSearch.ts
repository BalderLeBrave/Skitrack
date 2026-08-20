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
import { bookingCentralOf, stationNameOf } from './stations'

/**
 * Nom technique du connecteur → libellé de source de l'interface.
 *
 * Les connecteurs API et leurs équivalents scrapés Playwright désignent le même
 * site : `booking` et `booking-web` retombent tous deux sur « Booking.com ».
 * Un nom absent de cette table est conservé tel quel plutôt que masqué — mieux
 * vaut une source au nom technique visible qu'une offre silencieusement perdue.
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
  'station-web': 'Site officiel de la station',
  'ceto-chamonix': 'Chamonix Réservation',
  'ceto-meribel': 'Méribel Réservation',
  'ceto-plagne': 'La Plagne Resort',
  'ceto-megeve': 'Megève Réservation'
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

  const confidence =
    a.priceConfidence === 'total_confirmed' || a.priceConfidence === 'partial'
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
    // Les centrales de station comptent des **pièces**, pas des chambres, et
    // n'annoncent les secondes nulle part : `ch` reste à zéro — « non annoncé »
    // — plutôt que de traduire un deux-pièces en une chambre, qui serait une
    // convention d'annonce et non une donnée relevée.
    ch: a.bedrooms ?? 0,
    m2: a.areaSqm ?? null,
    note: a.rating != null ? String(a.rating).replace('.', ',') : '',
    avis: a.reviewCount ?? 0,
    // Accès aux pistes : calculé par le moteur local depuis la position, pas
    // fourni par la source. Reste à zéro tant qu'il ne l'a pas été.
    dist: 0,
    walk: 0,
    den: 0,
    skiIn: false,
    src: sourceLabelOf(a.source),
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
    priceCheckIn: a.checkIn || params.checkIn,
    priceCheckOut: a.checkOut || params.checkOut,
    accessComputed: false,
    priceConfidence: confidence
  }
}

/** Convertit les résultats d'un outcome (éventuellement partiel) en Lodging. */
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

  const seen = new Set(params.existing.map((l) => l.url).filter(Boolean) as string[])
  const lodgings: Lodging[] = []

  for (const outcome of aggregate.outcomes) {
    lodgings.push(...lodgingsFromOutcome(outcome, params, seen))
  }

  return {
    lodgings,
    outcomes: aggregate.outcomes.map(outcomeSummary)
  }
}
