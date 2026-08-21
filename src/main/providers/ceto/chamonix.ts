/**
 * Connecteur Ceto / Orchestra — Chamonix Mont-Blanc.
 *
 * Interroge booking.chamonix.com (SERP HTML) avec dates + filtre village.
 * Prix pour le séjour uniquement ; deep-link daté sur chaque fiche.
 */

import { CircuitBreaker, withTimeout } from '../resilience'
import { debugLog } from '../debug'
import type {
  Accommodation,
  AccommodationProvider,
  ProviderHealth,
  SearchParams
} from '../types'
import { nowIso } from '../types'
import { isChamonixCentral } from './hosts'
import {
  extractChamonixMulti,
  resolveLocationCode,
  type ChamonixListing
} from './chamonixExtract'
import { readFicheOccupancies, MAX_FICHES } from './ficheOccupancy'
import type { FicheOccupancy } from './occupancy'

export const CETO_CHAMONIX_PROVIDER_NAME = 'ceto-chamonix'

const TIMEOUT_MS = 45_000
const breaker = new CircuitBreaker(3, 60_000)

function toAccommodation(
  item: ChamonixListing,
  params: SearchParams,
  reviews?: { rating: number | null; numReviews: number | null } | null,
  /** Grille de la fiche, quand elle a pu être lue. */
  grid?: FicheOccupancy | null,
  /** Tarif du groupe demandé d'après cette grille. */
  groupPrice?: number | null
): Accommodation {
  // La grille prime sur la SERP quand elle existe.
  //
  // La SERP n'affiche qu'un « à partir de » à l'occupation minimale. Dès qu'on
  // a lu la grille, ce montant n'a plus lieu d'être montré : soit elle donne le
  // tarif du groupe demandé, soit elle n'en a pas pour lui — et il vaut alors
  // mieux ne rien afficher que le tarif d'un autre groupe. C'est exactement le
  // « à partir de » qu'on cherche à supprimer.
  const total = grid ? (groupPrice ?? undefined) : (item.total ?? undefined)
  const confidence =
    grid != null
      ? groupPrice != null
        ? 'total_confirmed'
        : 'unknown'
      : item.priceConfidence === 'partial'
        ? 'partial'
        : total != null
          ? 'total_confirmed'
          : 'unknown'

  return {
    source: CETO_CHAMONIX_PROVIDER_NAME,
    sourceId: item.id ?? item.url ?? 'unknown',
    title: item.title ?? 'Sans titre',
    url: item.url ?? '',
    latitude: item.lat ?? undefined,
    longitude: item.lon ?? undefined,
    city: item.city ?? undefined,
    country: 'France',
    checkIn: item.priceCheckIn || params.checkIn,
    checkOut: item.priceCheckOut || params.checkOut,
    // La SERP ne publie pas la capacité : elle vient de la grille de la fiche,
    // ou reste absente. Jamais recopiée de la demande.
    guests: grid?.maxPax,
    priceOptions: grid?.options.map((o) => ({
      guests: o.pax,
      total: o.total,
      condition: o.condition,
      policy: o.policy
    })),
    totalPrice: total,
    currency: item.currency || 'EUR',
    priceConfidence: confidence,
    rating: reviews?.rating ?? undefined,
    reviewCount: reviews?.numReviews ?? undefined,
    images: item.image ? [item.image] : undefined,
    availability: total != null && total > 0,
    availabilityStatus: total != null && total > 0 ? 'available' : 'unknown',
    retrievedAt: nowIso(),
    rawProviderData: item
  }
}

/**
 * Meilleur tarif de la grille pour un groupe d'une taille donnée.
 *
 * Le moins cher **parmi les occupations qui l'accueillent**, jamais le moins
 * cher de la grille : le tarif « 1 personne » est presque toujours le plus bas,
 * et l'afficher pour un groupe de huit reproduirait le « à partir de » qu'on
 * cherche à corriger. `null` quand aucune occupation ne suffit — l'annonce est
 * alors écartée.
 */
function priceForGroupIn(grid: FicheOccupancy, pax: number): number | null {
  const fitting = grid.options.filter((o) => o.pax >= pax)
  if (fitting.length === 0) return null
  return Math.min(...fitting.map((o) => o.total))
}

/** Agrégats TripAdvisor via proxy Orchestra (pas de texte d'avis). */
async function fetchTaAggregates(
  tripadvisorLocationId: string
): Promise<{ rating: number | null; numReviews: number | null } | null> {
  try {
    const url = `https://booking.chamonix.com/api/proxy/tripadvisor-reviews/${tripadvisorLocationId}`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Referer: 'https://booking.chamonix.com/fr/',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(10_000)
    })
    if (!res.ok) return null
    const raw = (await res.json()) as {
      rating?: string | number
      numReviews?: string | number
      error?: string
    }
    if (raw.error) return null
    const rating = raw.rating != null && raw.rating !== '' ? Number(raw.rating) : null
    const numReviews =
      raw.numReviews != null && raw.numReviews !== '' ? Number(raw.numReviews) : null
    return {
      rating: Number.isFinite(rating as number) ? (rating as number) : null,
      numReviews: Number.isFinite(numReviews as number) ? (numReviews as number) : null
    }
  } catch {
    return null
  }
}

