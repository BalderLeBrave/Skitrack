/**
 * Moteur de recherche multi-sources.
 *
 * Interroge les connecteurs **en parallèle** et isole leurs échecs : une source
 * en panne, refusée ou non configurée produit une entrée d'erreur, jamais une
 * exception qui viderait tout le résultat. C'est la propriété la plus
 * importante du fichier — un comparateur qui n'affiche rien parce qu'une source
 * sur cinq est tombée ne sert à rien.
 */

import { deduplicate, type Property } from './dedup'
import { debugLog } from './debug'
import { recordProviderOutcome } from './metrics'
import type { AccommodationProvider, ProviderOutcome, SearchParams } from './types'
import { paginationOfList } from '@shared/reasonCodes'

export interface SearchReport {
  properties: Property[]
  outcomes: ProviderOutcome[]
  /** Nombre d'annonces avant regroupement, toutes sources confondues. */
  totalListings: number
}

export class SearchEngine {
  private readonly providers = new Map<string, AccommodationProvider>()

  register(provider: AccommodationProvider): void {
    this.providers.set(provider.name, provider)
  }

  get names(): string[] {
    return [...this.providers.keys()]
  }

  get(name: string): AccommodationProvider | undefined {
    return this.providers.get(name)
  }

  /**
   * Interroge les sources en parallèle.
   *
   * `onOutcome` est appelé **dès qu'une source répond** (succès ou erreur),
   * avant la fin du `Promise.all`. L'UI peut ainsi afficher les premières
   * offres sans attendre le connecteur le plus lent.
   */
  async search(
    params: SearchParams,
    only?: string[],
    onOutcome?: (outcome: ProviderOutcome) => void
  ): Promise<SearchReport> {
    const selected = [...this.providers.values()].filter((p) => !only || only.includes(p.name))

    const outcomes = await Promise.all(
      selected.map(async (provider): Promise<ProviderOutcome> => {
        const started = Date.now()
        let outcome: ProviderOutcome
        try {
          const results = await provider.search(params)
          outcome = {
            provider: provider.name,
            results,
            error: null,
            elapsedMs: Date.now() - started,
            pagination: paginationOfList(results)
          }
        } catch (error) {
          // Chaque source encaisse son erreur seule.
          outcome = {
            provider: provider.name,
            results: [],
            error: error instanceof Error ? error.message : String(error),
            elapsedMs: Date.now() - started
          }
        }
        try {
          recordProviderOutcome({
            provider: outcome.provider,
            elapsedMs: outcome.elapsedMs,
            error: outcome.error,
            results: outcome.results
          })
        } catch {
          // métriques non critiques
        }
        try {
          onOutcome?.(outcome)
        } catch {
          // Un callback UI cassé ne doit pas faire échouer la recherche.
        }
        return outcome
      })
    )

    const listings = outcomes.flatMap((o) => o.results)
    const properties = deduplicate(listings)

    debugLog('SearchEngine', 'Number of deduplicated results', {
      listings: listings.length,
      properties: properties.length,
      errors: outcomes.filter((o) => o.error).length
    })

    return { properties, outcomes, totalListings: listings.length }
  }

  async health(): Promise<{ name: string; reachable: boolean; detail: string }[]> {
    return Promise.all(
      [...this.providers.values()].map(async (provider) => {
        if (!provider.health) return { name: provider.name, reachable: true, detail: 'pas de diagnostic' }
        try {
          return await provider.health()
        } catch (error) {
          return { name: provider.name, reachable: false, detail: (error as Error).message }
        }
      })
    )
  }
}
