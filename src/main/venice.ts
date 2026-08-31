/**
 * Accès à Venice AI — complétion de conversation.
 *
 * ## Pourquoi pas de SDK
 *
 * Venice expose une API compatible OpenAI. Le seul appel dont le projet a
 * besoin, `POST /chat/completions`, tient en une requête `fetch` : ajouter
 * le paquet `openai` ferait entrer un SDK complet, son arbre de dépendances
 * et son cycle de mises à jour dans un binaire Electron, pour un gain nul.
 * Si un jour le streaming ou les appels d'outils sont nécessaires, ce module
 * est le seul point à remplacer.
 *
 * ## La clé
 *
 * `VENICE_API_KEY`, lue dans l'environnement **au moment de l'appel** — pas à
 * l'import, pour que le chargement du `.env` puisse venir après celui du
 * module. Elle n'est jamais écrite en dur, jamais journalisée, et les messages
 * d'erreur ne reprennent que le corps de la réponse, jamais l'en-tête envoyé.
 *
 * ## La règle qui ne bouge pas
 *
 * **Un appel en échec ne produit aucun texte.** Ni repli, ni réponse plausible,
 * ni message vide déguisé en succès : une exception, avec le motif. C'est le
 * même invariant que `providers/types.ts` — au pire, ce module ne rapporte rien.
 */

/** Base de l'API. Surchargeable par `VENICE_BASE_URL` pour viser un proxy. */
const DEFAULT_BASE_URL = 'https://api.venice.ai/api/v1'
/** GLM 5.2 — le modèle retenu par défaut pour ce projet. */
const DEFAULT_MODEL = 'zai-org-glm-5-2'
/** Au-delà, l'API est considérée injoignable : on ne fait pas attendre. */
const TIMEOUT_MS = 60000
/** Longueur du corps d'erreur repris dans l'exception. */
const ERROR_BODY_MAX = 500

export type VeniceRole = 'system' | 'user' | 'assistant'

export interface VeniceMessage {
  role: VeniceRole
  content: string
}

export interface VeniceChatOptions {
  /** Défaut : `VENICE_MODEL`, sinon GLM 5.2. */
  model?: string
  temperature?: number
  /**
   * Budget de sortie — **raisonnement compris**.
   *
   * GLM 5.2 raisonne avant de répondre, et ce raisonnement est facturé et
   * plafonné par la même limite. Mesuré le 2026-08-31 sur une question d'une
   * ligne : 120 jetons partent entièrement dans le raisonnement et la réponse
   * revient vide (`finish_reason: length`) ; 800 suffisent largement (387
   * consommés). En dessous de ~500, prévoyez des réponses tronquées.
   */
  maxTokens?: number
  /** Annulation de l'appelant ; combinée au délai maximum interne. */
  signal?: AbortSignal
  /**
   * Laisser Venice préfixer la conversation de son propre prompt système.
   *
   * Défaut `false` : mesuré le 2026-08-31, ce préfixe pèse ~1640 jetons
   * d'entrée par appel (1658 contre 16 pour le même message). Le projet
   * fournit ses propres consignes ; on ne paie pas celles de Venice.
   */
  includeVeniceSystemPrompt?: boolean
}

export interface VeniceUsage {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

export interface VeniceChatResult {
  /** Le texte de la réponse. Jamais vide : sinon l'appel a levé. */
  text: string
  /**
   * Le raisonnement du modèle, quand il en publie un. Utile au diagnostic ;
   * ce n'est pas une réponse et il ne doit pas être montré à l'utilisateur.
   */
  reasoning: string | null
  /** Le modèle réellement servi, tel que l'API le nomme. */
  model: string
  finishReason: string | null
  usage: VeniceUsage
}

/** L'échec d'un appel, avec le code HTTP quand il y en a un. */
export class VeniceError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'VeniceError'
    this.status = status
  }
}

export function veniceBaseUrl(): string {
  const raw = process.env.VENICE_BASE_URL?.trim()
  return (raw && raw.length > 0 ? raw : DEFAULT_BASE_URL).replace(/\/+$/, '')
}

