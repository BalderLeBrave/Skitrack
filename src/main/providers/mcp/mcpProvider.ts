/**
 * Connecteur générique adossé à un serveur MCP quelconque.
 *
 * ## Le problème que ça résout
 *
 * Les plateformes de logement ouvrent des serveurs MCP plus vite qu'elles
 * n'ouvrent des API : c'est aujourd'hui le seul segment du secteur où l'accès
 * s'élargit au lieu de se refermer. Écrire un fichier TypeScript par serveur
 * reviendrait à recompiler l'application chaque fois qu'un nouveau paraît, pour
 * un travail qui se réduit à « appeler cet outil, lire ces champs ».
 *
 * Ce module rend donc l'ajout d'une source **déclaratif** : un objet JSON décrit
 * le serveur, l'outil, les arguments et la correspondance des champs, et le
 * connecteur en découle. Le fichier de configuration se recharge sans rebuild.
 *
 * ## Ce que ça ne rend pas légitime pour autant
 *
 * Un serveur MCP n'est qu'un transport. Qu'un serveur « Airbnb » existe sur une
 * place de marché ne veut pas dire qu'il a le droit de servir ces données : la
 * plupart de ces serveurs lisent les pages du site, ce que les CGU d'Airbnb
 * interdisent — c'est exactement ce qu'a montré l'essai de
 * `@openbnb/mcp-server-airbnb`, refusé par le `robots.txt` du site
 * (voir `airbnb/airbnb.ts`). La règle du projet ne change pas : **on ne
 * configure ici que des serveurs qui distribuent un inventaire qu'ils ont le
 * droit de distribuer.** Le champ `legalBasis` de la configuration est
 * obligatoire pour cette raison — il force à écrire la réponse avant d'activer
 * la source, et il s'affiche dans l'écran Sources.
 */

import { debugLog } from '../debug'
import { CircuitBreaker, RateLimiter, TtlCache, withRetry } from '../resilience'
import type {
  Accommodation,
  AccommodationProvider,
  AvailabilityStatus,
  PriceConfidence,
  ProviderHealth,
  SearchParams
} from '../types'
import { nowIso } from '../types'
import { McpClient, type McpServerConfig } from './client'

/** Champs du modèle pivot qu'une configuration peut alimenter. */
export interface McpFieldMap {
  sourceId: string
  title: string
  url?: string
  latitude?: string
  longitude?: string
  city?: string
  country?: string
  nightlyPrice?: string
  totalPrice?: string
  currency?: string
  rating?: string
  reviewCount?: string
  bedrooms?: string
  guests?: string
  images?: string
  offerId?: string
}

export interface McpProviderConfig {
  /** Nom du connecteur dans le moteur. Doit être unique. */
  name: string
  server: McpServerConfig
  tool: string
  /** Arguments de l'outil ; les chaînes acceptent des jetons `{{…}}`. */
  arguments: Record<string, unknown>
  /** Chemin pointé vers le tableau d'annonces dans la réponse. Défaut : `data`. */
  resultPath?: string
  fields: McpFieldMap
  /** Devise à supposer quand la source n'en renvoie pas. */
  currency?: string
  availabilityStatus?: AvailabilityStatus
  priceConfidence?: PriceConfidence
  /** Sur quelle base cette source a le droit d'être interrogée. Obligatoire. */
  legalBasis: string
  enabled?: boolean
}

/* ------------------------------------------------------------------ *
 * Substitution et lecture de chemins. Pures, testées sans réseau.
 * ------------------------------------------------------------------ */

export function searchContext(params: SearchParams): Record<string, unknown> {
  const nights =
    params.checkIn && params.checkOut
      ? Math.round((Date.parse(params.checkOut) - Date.parse(params.checkIn)) / 86_400_000)
      : undefined

  return {
    destination: params.destination,
    lat: params.latitude,
    lon: params.longitude,
    radius: params.radiusMeters,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    adults: params.adults,
    children: params.children,
    nights: Number.isFinite(nights) && (nights as number) > 0 ? nights : undefined
  }
}

