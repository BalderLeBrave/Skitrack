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
  return Boolean(item.url && item.domainId != null && item.checkIn && item.checkOut)
}

/** Vrai quand le dernier point est assez ancien — ou qu'il n'y en a pas. */
export function isDue(
  key: string,
  history: Record<string, PriceReading[]>,
  now: number,
  minIntervalMs = MIN_REFRESH_INTERVAL_MS
): boolean {
  const arr = history[key]
  const last = arr && arr.length > 0 ? arr[arr.length - 1] : null
  return !last || now - last.t >= minIntervalMs
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
  now: number,
  minIntervalMs = MIN_REFRESH_INTERVAL_MS
): RefreshGroup[] {
  const groups = new Map<string, RefreshGroup>()
  for (const item of tracked) {
    if (!isRefreshable(item)) continue
    if (!isDue(item.key, history, now, minIntervalMs)) continue
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
