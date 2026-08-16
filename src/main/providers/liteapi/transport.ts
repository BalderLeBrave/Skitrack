/**
 * Les deux façons de joindre LiteAPI.
 *
 * ## Pourquoi une interface plutôt qu'un `if`
 *
 * Le REST et le serveur MCP de l'éditeur exposent la **même** charge utile : la
 * réponse de l'outil `post_hotels_rates` est, au caractère près, celle de
 * `POST /hotels/rates`. Vérifié le 2026-08-12 sur la même requête (Val Thorens,
 * 45.2967 / 6.5806, rayon 12 km, 6–13 février 2027) : les deux voies renvoient
 * la Résidence Koh-I Nor à 6 587,36 € pour deux adultes et sept nuits.
 *
 * Le mapping n'a donc aucune raison d'exister en deux exemplaires. Le transport
 * est isolé ici, le connecteur ignore lequel il utilise, et changer d'avis se
 * fait par un réglage plutôt que par une réécriture.
 *
 * ## Lequel choisir
 *
 * | | REST | MCP |
 * |---|---|---|
 * | Latence | un aller-retour | une poignée de main, puis un aller-retour |
 * | Dépendance | aucune | le serveur de l'éditeur, en plus de l'API |
 * | Intérêt | production | agents, et tout serveur MCP tiers à venir |
 *
 * **Le REST reste le défaut**, parce qu'un intermédiaire de plus est un point de
 * panne de plus pour un service rendu identique. Le transport MCP existe pour
 * deux raisons concrètes : il permet d'ouvrir le même moteur à d'autres serveurs
 * MCP le jour où une plateforme aujourd'hui fermée en publie un (voir
 * `mcp/mcpProvider.ts`), et il évite d'avoir à réécrire un connecteur quand
 * l'éditeur ajoute un point d'entrée : l'outil apparaît dans `tools/list`.
 */

import { McpClient, type McpServerConfig } from '../mcp/client'
import { withTimeout } from '../resilience'
import type { LiteApiRatesResponse } from './liteapi'

const REST_BASE = 'https://api.liteapi.travel/v3.0'
const MCP_URL = 'https://mcp.liteapi.travel/api/mcp'
const TIMEOUT_MS = 30_000

export interface LiteApiPlace {
  placeId: string
  displayName?: string
  formattedAddress?: string
}

export interface LiteApiTransport {
  readonly kind: 'rest' | 'mcp'
  /** Vrai quand la clé est une clé de bac à sable, à l'inventaire réduit. */
  readonly sandbox: boolean
  rates(body: Record<string, unknown>): Promise<LiteApiRatesResponse>
  places(query: string): Promise<LiteApiPlace[]>
}

/** Les clés de bac à sable se reconnaissent à leur préfixe, documenté par l'éditeur. */
export function isSandboxKey(apiKey: string): boolean {
  return /^(sand|sandbox)_/.test(apiKey)
}

export class LiteApiRestTransport implements LiteApiTransport {
  readonly kind = 'rest' as const
  readonly sandbox: boolean

  constructor(private readonly apiKey: string) {
    this.sandbox = isSandboxKey(apiKey)
  }

  private headers(withBody: boolean): Record<string, string> {
    return {
      'X-API-Key': this.apiKey,
      accept: 'application/json',
      ...(withBody ? { 'content-type': 'application/json' } : {})
    }
  }

  async rates(body: Record<string, unknown>): Promise<LiteApiRatesResponse> {
    const response = await withTimeout(
      fetch(`${REST_BASE}/hotels/rates`, {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify(body)
      }),
      TIMEOUT_MS,
      'liteapi/rates'
    )

    if (response.status === 429) throw new Error('LiteAPI : quota atteint (HTTP 429)')
    if (!response.ok && response.status !== 400) {
      const text = await response.text().catch(() => '')
      throw new Error(`LiteAPI : HTTP ${response.status} ${text.slice(0, 200)}`)
    }
    // Un 400 porte l'enveloppe `{ error: { code, message } }` : le connecteur
    // sait distinguer « aucune disponibilité » d'une vraie panne, à condition
    // qu'on lui laisse lire le corps au lieu de lever ici.
    return (await response.json()) as LiteApiRatesResponse
  }

  async places(query: string): Promise<LiteApiPlace[]> {
    const url = `${REST_BASE}/data/places?textQuery=${encodeURIComponent(query)}`
    const response = await withTimeout(
      fetch(url, { headers: this.headers(false) }),
      TIMEOUT_MS,
      'liteapi/places'
    )
    if (!response.ok) return []
    const payload = (await response.json()) as { data?: LiteApiPlace[] }
    return payload.data ?? []
  }
}

export class LiteApiMcpTransport implements LiteApiTransport {
  readonly kind = 'mcp' as const
  readonly sandbox: boolean

  private readonly client: McpClient

  constructor(apiKey: string, config?: Partial<McpServerConfig>) {
    this.sandbox = isSandboxKey(apiKey)
    this.client = new McpClient({
      name: 'liteapi',
      // La clé voyage en paramètre d'URL : c'est la forme imposée par
      // l'éditeur. Elle ne quitte jamais le processus main, et rien de tout
      // ceci n'est journalisé (voir `debug.ts`, qui masque `key` et `token`).
      url: `${MCP_URL}?apiKey=${encodeURIComponent(apiKey)}`,
      timeoutMs: TIMEOUT_MS,
      ...config
    })
  }

  async rates(body: Record<string, unknown>): Promise<LiteApiRatesResponse> {
    return this.client.callTool<LiteApiRatesResponse>('post_hotels_rates', body)
  }

  async places(query: string): Promise<LiteApiPlace[]> {
    const payload = await this.client.callTool<{ data?: LiteApiPlace[] }>('get_data_places', {
      textQuery: query
    })
    return payload?.data ?? []
  }

  /** Diagnostic : ce que le serveur déclare savoir faire. */
  async tools(): Promise<string[]> {
    return (await this.client.listTools()).map((tool) => tool.name)
  }
}

export type LiteApiTransportKind = 'rest' | 'mcp'

/** Fabrique le transport demandé, ou `null` si aucune clé n'est disponible. */
export function buildLiteApiTransport(
  apiKey: string | undefined,
  kind: LiteApiTransportKind = 'rest'
): LiteApiTransport | null {
  if (!apiKey) return null
  return kind === 'mcp' ? new LiteApiMcpTransport(apiKey) : new LiteApiRestTransport(apiKey)
}

/** Résout la clé : coffre d'abord, environnement ensuite — comme les autres. */
export function resolveLiteApiKey(
  vault: (key: string) => string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  return vault('liteapi_key') ?? env.LITEAPI_KEY
}

/** Transport voulu, par variable d'environnement. Le REST reste le défaut. */
export function resolveLiteApiTransportKind(
  env: NodeJS.ProcessEnv = process.env
): LiteApiTransportKind {
  return env.LITEAPI_TRANSPORT === 'mcp' ? 'mcp' : 'rest'
}
