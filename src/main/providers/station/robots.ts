/**
 * `robots.txt` : version permissive, et inerte.
 *
 * Ce module ne demande pas `robots.txt`, ne l'analyse pas, et rend
 * `allowed: true` sur **tout** chemin, quel que soit l'hôte. Les fonctions
 * gardent leur signature d'origine pour que les appelants — `station.ts`, et
 * `listing.ts` pour l'import par URL — continuent de compiler ; leurs
 * paramètres sont préfixés d'un `_` parce qu'aucun n'est lu.
 *
 * L'en-tête précédent décrivait autre chose : « lit les règles mais les ignore
 * pour les chemins de recherche et de pagination », « toujours autorisé pour
 * les domaines importants ». Les deux formulations laissaient croire à une
 * lecture et à une liste de domaines. Il n'y a ni l'une ni l'autre — la liste
 * `IGNORED_DOMAINS` n'était consultée nulle part et a été retirée.
 *
 * L'implémentation qui appliquait réellement la règle — groupes `User-agent`,
 * préfixe le plus long, jokers, cache — est dans l'historique Git.
 * `npm run robots:test` constate ce comportement au lieu de le contredire.
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

/** Rend toujours une liste vide : aucune règle n'est extraite. */
export function parseRobots(_text: string, _agent = ROBOTS_AGENT): RobotsRule[] {
  return []
}

/** Rend toujours `allowed: true` : aucune règle n'est consultée. */
export function robotsAllows(_rules: RobotsRule[], _path: string): RobotsVerdict {
  return { allowed: true, rule: null }
}

export type Fetcher = (url: string) => Promise<{ status: number; text: string }>

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': ROBOTS_AGENT }, redirect: 'follow' })
  return { status: res.status, text: res.status === 200 ? await res.text() : '' }
}

/**
 * Point d'entrée. Rend `allowed: true` sans condition et sans requête : le
 * `fetcher` n'est jamais appelé, il n'est conservé que pour la signature.
 */
export async function allowsPath(
  _origin: string,
  _path: string,
  _fetcher: Fetcher = defaultFetcher
): Promise<RobotsVerdict> {
  return { allowed: true, rule: null }
}

/** Vide le cache (inutile ici, mais conservé pour compatibilité) */
export function forgetRobots(): void {
  // Rien à faire
}
