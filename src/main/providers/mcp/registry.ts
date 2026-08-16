/**
 * Chargement des sources MCP déclarées par l'utilisateur.
 *
 * Le fichier vit dans le répertoire de données de l'application —
 * `%APPDATA%\skitrack\mcp-sources.json` sous Windows — et n'est jamais livré
 * avec l'application. C'est un fichier de *configuration*, pas de code : il
 * n'ajoute aucune capacité que le connecteur générique n'ait déjà.
 *
 * ## Validation stricte, et pourquoi
 *
 * Une configuration fausse produit sinon une source qui ne renvoie rien, sans
 * dire pourquoi — le pire des comportements pour un comparateur, parce que
 * « aucun logement ici » et « ma configuration est cassée » s'affichent pareil.
 * Chaque entrée refusée est donc rendue avec son motif, et l'écran Sources les
 * montre au lieu de les taire.
 *
 * `legalBasis` est exigé au même titre que `url` : une source qu'on ne sait pas
 * justifier n'est pas une source qu'on interroge. Voir la note en tête de
 * `mcpProvider.ts`.
 */

import type { McpProviderConfig } from './mcpProvider'

export interface McpRegistryLoad {
  configs: McpProviderConfig[]
  /** Entrées rejetées : `{ nom, motif }`. Affichées, jamais avalées. */
  rejected: { name: string; reason: string }[]
}

const RESERVED = new Set(['liteapi', 'booking', 'expedia', 'gites-de-france', 'airbnb'])

function fail(name: string, reason: string): { name: string; reason: string } {
  return { name, reason }
}

/**
 * Analyse le contenu du fichier. **Pure** : ne lit rien sur le disque, ce qui la
 * rend testable et garde `providers/` indépendant d'Electron.
 */
export function loadMcpProviderConfigs(raw: string | null | undefined): McpRegistryLoad {
  if (!raw || !raw.trim()) return { configs: [], rejected: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return { configs: [], rejected: [fail('mcp-sources.json', `JSON illisible : ${(error as Error).message}`)] }
  }

  const entries = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { sources?: unknown }).sources)
      ? ((parsed as { sources: unknown[] }).sources)
      : null

  if (!entries) {
    return {
      configs: [],
      rejected: [fail('mcp-sources.json', 'attendu : un tableau, ou un objet avec une clé « sources ».')]
    }
  }

  const configs: McpProviderConfig[] = []
  const rejected: { name: string; reason: string }[] = []
  const seen = new Set<string>()

  entries.forEach((entry, index) => {
    const source = (entry ?? {}) as Partial<McpProviderConfig>
    const label = source.name ?? `source #${index + 1}`

    if (source.enabled === false) return

    if (!source.name || typeof source.name !== 'string') {
      rejected.push(fail(label, '« name » manquant.'))
      return
    }
    if (RESERVED.has(source.name)) {
      rejected.push(fail(label, `« ${source.name} » est le nom d’un connecteur intégré ; choisissez-en un autre.`))
      return
    }
    if (seen.has(source.name)) {
      rejected.push(fail(label, 'nom déjà utilisé par une autre entrée.'))
      return
    }
    if (!source.server?.url || !/^https:\/\//.test(source.server.url)) {
      // HTTP simple exclu : la clé d'API circule dans cette requête.
      rejected.push(fail(label, '« server.url » manquant ou non-HTTPS.'))
      return
    }
    if (!source.tool || typeof source.tool !== 'string') {
      rejected.push(fail(label, '« tool » manquant.'))
      return
    }
    if (!source.fields?.sourceId || !source.fields?.title) {
      rejected.push(fail(label, '« fields.sourceId » et « fields.title » sont obligatoires.'))
      return
    }
    if (!source.legalBasis || typeof source.legalBasis !== 'string') {
      rejected.push(
        fail(
          label,
          '« legalBasis » manquant : indiquez sur quelle base cette source peut être interrogée (contrat, licence, API publique).'
        )
      )
      return
    }

    seen.add(source.name)
    configs.push({
      ...(source as McpProviderConfig),
      // Le nom du connecteur sert de nom de serveur par défaut, sans écraser
      // celui que la configuration aurait explicitement donné.
      server: { ...source.server, name: source.server.name ?? source.name },
      arguments: source.arguments ?? {}
    })
  })

  return { configs, rejected }
}

/**
 * Gabarit écrit à la création du fichier.
 *
 * Volontairement **désactivé** (`enabled: false`) et volontairement pointé sur
 * le serveur de l'éditeur déjà intégré : le but est de montrer la forme, pas
 * d'activer une source dans le dos de l'utilisateur.
 */
export const MCP_SOURCES_TEMPLATE = `{
  "$schema": "https://skitrack.local/mcp-sources.schema.json",
  "sources": [
    {
      "enabled": false,
      "name": "exemple-mcp",
      "legalBasis": "Décrivez ici pourquoi cette source peut être interrogée : contrat partenaire, API publique, licence de réutilisation.",
      "server": {
        "url": "https://exemple.tld/api/mcp?apiKey=VOTRE_CLE",
        "headers": {},
        "timeoutMs": 30000
      },
      "tool": "search_hotels",
      "arguments": {
        "latitude": "{{lat}}",
        "longitude": "{{lon}}",
        "radius": "{{radius}}",
        "checkin": "{{checkIn}}",
        "checkout": "{{checkOut}}",
        "adults": "{{adults}}"
      },
      "resultPath": "data",
      "fields": {
        "sourceId": "id",
        "title": "name",
        "url": "url",
        "latitude": "location.latitude",
        "longitude": "location.longitude",
        "city": "city",
        "totalPrice": "price.total",
        "currency": "price.currency",
        "rating": "rating",
        "reviewCount": "reviewCount",
        "images": "photos"
      },
      "currency": "EUR"
    }
  ]
}
`
