/**
 * Rerelevé des prix suivis.
 *
 * Remplace le simulateur qui remplissait l'historique avec une sinusoïde. Un
 * point n'entre désormais dans l'historique que si une source a répondu avec un
 * **total confirmé** pour le bien suivi, aux dates suivies. Tout le reste — un
 * « à partir de », une offre disparue, une source en panne — ne produit rien.
 * Rien, et non une valeur reconduite : une courbe plate serait l'affirmation
 * que le prix n'a pas bougé, ce qui est une information fausse plutôt qu'une
 * information absente.
 *
 * ## Ce que ce module ne fait pas
 *
 * Il ne parle pas au réseau : il décide **quoi** relever et **comment lire** la
 * réponse. L'appel lui-même est dans `hooks/usePriceRefresh`, qui passe par
 * `runProviderSearch` — donc par le moteur du processus principal, ses
 * `robots.txt`, ses coupe-circuits et ses cadences. Aucune requête n'est
 * fabriquée ici.
 *
 * ## Limite assumée
 *
 * Le relevé ne tourne que quand l'application est ouverte. Un séjour suivi
 * pendant une nuit d'application fermée n'a pas de point pour cette nuit-là, et
 * l'écran le montre par un trou dans la courbe. Lever cette limite demande un
 * relevé côté serveur : c'est décrit dans `docs/webisation.md`, ce n'est pas
 * fait ici.
 */

import type { PriceReading, TrackedItem } from '@/state/appState'
import type { Lodging } from './lodgings'
import { trackKey } from './lodgings'

/** Un relevé par heure et par bien, comme le simulateur qu'il remplace. */
export const MIN_REFRESH_INTERVAL_MS = 3_600_000

/**
 * Sources qu'un tour de relevé ne sait pas interroger.
 *
 * `runProviderSearch` couvre toutes les sources **sauf Airbnb**, qui n'est pas
 * un connecteur : le moteur ne produit pour lui qu'une redirection. Un suivi
 * Airbnb ne peut donc structurellement pas produire de relevé, et le déclarer
 * relevable ferait deux dégâts — l'écran promettrait une alerte qui ne partira
 * jamais, et le lot repartirait à chaque tour puisqu'il n'écrit rien.
 */
export const NON_REFRESHABLE_SOURCES: readonly string[] = ['Airbnb']

/**
 * Tentative de relevé, aboutie ou non.
 *
 * L'historique ne garde que les succès — c'est sa raison d'être. Sans trace des
 * échecs, un bien dont l'annonce a disparu resterait « à relever » à chaque
 * réveil de la boucle, et relancerait une recherche multi-sources complète
 * toutes les cinq minutes, indéfiniment. Ce compteur est ce qui distingue
 * « pas encore relevé » de « on a essayé et ça n'a rien donné ».
 */
export interface AttemptRecord {
  at: number
  /** Échecs consécutifs. Remis à zéro dès qu'un point est écrit. */
  failures: number
}

export type AttemptStore = Record<string, AttemptRecord>

/**
 * Recul après échec : une heure, puis deux, quatre… plafonné à vingt-quatre.
 *
 * Une annonce retirée ne revient pas dans l'heure. Réessayer au même rythme
 * qu'un bien vivant ferait payer aux sources l'obstination de l'application.
 */
export function backoffMs(failures: number): number {
  if (failures <= 0) return MIN_REFRESH_INTERVAL_MS
  const grown = MIN_REFRESH_INTERVAL_MS * 2 ** Math.min(failures, 5)
  return Math.min(grown, 24 * MIN_REFRESH_INTERVAL_MS)
}

/**
 * Un lot de biens relevables en une seule recherche.
 *
 * Deux biens du même domaine, aux mêmes dates et pour le même groupe se
 * relèvent d'un seul appel : le moteur renvoie toutes les offres de la station.
 * Interroger une fois par bien multiplierait le trafic sur les centrales sans
 * rien apporter.
 */
export interface RefreshGroup {
  domainId: number
  domainName: string
  checkIn: string
  checkOut: string
  adults: number
  children: number
  items: TrackedItem[]
}

/** Un suivi ne peut être relevé que s'il sait à quoi il se rapporte. */
export function isRefreshable(item: TrackedItem): boolean {
  if (NON_REFRESHABLE_SOURCES.includes(item.src)) return false
  return Boolean(item.url && item.domainId != null && item.checkIn && item.checkOut)
}

/**
 * Vrai quand il est temps de retenter ce bien.
 *
 * Deux horloges, et c'est la plus récente qui commande : le dernier point
 * écrit, et la dernière tentative — réussie ou non. Ne regarder que la
 * première ferait repartir en boucle tout bien qui ne rend rien.
 */
