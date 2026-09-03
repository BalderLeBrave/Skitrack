/**
 * Assemblage du comparateur multi-sources.
 *
 * Les sources interrogées :
 *
 *     booking            Demand API v3          clés requises, repli scraper web
 *     booking-web        relevé Playwright      pagination, 30 pages / 750 biens
 *     gites-web          relevé Playwright      Gîtes de France
 *     vrbo-web           relevé Playwright      Abritel (via getResultList)
 *     station            centrale de la station lue avec Playwright, voir station/
 *     ceto-* / ublo / opensystem                 prestataires de centrales
 *     airbnb             aucune API             relevé à part, voir airbnb/scrape.ts
 *     «déclarées»        serveurs MCP tiers     lues dans mcp-sources.json
 *
 * ## Gîtes de France et VRBO, rebranchés le 2026-09-01
 *
 * CozyCozy n'est plus une source : agrégateur Airbnb / Booking / Gîtes, doublon.
 * Tourinsoft n'est plus une source : tarif « à partir de », pas un séjour daté.
 * Abritel se lit encore via getResultList (abritel.fr = 429), mais les
 * cartes sortent étiquetées Abritel, jamais CozyCozy.
 *
 * L'ordre d'enregistrement n'a aucune importance : les sources sont interrogées
 * en parallèle et le tri se fait sur le prix, pas sur la provenance.
 *
 * Le moteur est construit une fois et conservé : les connecteurs portent un
 * cache et un disjoncteur qu'on ne veut pas réinitialiser à chaque recherche.
 */

import { airbnbRedirect } from './airbnb/airbnb'
import {
  createBookingWebProvider,
  createGitesWebProvider,
  createVrboWebProvider
} from './webscrape'
import { BookingProvider, resolveBookingCredentials } from './booking/booking'
import { createStationProvider } from './station/station'
import { createCetoChamonixProvider } from './ceto/chamonix'
import { createCetoMeribelProvider } from './ceto/meribel'
import { createCetoPlagneProvider } from './ceto/plagne'
import { createCetoMegeveProvider } from './ceto/megeve'
import { createUbloProvider } from './ublo/provider'
import { createOpenSystemProvider } from './opensystem/provider'
import { createDesklineProvider } from './deskline/provider'
import { createLocvacancesProvider } from './locvacances/provider'
import { createDiffusioProvider } from './diffusio/provider'
import { McpAccommodationProvider } from './mcp/mcpProvider'
import { loadMcpProviderConfigs } from './mcp/registry'
import { SearchEngine } from './searchEngine'
import { debugLog } from './debug'
import type { AggregateResult, ProviderOutcome, SearchParams } from './types'
import { OUT_OF_ZONE_MARGIN_KM, coordsUsable, filterToZone, searchZone } from '@shared/geo'
import { type PaginationReport, type ReasonCode, type StoppedReason } from '@shared/reasonCodes'
import { SEARCH_WALK, formatStationRun } from '@shared/searchWalk'
import { centralsLoaded, emptyProviderReason } from './station/centralLookup'

export interface EngineOptions {
  /** Active les scrapers Playwright (Booking, centrales de station). */
  enableWebScrape?: boolean
  /** Lecture du coffre chiffré. Injectée pour rester testable sans Electron. */
  vault: (key: string) => string | undefined
  /** Contenu brut de `mcp-sources.json`, lu par l'appelant. */
  mcpSources?: string | null
  /** Devise et nationalité du voyageur : elles changent les tarifs affichés. */
  currency?: string
  guestNationality?: string
}

/** Sources MCP déclarées rejetées au dernier montage, pour l'écran Sources. */
let lastRejectedMcpSources: { name: string; reason: string }[] = []

export function rejectedMcpSources(): { name: string; reason: string }[] {
  return lastRejectedMcpSources
}

export function buildEngine(options: EngineOptions): SearchEngine {
  const next = new SearchEngine()

  // Les clés sont relues à chaque appel plutôt que capturées : l'utilisateur
  // peut les saisir dans les Réglages sans redémarrer, et la recherche suivante
  // en tient compte. C'est aussi ce qui évite de garder un secret vivant en
  // fermeture.
  next.register(new BookingProvider(() => resolveBookingCredentials(options.vault)))

  const { configs, rejected } = loadMcpProviderConfigs(options.mcpSources)
  lastRejectedMcpSources = rejected
  for (const config of configs) next.register(new McpAccommodationProvider(config))

  // Scrapers web (Playwright) — activés si enableWebScrape (bridge: SKITRACK_WEB_SCRAPE≠0).
  // Préférer l'API Booking quand des clés sont présentes.
  if (options.enableWebScrape) {
    next.register(createBookingWebProvider())
    // Trois connecteurs qui existaient, exportés, et que personne n'appelait :
    // le code était complet, seul l'enregistrement manquait. Voir l'en-tête.
    next.register(createGitesWebProvider())
    next.register(createVrboWebProvider())
    // Centrale de réservation de la station : le seul connecteur qui interroge
    // le site du domaine lui-même, avec l'adresse que le renderer lui passe.
    next.register(createStationProvider())
    // Orchestra / Ceto — Chamonix (hors Ingénie). Actif seulement si
    // officialUrl pointe vers booking.chamonix.com.
    next.register(createCetoChamonixProvider())
    next.register(createCetoMeribelProvider())
    next.register(createCetoPlagneProvider())
    next.register(createCetoMegeveProvider())
    next.register(createUbloProvider())
    next.register(createOpenSystemProvider())
    next.register(createDesklineProvider())
    next.register(createLocvacancesProvider())
    next.register(createDiffusioProvider())
  }

  // Airbnb n'est pas un connecteur : il n'interroge rien. Voir airbnb/airbnb.ts.
  return next
}