/**
 * Active ce connecteur quand la centrale du domaine est booking.chamonix.com.
 */
export function createCetoChamonixProvider(): AccommodationProvider {
  const name = CETO_CHAMONIX_PROVIDER_NAME

  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const central = params.officialUrl?.trim()
      if (!central || !isChamonixCentral(central)) {
        return []
      }

      if (breaker.open) {
        throw new Error(`${name} : ${breaker.reason}`)
      }

      const from = params.checkIn
      const to = params.checkOut
      if (!from || !to) {
        throw new Error(`${name} : dates de séjour requises (checkIn / checkOut).`)
      }

      const location =
        resolveLocationCode(params.destination) ||
        resolveLocationCode(
          params.destination
            ?.toLowerCase()
            .normalize('NFD')
            .replace(/\p{M}/gu, '') ?? ''
        )

      try {
        const result = await withTimeout(
          extractChamonixMulti({
            from,
            to,
            adults: params.adults ?? 2,
            children: params.children ?? 0,
            location,
            maxPages: 2,
            pricedOnly: true,
            types: ['hotel', 'apartment', 'residence']
          }),
          TIMEOUT_MS,
          name
        )

        if (!result.ok) {
          breaker.fail()
          throw new Error(`${name} : ${result.error ?? 'échec extracteur'}`)
        }

        const priced = result.listings.filter(
          (l) => l.total != null && l.total > 0 && l.url && l.title
        )
        // Notes TA en parallèle (max 8, concurrence 3) pour ne pas allonger la recherche
        const REVIEW_CAP = 8
        const CONCURRENCY = 3
        const reviewById = new Map<string, { rating: number | null; numReviews: number | null } | null>()
        const toFetch = priced
          .slice(0, REVIEW_CAP)
          .filter((l) => l.tripadvisorLocationId)
        for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
          const batch = toFetch.slice(i, i + CONCURRENCY)
          const results = await Promise.all(
            batch.map(async (l) => {
              const id = l.tripadvisorLocationId!
              const r = await fetchTaAggregates(id)
              return [id, r] as const
            })
          )
          for (const [id, r] of results) reviewById.set(id, r)
        }
        // Grilles d'occupation, fiche par fiche, au navigateur.
        //
        // L'ordre compte : les fiches sont ouvertes de la moins chère à la plus
        // chère, parce que le plafond de `MAX_FICHES` coupe la queue de liste
        // et qu'il vaut mieux tronquer ce que l'utilisateur regardera en
        // dernier. Les annonces au-delà gardent le « à partir de » de la SERP,
        // leur capacité reste inconnue, et elles ne sont donc pas écartées à
        // tort — seulement pas encore vérifiées.
        const byPrice = [...priced].sort((a, b) => (a.total ?? 0) - (b.total ?? 0))
        const adults = params.adults ?? 2
        const children = params.children ?? 0
        const grids = await readFicheOccupancies(
          byPrice.map((l) => l.url ?? '').filter(Boolean),
          from,
          to,
          'CMB'
        )
        if (grids.skipped > 0) {
          debugLog('ceto-fiche', 'Number of listings left on the SERP price', {
            skipped: grids.skipped,
            cap: MAX_FICHES
          })
        }

        // Le connecteur **mesure**, il ne décide pas.
        //
        // Une annonce dont la grille ne peut pas loger le groupe est rapportée
        // quand même, avec sa capacité réelle et sans prix pour ce groupe : le
        // filtre de l'écran l'écarte alors sur `pers`, comme n'importe quelle
        // autre annonce trop petite.
        //
        // La jeter ici serait plus expéditif et c'est ce qu'on faisait, mais
        // ça avait deux défauts. Une annonce déjà enregistrée sous une capacité
        // fausse n'était plus jamais rapportée, donc plus jamais corrigée — elle
        // gardait à vie sa capacité inventée. Et l'utilisateur qui assouplit
        // ses critères ne la retrouvait pas, alors que la centrale, elle,
        // la propose.
        const offers = priced.map((l) => {
          const grid = l.url ? (grids.byUrl.get(l.url) ?? null) : null
          const groupPrice = grid ? priceForGroupIn(grid, adults + children) : null
          return toAccommodation(
            l,
            params,
            l.tripadvisorLocationId ? reviewById.get(l.tripadvisorLocationId) : null,
            grid,
            groupPrice
          )
        })

        if (offers.length === 0) {
          // Stock vide = réponse légitime, pas une panne
          breaker.succeed()
          return []
        }

        breaker.succeed()
        return offers
      } catch (err) {
        breaker.fail()
        throw err
      }
    },
    async health(): Promise<ProviderHealth> {
      return {
        name,
        reachable: !breaker.open,
        detail: breaker.open
          ? breaker.reason
          : 'Centrale Chamonix Mont-Blanc (Orchestra / Ceto) — SERP HTML + filtre village'
      }
    }
  }
}
