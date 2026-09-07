/**
 * Garde-fous communs à tous les connecteurs.
 *
 * Le principe est qu'une source qui va mal ne doit jamais dégrader les autres :
 * le comparateur affiche ce qu'il a, dit ce qui manque, et n'attend pas
 * indéfiniment une réponse qui ne viendra pas.
 */

/** Un appel qui dépasse ce délai est abandonné, pas mis en file. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} : délai de ${ms} ms dépassé`)), ms)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Réessai à intervalle croissant.
 *
 * Volontairement court : au-delà de deux tentatives, on insiste sur un service
 * qui a déjà dit non deux fois. Un refus explicite (robots.txt, CGU) n'est
 * jamais réessayé — la réponse serait identique et l'insistance discourtoise.
 */
export async function withRetry<T>(
  task: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; retryable?: (error: unknown) => boolean } = {}
): Promise<T> {
  const attempts = options.attempts ?? 2
  const base = options.baseDelayMs ?? 600
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      const retryable = options.retryable ? options.retryable(error) : true
      if (!retryable || attempt === attempts - 1) break
      await new Promise((resolve) => setTimeout(resolve, base * 2 ** attempt))
    }
  }
  throw lastError
}

/**
 * Disjoncteur.
 *
 * Après `threshold` échecs consécutifs, la source est écartée pendant
 * `cooldownMs` : on cesse de l'interroger au lieu de faire attendre
 * l'utilisateur à chaque recherche pour une erreur déjà connue.
 */
export class CircuitBreaker {
  private failures = 0
  private openedAt = 0

  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 60_000
  ) {}

  get open(): boolean {
    if (this.failures < this.threshold) return false
    if (Date.now() - this.openedAt > this.cooldownMs) {
      // Fenêtre écoulée : on laisse repasser une tentative.
      this.failures = 0
      return false
    }
    return true
  }

  succeed(): void {
    this.failures = 0
  }

  fail(): void {
    this.failures++
    if (this.failures >= this.threshold) this.openedAt = Date.now()
  }

  get reason(): string {
    const remaining = Math.max(0, this.cooldownMs - (Date.now() - this.openedAt))
    return `source écartée après ${this.failures} échecs — nouvelle tentative dans ${Math.ceil(remaining / 1000)} s`
  }
}

/** Cache mémoire à durée de vie, suffisant pour une application de bureau. */
export class TtlCache<T> {
  private entries = new Map<string, { value: T; expiresAt: number }>()

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const hit = this.entries.get(key)
    if (!hit) return undefined
    if (Date.now() > hit.expiresAt) {
      this.entries.delete(key)
      return undefined
    }
    return hit.value
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  clear(): void {
    this.entries.clear()
  }
}

/** Espace les appels sortants d'un même connecteur. */
export class RateLimiter {
  private last = 0
  private chain: Promise<void> = Promise.resolve()

  constructor(private readonly minIntervalMs: number) {}

  acquire(): Promise<void> {
    this.chain = this.chain.then(async () => {
      const wait = this.minIntervalMs - (Date.now() - this.last)
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      this.last = Date.now()
    })
    return this.chain
  }
}
