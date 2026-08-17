/**
 * Assemblage du comparateur multi-sources.
 *
 * Trois sources sont interrogées, et trois seulement :
 *
 *     booking            Demand API v3          clés requises, repli scraper web
 *     station            centrale de la station lue avec Playwright, voir station/
 *     airbnb             aucune API             relevé à part, voir airbnb/scrape.ts
 *     «déclarées»        serveurs MCP tiers     lues dans mcp-sources.json
 *
 * Expedia, Hotels.com, Gîtes de France, cozycozy et LiteAPI ont été retirés.
 * Les laisser enregistrés aurait suffi à les faire réapparaître comme lignes de
 * filtre par la réunion que fait `lodgingSources` côté renderer : une ligne
 * qu'aucun relevé ne peut rafraîchir n'est pas un filtre, c'est un souvenir.
 * `RESERVED` dans `mcp/registry.ts` garde leurs noms — ils restent réservés
 * pour qu'une source MCP déclarée ne puisse pas se faire passer pour eux.
 *
 * L'ordre d'enregistrement n'a aucune importance : les sources sont interrogées
 * en parallèle et le tri se fait sur le prix, pas sur la provenance.
 *
 * Le moteur est construit une fois et conservé : les connecteurs portent un
 * cache et un disjoncteur qu'on ne veut pas réinitialiser à chaque recherche.
 */

import { airbnbRedirect } from './airbnb/airbnb'
import { createBookingWebProvider } from './webscrape'
import { BookingProvider, resolveBookingCredentials } from './booking/booking'
import { createStationProvider } from './station/station'
import type { ExpediaBrand } from './expedia/expedia'
import type { LiteApiTransportKind } from './liteapi/transport'
import { McpAccommodationProvider } from './mcp/mcpProvider'
import { loadMcpProviderConfigs } from './mcp/registry'
import { SearchEngine } from './searchEngine'
import { debugLog } from './debug'
import type { AggregateResult, SearchParams } from './types'

export interface EngineOptions {
  /** Active les scrapers Playwright (Booking, centrales de station). */
  enableWebScrape?: boolean
  /** Lecture du coffre chiffré. Injectée pour rester testable sans Electron. */
  vault: (key: string) => string | undefined
  /** Conservés pour la compatibilité de l'appelant ; sans effet depuis le
   *  retrait des connecteurs Expedia et LiteAPI. */
  brands?: Partial<Record<ExpediaBrand, boolean>>
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
