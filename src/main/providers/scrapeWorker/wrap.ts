/**
 * Enveloppe un connecteur local : si le worker isolé répond, on l’utilise ;
 * sinon on reste dans le process (Docker éteint = comportement d’avant).
 */

import { debugLog } from '../debug'
import type { AccommodationProvider, ProviderHealth, SearchParams } from '../types'
import { resolveWorkerBase, scrapeDockerRequired, searchLodgingOnWorker } from './client'

export function withOptionalWorker(provider: AccommodationProvider): AccommodationProvider {
  return {
    name: provider.name,
    async search(params: SearchParams) {
      const base = await resolveWorkerBase(provider.name)
      if (base) {
        try {
          debugLog(provider.name, 'worker', { base })
          return await searchLodgingOnWorker(base, params)
        } catch (err) {
          if (scrapeDockerRequired()) throw err
          debugLog(provider.name, 'worker-repli-local', {
            error: err instanceof Error ? err.message : String(err)
          })
        }
      }
      return provider.search(params)
    },
    async health(): Promise<ProviderHealth> {
      const base = await resolveWorkerBase(provider.name)
      if (base) {
        return {
          name: provider.name,
          reachable: true,
          detail: `relevé isolé (${base})`
        }
      }
      return (
        (await provider.health?.()) ?? {
          name: provider.name,
          reachable: true,
          detail: 'relevé local (Playwright du process)'
        }
      )
    }
  }
}
