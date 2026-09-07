/**
 * Client MCP minimal — transport « Streamable HTTP ».
 *
 * ## Pourquoi un client écrit à la main
 *
 * Le SDK officiel `@modelcontextprotocol/sdk` tire une arborescence de
 * dépendances entière dans le processus **main** d'Electron, celui qui a les
 * privilèges du système de fichiers et du coffre de clés. Ce qu'on utilise
 * réellement d'un serveur MCP côté logement tient en trois appels — `initialize`,
 * `tools/list`, `tools/call` — et en un décodage d'événements SSE. Le rapport
 * surface d'attaque / valeur ajoutée ne justifie pas le SDK.
 *
 * ## Ce que le transport impose
 *
 * Un serveur « Streamable HTTP » répond à un POST JSON-RPC soit par un
 * `application/json` classique, soit par un flux `text/event-stream` contenant
 * la même enveloppe. Les deux formes doivent être acceptées : le serveur choisit,
 * pas le client. `mcp.liteapi.travel` répond en SSE même pour une requête
 * unitaire — vérifié le 2026-08-12.
 *
 * Un `mcp-session-id` peut être renvoyé à l'`initialize` ; il est alors
 * obligatoire sur les requêtes suivantes. Les serveurs sans état n'en renvoient
 * pas, et ce client fonctionne dans les deux cas.
 *
 * ## Ce que ce client ne fait pas
 *
 * Ni `notifications/*` entrantes, ni `resources`, ni `prompts`, ni transport
 * stdio. Un serveur MCP local en sous-processus est une autre décision, avec
 * d'autres conséquences de sécurité (exécution de code tiers sur le poste) :
 * elle n'est pas prise ici.
 */

import { withTimeout } from '../resilience'

export interface McpServerConfig {
  /** Nom court, utilisé en préfixe de connecteur et dans les diagnostics. */
  name: string
  /** URL du point d'entrée MCP. La clé d'API y figure souvent en paramètre. */
  url: string
  /** En-têtes additionnels — `Authorization` pour les serveurs qui l'exigent. */
  headers?: Record<string, string>
  timeoutMs?: number
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: number | string
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface ToolCallResult {
  content?: { type: string; text?: string }[]
  structuredContent?: unknown
  isError?: boolean
}

const DEFAULT_TIMEOUT_MS = 30_000
const PROTOCOL_VERSION = '2025-06-18'

/**
 * Extrait les enveloppes JSON-RPC d'un corps `text/event-stream`.
 *
 * **Fonction pure**, exportée pour être testée sans réseau : c'est le seul
 * endroit où un changement de mise en forme du serveur peut casser le client.
 * Les lignes `data:` multiples d'un même événement se concaténent avec un saut
 * de ligne, conformément à la spécification SSE ; les commentaires (`:`) et les
 * champs `event:` / `id:` sont ignorés, le protocole ne s'en sert pas.
 */
export function parseSseMessages(body: string): JsonRpcResponse[] {
  const messages: JsonRpcResponse[] = []
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (!data) continue
    try {
      messages.push(JSON.parse(data) as JsonRpcResponse)
    } catch {
      // Un fragment illisible ne doit pas faire perdre les événements valides
      // qui l'entourent : le flux peut être tronqué en fin de réponse.
    }
  }
  return messages
}

/**
 * Retrouve le texte utile d'un `tools/call`.
 *
 * Un serveur MCP qui enveloppe une API REST renvoie presque toujours la charge
 * utile JSON **sérialisée dans un bloc texte**. On préfère `structuredContent`
 * quand il existe — c'est la forme normalisée, sans double encodage.
 */
export function extractToolPayload(result: ToolCallResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent

  const text = (result.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('')

  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    // Certains serveurs répondent en texte libre. On le remonte tel quel plutôt
    // que d'échouer : l'appelant sait ce qu'il attendait.
    return text
  }
}

export class McpClient {
  private sessionId: string | null = null
  private handshake: Promise<void> | null = null
  private nextId = 1

  constructor(private readonly config: McpServerConfig) {}

  get name(): string {
    return this.config.name
  }

  /**
   * Poignée de main, faite **une seule fois** et partagée par tous les appels
   * concurrents : `this.handshake` mémorise la promesse plutôt que le résultat,
   * ce qui évite deux `initialize` simultanés au premier chargement d'écran.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.handshake) {
      this.handshake = this.request('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'SKITRACK', version: '0.1.0' }
      })
        .then(async () => {
          // Notification sans identifiant : le serveur ne répond rien.
          await this.notify('notifications/initialized')
        })
        .catch((error) => {
          // Un échec ne doit pas figer le client dans un état « initialisé » :
          // on remet à zéro pour qu'une recherche ultérieure réessaie.
          this.handshake = null
          throw error
        })
    }
    return this.handshake
  }

  private async post(payload: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL_VERSION,
      ...this.config.headers
    }
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId

    return withTimeout(
      fetch(this.config.url, { method: 'POST', headers, body: JSON.stringify(payload) }),
      this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      `mcp/${this.config.name}`
    )
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    const response = await this.post({ jsonrpc: '2.0', method, params: params ?? {} })
    // 202 attendu, mais un serveur sans état peut répondre 200 : les deux vont.
    if (!response.ok && response.status !== 202) {
      throw new Error(`MCP ${this.config.name} : notification refusée (HTTP ${response.status})`)
    }
    await response.text().catch(() => '')
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++
    const response = await this.post({ jsonrpc: '2.0', id, method, params })

    const session = response.headers.get('mcp-session-id')
    if (session) this.sessionId = session

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `MCP ${this.config.name} : accès refusé (HTTP ${response.status}). Clé d’API absente, expirée ou hors environnement (bac à sable / production).`
      )
    }
    if (response.status === 429) {
      throw new Error(`MCP ${this.config.name} : quota atteint (HTTP 429)`)
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`MCP ${this.config.name} : HTTP ${response.status} ${body.slice(0, 200)}`)
    }

    const body = await response.text()
    const contentType = response.headers.get('content-type') ?? ''

    const messages = contentType.includes('text/event-stream')
      ? parseSseMessages(body)
      : [JSON.parse(body) as JsonRpcResponse]

    const answer = messages.find((message) => message.id === id) ?? messages.at(-1)
    if (!answer) throw new Error(`MCP ${this.config.name} : réponse vide pour ${method}`)
    if (answer.error) {
      throw new Error(`MCP ${this.config.name} : ${answer.error.message} (code ${answer.error.code})`)
    }
    return answer.result
  }

  async listTools(): Promise<McpTool[]> {
    await this.ensureInitialized()
    const result = (await this.request('tools/list', {})) as { tools?: McpTool[] }
    return result.tools ?? []
  }

  /**
   * Appelle un outil et rend sa charge utile décodée.
   *
   * `isError` est une erreur **applicative** — l'outil a répondu, mais mal. Elle
   * est convertie en exception parce que l'appelant attend des données : lui
   * rendre un objet d'erreur silencieux produirait une liste vide sans motif,
   * exactement ce que le moteur de recherche cherche à éviter.
   */
  async callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    await this.ensureInitialized()
    const result = (await this.request('tools/call', { name, arguments: args })) as ToolCallResult
    const payload = extractToolPayload(result)
    if (result.isError) {
      const detail = typeof payload === 'string' ? payload : JSON.stringify(payload)
      throw new Error(`MCP ${this.config.name}/${name} : ${detail?.slice(0, 300)}`)
    }
    return payload as T
  }

  /** Réinitialise la session — utile après un changement de clé d'API. */
  reset(): void {
    this.sessionId = null
    this.handshake = null
  }
}