/**
 * Remplace les jetons `{{clé}}` dans les arguments configurés.
 *
 * Deux comportements comptent :
 *
 * * Un argument dont **tout** le contenu est un jeton prend la valeur *typée* du
 *   contexte — `{{adults}}` devient le nombre `4`, pas la chaîne `"4"`. Les API
 *   qui valident leur schéma rejettent la seconde forme.
 * * Un jeton sans valeur fait **disparaître l'argument** au lieu de le laisser
 *   littéral. C'est ce qui permet d'écrire une configuration unique valable avec
 *   ou sans coordonnées, sans envoyer `latitude: "{{lat}}"` à un serveur qui
 *   répondrait par une erreur de type.
 */
export function resolveArguments(
  template: Record<string, unknown>,
  context: Record<string, unknown>
): Record<string, unknown> {
  const whole = /^\{\{\s*([\w.]+)\s*\}\}$/
  const inner = /\{\{\s*([\w.]+)\s*\}\}/g

  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const exact = whole.exec(value)
      if (exact) return context[exact[1]]
      if (!inner.test(value)) return value
      let missing = false
      const replaced = value.replace(inner, (_match, key: string) => {
        const found = context[key]
        if (found == null) missing = true
        return found == null ? '' : String(found)
      })
      return missing ? undefined : replaced
    }
    if (Array.isArray(value)) return value.map(walk).filter((item) => item !== undefined)
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        const resolved = walk(nested)
        if (resolved !== undefined) out[key] = resolved
      }
      return out
    }
    return value
  }

  return walk(template) as Record<string, unknown>
}

/** Lecture d'un chemin pointé, indices de tableau compris (`rooms.0.price`). */
export function readPath(source: unknown, path: string): unknown {
  if (!path) return source
  let current: unknown = source
  for (const segment of path.split('.')) {
    if (current == null) return undefined
    if (Array.isArray(current)) {
      const index = Number(segment)
      current = Number.isInteger(index) ? current[index] : undefined
      continue
    }
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/**
 * Convertit une valeur en nombre, y compris depuis un montant mis en forme.
 *
 * Le point délicat est le séparateur décimal. Une source française rend
 * « 2 480,00 € » ; supprimer naïvement tout ce qui n'est pas un chiffre donne
 * **248 000**, soit cent fois le prix — une erreur qui passerait inaperçue dans
 * un tri par prix jusqu'au moment où elle ferait écarter le bon logement. La
 * règle appliquée est celle qui vaut dans les deux conventions : **le dernier
 * séparateur rencontré est le séparateur décimal**, les autres sont des
 * séparateurs de milliers.
 */
export function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined

  // Espaces fines et insécables comprises : elles séparent les milliers.
  const cleaned = value.replace(/[\s\u00a0\u202f]/g, '')
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')

  let normalized: string
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '')
  } else {
    normalized = cleaned
  }

  const digits = normalized.replace(/[^\d.-]/g, '')
  if (!/\d/.test(digits)) return undefined
  const parsed = Number(digits)
  return Number.isFinite(parsed) ? parsed : undefined
}

function asStrings(value: unknown): string[] | undefined {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    const list = value.filter((item): item is string => typeof item === 'string')
    return list.length ? list : undefined
  }
  return undefined
}

/**
 * Applique la correspondance de champs à un élément brut.
 *
 * Renvoie `null` — donc écarte l'annonce — dès qu'il manque un identifiant ou un
 * titre. Le modèle pivot les garantit ; laisser passer un objet incomplet
 * déplacerait la panne dans l'interface, loin de sa cause.
 */