export function isDue(
  key: string,
  history: Record<string, PriceReading[]>,
  attempts: AttemptStore,
  now: number,
  minIntervalMs = MIN_REFRESH_INTERVAL_MS
): boolean {
  const arr = history[key]
  const last = arr && arr.length > 0 ? arr[arr.length - 1] : null
  if (last && now - last.t < minIntervalMs) return false

  const attempt = attempts[key]
  if (attempt && now - attempt.at < backoffMs(attempt.failures)) return false

  return true
}

/** Journal des tentatives après un tour, à conserver pour le tour suivant. */
export function recordAttempts(
  attempts: AttemptStore,
  keys: readonly string[],
  succeeded: ReadonlySet<string>,
  now: number
): AttemptStore {
  const next: AttemptStore = { ...attempts }
  for (const key of keys) {
    if (succeeded.has(key)) delete next[key]
    else next[key] = { at: now, failures: (attempts[key]?.failures ?? 0) + 1 }
  }
  return next
}

/**
 * Constitue les lots à relever.
 *
 * Les suivis non relevables et ceux dont l'heure n'est pas venue sont écartés
 * en silence : ce n'est pas une erreur, c'est le cas courant.
 */
export function groupForRefresh(
  tracked: readonly TrackedItem[],
  history: Record<string, PriceReading[]>,
  attempts: AttemptStore,
  now: number,
  minIntervalMs = MIN_REFRESH_INTERVAL_MS
): RefreshGroup[] {
  const groups = new Map<string, RefreshGroup>()
  for (const item of tracked) {
    if (!isRefreshable(item)) continue
    if (!isDue(item.key, history, attempts, now, minIntervalMs)) continue
    const adults = item.adults && item.adults > 0 ? item.adults : 1
    const children = item.children && item.children > 0 ? item.children : 0
    const groupKey = [item.domainId, item.checkIn, item.checkOut, adults, children].join('|')
    const existing = groups.get(groupKey)
    if (existing) {
      existing.items.push(item)
      continue
    }
    groups.set(groupKey, {
      domainId: item.domainId as number,
      domainName: item.domain,
      checkIn: item.checkIn as string,
      checkOut: item.checkOut as string,
      adults,
      children,
      items: [item]
    })
  }
  return [...groups.values()]
}

/**
 * Retrouve, parmi les offres relevées, celle qui correspond au bien suivi.
 *
 * L'URL fait foi : c'est le seul identifiant stable d'une annonce. Le nom
 * dérive — une centrale renomme « Studio Choucas » en « Studio Choucas 2p »
 * d'une semaine à l'autre — et rapprocher deux biens sur un nom qui a bougé
 * écrirait le prix d'un autre logement dans l'historique de celui-ci.
 */
export function matchLodging(item: TrackedItem, lodgings: readonly Lodging[]): Lodging | null {
  if (!item.url) return null
  return lodgings.find((l) => l.url === item.url) ?? null
}

/**
 * Convertit une offre relevée en point d'historique.
 *
 * Renvoie `null` — donc n'écrit rien — dès que le prix n'est pas un total
 * confirmé par la source. C'est le garde-fou demandé : une alerte ne doit
 * jamais se déclencher sur un « à partir de ».
 */
export function measuredReading(lodging: Lodging, at: number): PriceReading | null {
  if (lodging.priceConfidence !== 'total_confirmed') return null
  if (!(lodging.total > 0)) return null
  return { t: at, v: Math.round(lodging.total), o: 'measured' }
}

/**
 * Relevés à enregistrer pour un lot, à partir des offres que la source a
 * rendues. Indexés par `TrackedItem.key`.
 */
export function readingsForGroup(
  group: RefreshGroup,
  lodgings: readonly Lodging[],
  at: number
): Record<string, PriceReading> {
  const out: Record<string, PriceReading> = {}
  for (const item of group.items) {
    const match = matchLodging(item, lodgings)
    if (!match) continue
    const reading = measuredReading(match, at)
    if (reading) out[item.key] = reading
  }
  return out
}

/** Prix par personne d'un point, pour les alertes en mode « par personne ». */
export function perPersonOf(item: TrackedItem, total: number, nights: number): number {
  const heads = Math.max(1, (item.adults ?? 1) + (item.children ?? 0))
  const n = Math.max(1, nights)
  return Math.round((total / n / heads) * 10) / 10
}

/** Clé de suivi d'une offre relevée — même règle que la mise sous suivi. */
export function keyOfLodging(lodging: Pick<Lodging, 'name' | 'src'>): string {
  return trackKey(lodging)
}
