/**
 * Cache des devis datés.
 *
 * Clé = (source, id, check_in, check_out, guests). Un total d'une autre
 * semaine ou d'un autre groupe n'est jamais servi — c'est le défaut qui
 * affichait 1 330 € à la place de 4 261 €.
 *
 * Mémoire + fichier userData (survit au redémarrage). TTL 20 min.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

export interface CachedQuote {
  total: number | null
  unavailable?: boolean
}

const QUOTE_TTL_MS = 20 * 60 * 1000
const store = new Map<string, { at: number; value: CachedQuote }>()
let loaded = false
let persistTimer: ReturnType<typeof setTimeout> | null = null

function persistPath(): string | null {
  try {
    return join(app.getPath('userData'), 'quote-cache.json')
  } catch {
    return null
  }
}

function hydrate(): void {
  if (loaded) return
  loaded = true
  const file = persistPath()
  if (!file || !existsSync(file)) return
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<
      string,
      { at: number; value: CachedQuote }
    >
    const now = Date.now()
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v.at === 'number' && now - v.at <= QUOTE_TTL_MS) store.set(k, v)
    }
  } catch {
    /* fichier illisible : on repart vide */
  }
}

function schedulePersist(): void {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    const file = persistPath()
    if (!file) return
    try {
      mkdirSync(dirname(file), { recursive: true })
      const dump: Record<string, { at: number; value: CachedQuote }> = {}
      const now = Date.now()
      for (const [k, v] of store) {
        if (now - v.at <= QUOTE_TTL_MS) dump[k] = v
      }
      writeFileSync(file, JSON.stringify(dump))
    } catch {
      /* disque plein / sandbox : le cache mémoire reste */
    }
  }, 400)
}

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
  hydrate()
  const hit = store.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > QUOTE_TTL_MS) {
    store.delete(key)
    return undefined
  }
  return hit.value
}

export function setQuote(key: string, value: CachedQuote): void {
  hydrate()
  store.set(key, { at: Date.now(), value })
  schedulePersist()
}

export function quoteCacheSize(): number {
  hydrate()
  return store.size
}

export function clearQuoteCache(): void {
  store.clear()
  loaded = true
  const file = persistPath()
  if (file && existsSync(file)) {
    try {
      writeFileSync(file, '{}')
    } catch {
      /* ignore */
    }
  }
}