export function veniceModel(): string {
  const raw = process.env.VENICE_MODEL?.trim()
  return raw && raw.length > 0 ? raw : DEFAULT_MODEL
}

/** Sans clé, l'appelant peut masquer la fonctionnalité plutôt que de la faire échouer. */
export function hasVeniceKey(): boolean {
  const key = process.env.VENICE_API_KEY
  return typeof key === 'string' && key.trim().length > 0
}

function readKey(): string {
  const key = process.env.VENICE_API_KEY?.trim()
  if (!key) {
    throw new VeniceError(
      'VENICE_API_KEY absente de l’environnement. Renseignez-la dans le fichier .env ' +
        'à la racine du projet (non versionné), puis relancez.'
    )
  }
  return key
}

/** Le corps d'une erreur HTTP, tronqué, pour que le motif soit lisible sans noyer le journal. */
function briefBody(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  return flat.length > ERROR_BODY_MAX ? `${flat.slice(0, ERROR_BODY_MAX)}…` : flat
}

function readUsage(raw: unknown): VeniceUsage {
  const u = (raw ?? {}) as Record<string, unknown>
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)
  return {
    promptTokens: num(u.prompt_tokens),
    completionTokens: num(u.completion_tokens),
    totalTokens: num(u.total_tokens)
  }
}

/**
 * Un aller-retour de complétion.
 *
 * Lève `VeniceError` si la clé manque, si l'API répond autre chose qu'un 2xx,
 * si le corps n'est pas le JSON attendu, ou si la réponse ne contient aucun
 * texte. Ne retourne jamais une chaîne vide.
 */
export async function chatCompletion(
  messages: VeniceMessage[],
  options: VeniceChatOptions = {}
): Promise<VeniceChatResult> {
  if (messages.length === 0) {
    throw new VeniceError('Aucun message à envoyer.')
  }
  const key = readKey()
  const model = options.model ?? veniceModel()

  const body: Record<string, unknown> = {
    model,
    messages,
    venice_parameters: {
      include_venice_system_prompt: options.includeVeniceSystemPrompt ?? false
    }
  }
  if (options.temperature != null) body.temperature = options.temperature
  if (options.maxTokens != null) body.max_tokens = options.maxTokens

  const deadline = AbortSignal.timeout(TIMEOUT_MS)
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline

  let res: Response
  try {
    res = await fetch(`${veniceBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new VeniceError(`Venice injoignable : ${reason}`)
  }

  const text = await res.text()
  if (!res.ok) {
    throw new VeniceError(`Venice a répondu ${res.status} : ${briefBody(text)}`, res.status)
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new VeniceError(`Réponse illisible (JSON attendu) : ${briefBody(text)}`, res.status)
  }

  const choice = (parsed.choices as unknown[] | undefined)?.[0] as
    | { message?: { content?: unknown; reasoning_content?: unknown }; finish_reason?: unknown }
    | undefined
  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : null
  const content = choice?.message?.content
  const reasoning = choice?.message?.reasoning_content
  if (typeof content !== 'string' || content.trim().length === 0) {
    // Le cas courant, et le seul qui se répare : le budget est parti dans le
    // raisonnement. On le dit, plutôt que de laisser chercher.
    if (finishReason === 'length') {
      throw new VeniceError(
        'Réponse vide : le budget maxTokens a été consommé par le raisonnement du ' +
          'modèle avant qu’il ne rédige. Augmentez maxTokens (≥ 500 pour une ' +
          'question courte).',
        res.status
      )
    }
    throw new VeniceError(`Réponse sans texte : ${briefBody(text)}`, res.status)
  }

  return {
    text: content,
    reasoning: typeof reasoning === 'string' && reasoning.length > 0 ? reasoning : null,
    model: typeof parsed.model === 'string' ? parsed.model : model,
    finishReason,
    usage: readUsage(parsed.usage)
  }
}
