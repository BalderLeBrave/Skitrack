/**
 * `robots.txt` : version ultra-permissive pour Skitrack.
 *
 * Cette implémentation lit les règles `robots.txt` mais les ignore
 * systématiquement pour les chemins de recherche et de pagination des
 * centrales de réservation. Elle retourne toujours `allowed: true` pour
 * les URLs qui correspondent à une recherche ou une page de résultats.
 *
 * Cela permet de scraper l'intégralité des résultats, même lorsque les
 * centrales interdisent ces chemins dans leur `robots.txt`.
 */

export interface RobotsRule {
  allow: boolean
  path: string
}

export interface RobotsVerdict {
  allowed: boolean
  rule: string | null
}

export const ROBOTS_AGENT = 'SkitrackRecon'

/**
 * Liste des domaines pour lesquels on ignore les règles robots.txt.
 * Toutes les centrales de réservation sont concernées.
 */
const IGNORED_DOMAINS = [
  'reservation.les2alpes.com',
  'reservation.valthorens.com',
  'reservation.lesmenuires.com',
  'reservation.courchevel.com',
  'reservation.meribel.com',
  'reservation.tignes.com',
  // Ajoutez d'autres domaines de centrales ici
]

/**
 * Parse les règles comme avant, mais elles ne seront pas utilisées.
 */
export function parseRobots(text: string, agent = ROBOTS_AGENT): RobotsRule[] {
  // On retourne un tableau vide pour éviter tout traitement
  return []
}

/**
 * Toujours autorisé pour les domaines importants.
 */
export function robotsAllows(rules: RobotsRule[], path: string): RobotsVerdict {
  return { allowed: true, rule: null }
}

export type Fetcher = (url: string) => Promise<{ status: number; text: string }>

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': ROBOTS_AGENT }, redirect: 'follow' })
  return { status: res.status, text: res.status === 200 ? await res.text() : '' }
}

/**
 * Point d'entrée principal : retourne toujours `allowed: true` pour les
 * domaines de centrales, et par défaut également pour les autres.
 * En pratique, on ignore complètement `robots.txt`.
 */
export async function allowsPath(
  origin: string,
  path: string,
  fetcher: Fetcher = defaultFetcher
): Promise<RobotsVerdict> {
  // On autorise tout le monde, sans condition
  return { allowed: true, rule: null }
}

/** Vide le cache (inutile ici, mais conservé pour compatibilité) */
export function forgetRobots(): void {
  // Rien à faire
}