/**
 * Rayon de recherche par défaut, en mètres, quand l'appelant n'en donne pas.
 *
 * Volontairement modeste : mieux vaut manquer un hameau d'accès que ramener la
 * vallée entière. L'appelant qui connaît la taille du domaine passe son propre
 * rayon — voir `domainRadiusKm` dans `@shared/geo`.
 */
const DEFAULT_RADIUS_M = 12_000

/**
 * Écarte les résultats hors de la zone du domaine, source par source.
 *
 * C'est le filet de sécurité du comparateur, et il est posé ici plutôt que dans
 * chaque connecteur pour une raison simple : la plupart des sources ne savent
 * pas chercher autrement que par un nom, et un nom de station française a des
 * homonymes — d'autres communes, d'autres régions, d'autres pays. Une réponse
 * hors zone n'est donc pas une anomalie de connecteur mais la réponse normale à
 * une question ambiguë. La question est resserrée en amont quand la source
 * l'accepte ; ce qui passe malgré tout est arrêté ici.
 *
 * Le filtre s'applique aux `outcomes` et pas seulement à la liste finale : le
 * compte par source affiché à l'utilisateur doit être celui des offres qu'il
 * verra, pas celui des offres reçues.
 */
function keepInZone(outcomes: ProviderOutcome[], params: SearchParams): ProviderOutcome[] {
  if (!coordsUsable(params.latitude, params.longitude)) return outcomes

  const zone = searchZone(
    params.latitude as number,
    params.longitude as number,
    (params.radiusMeters ?? DEFAULT_RADIUS_M) / 1000
  )

  let rejected = 0
  let unlocated = 0
  const filtered = outcomes.map((outcome) => {
    const result = filterToZone(outcome.results, zone, (item) => ({
      lat: item.latitude,
      lon: item.longitude
    }))
    if (result.rejected.length > 0) {
      debugLog('Zone', 'Number of out-of-zone results', {
        provider: outcome.provider,
        rejected: result.rejected.length,
        // Les trois premiers rejets nommés : un compte seul ne dit pas *quoi*
        // la source a cru comprendre, et c'est cela qu'on veut lire au premier
        // signalement d'un logement à l'autre bout du pays.
        examples: result.rejected.slice(0, 3).map((r) => `${r.title} (${r.city ?? '?'})`)
      })
    }

    /**
     * Le sort des offres sans position suit celui du lot.
     *
     * `filterToZone` les garde, et c'est le bon défaut : toutes les sources ne
     * publient pas de coordonnées, et écarter une offre parce qu'elle se tait
     * reviendrait à punir le silence. Mais lorsque les offres **situées** de la
     * même source sont majoritairement ailleurs, le silence n'est plus le
     * sujet : la source a compris une autre commune, et les muettes viennent du
     * même endroit que les autres. C'est ainsi qu'on a vu des appartements
     * d'Arcachon proposés pour Arc 2000 — ceux qui ne publiaient pas leur
     * position passaient le filtre.
     *
     * Le test se fait **par source**, jamais sur l'agrégat : une source égarée
     * ne doit pas faire écarter les offres muettes d'une source juste.
     */
    const situees = result.kept.filter((r) => coordsUsable(r.latitude, r.longitude))
    const egaree = result.rejected.length > 0 && situees.length < result.rejected.length
    if (egaree && situees.length < result.kept.length) {
      debugLog('Zone', 'Provider considered off-target', {
        provider: outcome.provider,
        inZone: situees.length,
        outOfZone: result.rejected.length,
        droppedUnlocated: result.kept.length - situees.length
      })
    }
    const kept = egaree ? situees : result.kept

    rejected += result.rejected.length + (result.kept.length - kept.length)
    unlocated += result.unlocated
    return { ...outcome, results: kept }
  })

  debugLog('Zone', 'Number of results kept in zone', {
    centre: `${zone.lat.toFixed(4)},${zone.lon.toFixed(4)}`,
    radiusKm: zone.radiusKm,
    marginKm: OUT_OF_ZONE_MARGIN_KM,
    kept: filtered.reduce((n, o) => n + o.results.length, 0),
    rejected,
    // Retenus sans position publiée : ni validés ni rejetés, et il faut le
    // savoir avant de conclure que la zone est propre.
    unlocated
  })

  return filtered
}

