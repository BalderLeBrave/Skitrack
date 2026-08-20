/**
 * Point de contact entre Electron et le comparateur.
 *
 * Toute la dépendance à Electron — coffre de clés, cycle de vie — est isolée
 * ici. La couche `providers/` reste pure : elle reçoit une fonction de lecture
 * de secrets et ne connaît ni `app`, ni `safeStorage`, ce qui permet de la
 * tester en Node nu (`npm run providers:test`).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { aggregateResults, buildEngine, rejectedMcpSources, type EngineOptions } from './providers'
import { providerMetricsSnapshot, resetProviderMetrics } from './providers/metrics'
import { closeWebscrapeBrowser } from './providers/webscrape'
import { setProxyVaultGetter } from './providers/proxy'
import { closeAirbnbBrowser } from './providers/airbnb/scrape'
import { MCP_SOURCES_TEMPLATE } from './providers/mcp/registry'
import type { SearchEngine } from './providers/searchEngine'
import type { AggregateResult, SearchParams } from './providers/types'
import { decryptAll } from './secrets'

let engine: SearchEngine | null = null

/**
 * Fichier des sources MCP déclarées par l'utilisateur.
 *
 * Créé vide, avec un gabarit commenté, au premier démarrage : découvrir la
 * fonctionnalité en ouvrant un fichier existant est plus probable que la
 * découvrir dans une documentation. Le gabarit est désactivé.
 */
export function mcpSourcesPath(): string {
  return join(app.getPath('userData'), 'mcp-sources.json')
}

function readMcpSources(): string | null {
  const path = mcpSourcesPath()
  try {
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, MCP_SOURCES_TEMPLATE, 'utf-8')
      return MCP_SOURCES_TEMPLATE
    }
    return readFileSync(path, 'utf-8')
  } catch {
    // Un fichier illisible ne doit pas empêcher les connecteurs intégrés de
    // fonctionner : on repart sans source déclarée.
    return null
  }
}

/**
 * `decryptAll()` déchiffre à la demande : aucune valeur n'est conservée ici, et
 * aucune ne traverse l'IPC.
 */
function options(): EngineOptions {
  setProxyVaultGetter((key) => decryptAll()[key])
  return {
    // Scrapers Playwright : SKITRACK_WEB_SCRAPE=0 pour désactiver.
    enableWebScrape: process.env.SKITRACK_WEB_SCRAPE !== '0',
    vault: (key: string) => decryptAll()[key],
    mcpSources: readMcpSources()
  }
}

function currentEngine(): SearchEngine {
  if (!engine) {
    engine = buildEngine(options())
    // Préchauffe Chromium en arrière-plan : le 1er relevé Ingénie évite
    // les 2–4 s de cold start. Silencieux si le scrape est désactivé.
    if (process.env.SKITRACK_WEB_SCRAPE !== '0') {
      void import('./providers/webscrape/shared')
        .then((m) => m.getScrapeContext(true))
        .catch(() => undefined)
    }
  }
  return engine
}

export function searchProviders(
  params: SearchParams,
  only?: string[],
  onOutcome?: (outcome: import('./providers/types').ProviderOutcome) => void
): Promise<AggregateResult> {
  return aggregateResults(currentEngine(), params, only, onOutcome)
}

/**
 * Diagnostic des connecteurs, sans lancer de recherche.
 *
 * `registered` distingue les deux populations que cette liste mêle : les
 * connecteurs **réellement enregistrés** dans le moteur, qui seront interrogés
 * au prochain relevé, et les sources déclarées puis **refusées**, qui ne le
 * seront jamais. L'écran Logements se sert des premiers pour annoncer ses
 * sources dès l'ouverture ; sans ce drapeau, une déclaration MCP fautive
 * viendrait s'afficher comme une source interrogeable.
 */
export async function providersHealth(): Promise<
  { name: string; reachable: boolean; detail: string; registered: boolean }[]
> {
  const health = await currentEngine().health()
  // Une source déclarée mais refusée n'apparaît nulle part ailleurs : sans cette
  // ligne, une faute de frappe dans mcp-sources.json serait parfaitement muette.
  return [
    ...health.map((entry) => ({ ...entry, registered: true })),
    ...rejectedMcpSources().map((entry) => ({
      name: entry.name,
      reachable: false,
      detail: `configuration refusée — ${entry.reason}`,
      registered: false
    }))
  ]
}

export function providersMetrics(): ReturnType<typeof providerMetricsSnapshot> {
  return providerMetricsSnapshot()
}

export function providersMetricsReset(): void {
  resetProviderMetrics()
}

export function disposeProviders(): void {
  void closeWebscrapeBrowser()
  void closeAirbnbBrowser()
  engine = null
}
