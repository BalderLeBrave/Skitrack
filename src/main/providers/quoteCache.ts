/**
 * Cache process-local des devis datés.
 *
 * Clé = (source, id, check_in, check_out, guests). Un total d'une autre
 * semaine ou d'un autre groupe n'est jamais servi — c'est le défaut qui
 * affichait 1 330 € à la place de 4 261 €.
 *
 * TTL 20 min : assez court pour un changement de dispo, assez long pour
 * relancer la même recherche sans refaire 300 POST.
 */

export interface CachedQuote {
  total: number | null
  unavailable?: boolean
}

const QUOTE_TTL_MS = 20 * 60 * 1000
const store = new Map<string, { at: number; value: CachedQuote }>()

export function quoteCacheKey(
  source: string,
  id: string,
  checkIn: string,
  checkOut: string,
  guests: number
): string {
  return `${source}|${id}|${checkIn}|${checkOut}|${guests}`
}

export function getQuote(key: string): CachedQuote | undefined {
  const hit = store.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > QUOTE_TTL_MS) {
    store.delete(key)
    return undefined
  }
  return hit.value
}

export function setQuote(key: string, value: CachedQuote): void {
  store.set(key, { at: Date.now(), value })
}

export function quoteCacheSize(): number {
  return store.size
}

export function clearQuoteCache(): void {
  store.clear()
}
