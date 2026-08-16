/**
 * Assemblage du comparateur multi-sources.
 *
 * Chaque plateforme est traitée selon ce qui est *réellement* accessible :
 *
 *     liteapi            REST ou MCP            clé en libre service — seule source
 *                                               qui tarife sans accord partenaire
 *     booking            Demand API v3          clés requises
 *     expedia            EPS Rapid              clés requises, couvre Vrbo
 *     station            centrale de la station lue avec Playwright, voir station/
 *     gites-de-france    aucun accès            stub, avertit et renvoie []
 *     airbnb             aucune API             redirection seule, aucune requête
 *     «déclarées»        serveurs MCP tiers     lues dans mcp-sources.json
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
  createCozycozyWebProvider,
  createExpediaWebProvider,
  createGitesWebProvider
} from './webscrape'
import { BookingProvider, resolveBookingCredentials } from './booking/booking'
import { createStationProvider } from './station/station'
import { ExpediaProvider, resolveExpediaCredentials, type ExpediaBrand } from './expedia/expedia'
import { GitesDeFranceProvider } from './gites/gites'
import { LiteApiProvider } from './liteapi/liteapi'
import {
  buildLiteApiTransport,
  resolveLiteApiKey,
  resolveLiteApiTransportKind,
  type LiteApiTransportKind
} from './liteapi/transport'
import { McpAccommodationProvider } from './mcp/mcpProvider'
import { loadMcpProviderConfigs } from './mcp/registry'
import { SearchEngine } from './searchEngine'
import { debugLog } from './debug'
import type { AggregateResult, SearchParams } from './types'

export interface EngineOptions {
  /** Active les scrapers Playwright (Booking, Expedia, Gîtes, CozyCozy, centrales de station). */
  enableWebScrape?: boolean
  /** Lecture du coffre chiffré. Injectée pour rester testable sans Electron. */
  vault: (key: string) => string | undefined
  brands?: Partial<Record<ExpediaBrand, boolean>>
  /** Transport LiteAPI. Le REST reste le défaut ; voir liteapi/transport.ts. */
  liteApiTransport?: LiteApiTransportKind
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

  // La clé est relue à chaque appel plutôt que capturée : l'utilisateur peut la
  // saisir dans les Réglages sans redémarrer, et la recherche suivante en tient
  // compte. C'est aussi ce qui évite de garder un secret vivant en fermeture.
  const transportKind = options.liteApiTransport ?? resolveLiteApiTransportKind()
  next.register(
    new LiteApiProvider(
      () => buildLiteApiTransport(resolveLiteApiKey(options.vault), transportKind),
      { currency: options.currency, guestNationality: options.guestNationality }
    )
  )

  next.register(new BookingProvider(() => resolveBookingCredentials(options.vault)))
  next.register(
    new ExpediaProvider(() => resolveExpediaCredentials(options.vault), { brands: options.brands })
  )
  // Gîtes de France : le stub n'a d'intérêt que s'il est le seul chemin. Quand
  // le scraper web est actif, `gites-web` interroge réellement le site et le
  // stub ne ferait que doubler la source d'une ligne « aucun accès » perpétuelle
  // dans l'écran Sources.
  if (!options.enableWebScrape) next.register(new GitesDeFranceProvider())

  const { configs, rejected } = loadMcpProviderConfigs(options.mcpSources)
  lastRejectedMcpSources = rejected
  for (const config of configs) next.register(new McpAccommodationProvider(config))

  // Scrapers web (Playwright) — activés si enableWebScrape (bridge: SKITRACK_WEB_SCRAPE≠0).
  // Préférer les API Booking / Expedia / LiteAPI quand des clés sont présentes.
  if (options.enableWebScrape) {
    next.register(createBookingWebProvider())
    next.register(createExpediaWebProvider())
    next.register(createGitesWebProvider())
    next.register(createCozycozyWebProvider())
    // Centrale de réservation de la station : le seul connecteur qui interroge
    // le site du domaine lui-même, avec l'adresse que le renderer lui passe.
    next.register(createStationProvider())
  }

  // Airbnb n'est pas un connecteur : il n'interroge rien. Voir airbnb/airbnb.ts.
  return next
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
  only?: string[]
): Promise<AggregateResult> {
  const report = await engine.search(params, only)

  /** Prix comparable d'une offre, `null` si la source n'en donne pas d'exploitable. */
  const priceOf = (item: { totalPrice?: number; nightlyPrice?: number }): number | null =>
    item.totalPrice ?? item.nightlyPrice ?? null

  const listings = report.outcomes.flatMap((outcome) => outcome.results).sort((a, b) => {
    const left = priceOf(a)
    const right = priceOf(b)
    // Sans prix, on passe derrière — jamais devant avec un zéro implicite.
    if (left == null && right == null) return 0
    if (left == null) return 1
    if (right == null) return -1
    return left - right
  })

  debugLog('Aggregate', 'Number of deduplicated results', {
    listings: report.totalListings,
    properties: report.properties.length,
    errors: report.outcomes.filter((o) => o.error).length
  })

  return {
    listings,
    // Une seule redirection aujourd'hui ; la forme accepte les suivantes.
    redirects: [airbnbRedirect(params)],
    outcomes: report.outcomes,
    totalListings: report.totalListings
  }
}