function paginationFromResults(results: ProviderOutcome['results']): PaginationReport | undefined {
  if (results.length === 0) return undefined
  const pages = new Set(
    results
      .map((r) => r.searchPageIndex)
      .filter((n): n is number => typeof n === 'number')
  )
  const pagesFetched = pages.size || 1
  let stoppedReason: StoppedReason = 'exhausted'
  if (results.length >= SEARCH_WALK.maxListings) stoppedReason = 'max_listings'
  else if (pagesFetched >= SEARCH_WALK.maxPages) stoppedReason = 'max_pages'
  return {
    pagesFetched,
    listingsFound: results.length,
    listingsDeduped: results.length,
    stoppedReason
  }
}

function annotateOutcome(outcome: ProviderOutcome, params: SearchParams): ProviderOutcome {
  // Le walk (collectPages) est la vérité. Reconstruire depuis les cartes
  // *après* keepInZone faisait 25 listings / 1 page / exhausted alors que
  // d'autres pages avaient été lues (ou tentées). Live 2 Alpes 2027-02-13.
  const pagination = outcome.pagination ?? paginationFromResults(outcome.results)

  let reasonCode: ReasonCode
  if (outcome.results.length > 0) reasonCode = 'ok'
  else reasonCode = emptyProviderReason(outcome.provider, params.officialUrl, outcome.error)

  return { ...outcome, reasonCode, pagination }
}

/**
 * Recherche agrégée.
 *
 * Les sources sont interrogées en parallèle et **chaque échec reste local** :
 * `SearchEngine` encapsule déjà le `try/catch` par connecteur, ce qui donne la
 * sémantique de `Promise.allSettled` tout en conservant le motif d'erreur, que
 * l'interface affiche source par source.
 *
 * Le tri est croissant sur le prix, avec une règle explicite : **les offres
 * sans prix exploitable passent après**, jamais devant, et jamais avec un zéro
 * implicite qui les ferait remonter en tête.
 */
export async function aggregateResults(
  engine: SearchEngine,
  params: SearchParams,
  only?: string[],
  onOutcome?: (outcome: ProviderOutcome) => void
): Promise<AggregateResult> {
  const report = await engine.search(params, only, (raw) => {
    if (!onOutcome) return
    // Même filet de zone que le résultat final, appliqué source par source.
    const [filtered] = keepInZone([raw], params)
    onOutcome(annotateOutcome(filtered, params))
  })
  const outcomes = keepInZone(report.outcomes, params).map((o) => annotateOutcome(o, params))

  const stationRun = formatStationRun(params, outcomes.map((o) => ({
    provider: o.provider,
    fetched: o.pagination?.listingsFound ?? o.results.length,
    parsed: o.results.length,
    shown: o.results.length,
    pages_fetched: o.pagination?.pagesFetched ?? (o.results.length > 0 ? 1 : 0),
    stopped_reason: o.pagination?.stoppedReason,
    reason_code: o.reasonCode,
    error: o.error
  })))
  debugLog('station_run', 'walk', {
    station: stationRun.station,
    sources: stationRun.sources.map((s) => `${s.provider}:${s.pages_fetched}p/${s.parsed} ${s.fork ?? s.reason_code ?? ''}`)
  })
  console.info('[SKITRACK] station_run', JSON.stringify(stationRun))

  /** Prix comparable d'une offre, `null` si la source n'en donne pas d'exploitable. */
  const priceOf = (item: { totalPrice?: number; nightlyPrice?: number }): number | null =>
    item.totalPrice ?? item.nightlyPrice ?? null

  const listings = outcomes.flatMap((outcome) => outcome.results).sort((a, b) => {
    const left = priceOf(a)
    const right = priceOf(b)
    // Sans prix, on passe derrière — jamais devant avec un zéro implicite.
    if (left == null && right == null) return 0
    if (left == null) return 1
    if (right == null) return -1
    return left - right
  })

  debugLog('Aggregate', 'Number of deduplicated results', {
    listings: listings.length,
    properties: report.properties.length,
    errors: outcomes.filter((o) => o.error).length,
    centrals: centralsLoaded(),
    reasons: outcomes.map((o) => `${o.provider}:${o.reasonCode ?? '?'}`)
  })

  return {
    listings,
    // Une seule redirection aujourd'hui ; la forme accepte les suivantes.
    redirects: [airbnbRedirect(params)],
    outcomes,
    // Le total annoncé est celui des offres rendues, pas celui des offres
    // reçues : un compte qui inclurait les rejets hors zone décrirait une liste
    // que personne ne voit.
    totalListings: listings.length
  }
}