export function mapMcpItem(
  item: unknown,
  config: McpProviderConfig,
  params: SearchParams
): Accommodation | null {
  const field = <K extends keyof McpFieldMap>(key: K): unknown =>
    config.fields[key] ? readPath(item, config.fields[key] as string) : undefined

  const rawId = field('sourceId')
  const sourceId = rawId == null ? undefined : String(rawId)
  const title = typeof field('title') === 'string' ? (field('title') as string).trim() : undefined
  if (!sourceId || !title) return null

  const url = field('url')
  const total = asNumber(field('totalPrice'))
  const nightly = asNumber(field('nightlyPrice'))

  return {
    source: config.name,
    sourceId,
    title,
    url: typeof url === 'string' && url ? url : `#/logements/${config.name}/${encodeURIComponent(sourceId)}`,
    latitude: asNumber(field('latitude')),
    longitude: asNumber(field('longitude')),
    city: typeof field('city') === 'string' ? (field('city') as string) : undefined,
    country: typeof field('country') === 'string' ? (field('country') as string) : undefined,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    guests: asNumber(field('guests')) ?? params.adults,
    bedrooms: asNumber(field('bedrooms')),
    nightlyPrice: nightly,
    totalPrice: total,
    currency: (typeof field('currency') === 'string' ? (field('currency') as string) : undefined) ?? config.currency,
    rating: asNumber(field('rating')),
    reviewCount: asNumber(field('reviewCount')),
    images: asStrings(field('images')),
    // Sans déclaration explicite, on reste sur « inconnu ». Une source
    // configurée à la main n'a pas prouvé qu'elle ne liste que du disponible,
    // et afficher « disponible » à tort fait rater un séjour.
    availabilityStatus: config.availabilityStatus ?? 'unknown',
    priceConfidence:
      config.priceConfidence ?? (total != null ? 'total_confirmed' : nightly != null ? 'partial' : 'unknown'),
    offerId: typeof field('offerId') === 'string' ? (field('offerId') as string) : undefined,
    retrievedAt: nowIso(),
    rawProviderData: item
  }
}

/* ------------------------------------------------------------------ *
 * Connecteur.
 * ------------------------------------------------------------------ */

const CACHE_TTL_MS = 10 * 60 * 1000
const MIN_INTERVAL_MS = 300

export class McpAccommodationProvider implements AccommodationProvider {
  readonly name: string

  private readonly client: McpClient
  private readonly cache = new TtlCache<Accommodation[]>(CACHE_TTL_MS)
  private readonly breaker = new CircuitBreaker()
  private readonly limiter = new RateLimiter(MIN_INTERVAL_MS)

  constructor(private readonly config: McpProviderConfig) {
    this.name = config.name
    this.client = new McpClient(config.server)
  }

  async search(params: SearchParams): Promise<Accommodation[]> {
    if (this.breaker.open) throw new Error(`${this.name} : ${this.breaker.reason}`)

    const args = resolveArguments(this.config.arguments, searchContext(params))
    const key = JSON.stringify(args)
    const cached = this.cache.get(key)
    if (cached) return cached

    debugLog(this.name, 'Search started', { tool: this.config.tool })

    try {
      await this.limiter.acquire()
      const payload = await withRetry(() => this.client.callTool(this.config.tool, args), {
        retryable: (error) => !/40[13]|accès refusé/.test(String(error))
      })

      const rows = readPath(payload, this.config.resultPath ?? 'data')
      if (!Array.isArray(rows)) {
        // Un tableau attendu, autre chose reçu : c'est une configuration fausse,
        // pas une panne réseau. On le dit tel quel.
        throw new Error(
          `${this.name} : « ${this.config.resultPath ?? 'data'} » ne désigne pas une liste dans la réponse de ${this.config.tool}.`
        )
      }

      const results = rows
        .map((row) => mapMcpItem(row, this.config, params))
        .filter((row): row is Accommodation => row !== null)

      debugLog(this.name, 'Number of normalized results', { raw: rows.length, normalized: results.length })
      this.breaker.succeed()
      this.cache.set(key, results)
      return results
    } catch (error) {
      this.breaker.fail()
      debugLog(this.name, 'Number of errors', { errors: 1, message: (error as Error).message })
      throw error
    }
  }

  /**
   * Diagnostic : on interroge `tools/list` et on vérifie que l'outil configuré
   * existe. C'est le contrôle qui attrape la faute la plus courante — un nom
   * d'outil recopié de travers — avant qu'elle ne se présente comme « aucun
   * résultat ».
   */
  async health(): Promise<ProviderHealth> {
    try {
      const tools = await this.client.listTools()
      const present = tools.some((tool) => tool.name === this.config.tool)
      return {
        name: this.name,
        reachable: present,
        detail: present
          ? `serveur joignable, outil « ${this.config.tool} » présent — ${this.config.legalBasis}`
          : `serveur joignable mais « ${this.config.tool} » absent. Outils annoncés : ${tools.map((t) => t.name).slice(0, 8).join(', ')}`
      }
    } catch (error) {
      return { name: this.name, reachable: false, detail: (error as Error).message }
    }
  }
}
