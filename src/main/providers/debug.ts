/**
 * Traces de connecteur, activées par `PROVIDER_DEBUG=true`.
 *
 * Rien n'est journalisé en dehors de ce mode. Les charges utiles brutes ne sont
 * jamais tracées : elles contiennent des adresses précises de biens, et une
 * trace se retrouve dans un fichier, une capture d'écran ou un rapport de bug.
 * On ne journalise que des compteurs, des durées et des critères de recherche.
 */

const SENSITIVE = /token|secret|key|password|cookie|authorization|email|adresse|address/i

export function debugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PROVIDER_DEBUG === 'true'
}

function redact(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE.test(key)) {
      out[key] = '«masqué»'
      continue
    }
    // Une chaîne longue est presque toujours une charge utile : on la borne.
    out[key] = typeof value === 'string' && value.length > 200 ? `${value.slice(0, 200)}…` : value
  }
  return out
}

export function debugLog(provider: string, event: string, payload?: Record<string, unknown>): void {
  if (!debugEnabled()) return
  const suffix = payload ? ` ${JSON.stringify(redact(payload))}` : ''
  console.log(`[${provider}] ${event}${suffix}`)
}
