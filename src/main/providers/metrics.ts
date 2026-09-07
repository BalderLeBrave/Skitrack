/**
 * Compteurs par source — latence, offres, prix, erreurs.
 * Visibles dans Réglages sans ouvrir la console.
 */

export interface SourceMetric {
  provider: string
  calls: number
  errors: number
  totalMs: number
  /** Offres renvoyées (cumul). */
  results: number
  /** Offres avec prix > 0. */
  priced: number
  lastError: string | null
  lastAt: string | null
}

const store = new Map<string, SourceMetric>()

function ensure(provider: string): SourceMetric {
  let m = store.get(provider)
  if (!m) {
    m = {
      provider,
      calls: 0,
      errors: 0,
      totalMs: 0,
      results: 0,
      priced: 0,
      lastError: null,
      lastAt: null
    }
    store.set(provider, m)
  }
  return m
}

export function recordProviderOutcome(input: {
  provider: string
  elapsedMs: number
  error: string | null
  results: { totalPrice?: number | null }[]
}): void {
  const m = ensure(input.provider)
  m.calls += 1
  m.totalMs += Math.max(0, input.elapsedMs)
  m.lastAt = new Date().toISOString()
  if (input.error) {
    m.errors += 1
    m.lastError = input.error.slice(0, 200)
  } else {
    m.lastError = null
  }
  m.results += input.results.length
  m.priced += input.results.filter((r) => r.totalPrice != null && r.totalPrice > 0).length
}

export function providerMetricsSnapshot(): SourceMetric[] {
  return [...store.values()]
    .map((m) => ({
      ...m,
      avgMs: m.calls > 0 ? Math.round(m.totalMs / m.calls) : 0,
      priceRate: m.results > 0 ? Math.round((m.priced / m.results) * 100) : null
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider)) as SourceMetric[]
}

export function resetProviderMetrics(): void {
  store.clear()
}
