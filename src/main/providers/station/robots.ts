/**
 * `robots.txt` : ce que la centrale autorise, et comment on le lui demande.
 *
 * ## Pourquoi cette lecture est faite avant chaque relevé
 *
 * Une centrale de réservation publie ses règles d'exploration dans
 * `robots.txt`. Les honorer n'est pas une formalité : c'est la seule
 * déclaration explicite que l'exploitant nous adresse, et un relevé qui passe
 * outre transforme un outil de comparaison personnelle en nuisance. Quand le
 * chemin des résultats est interdit, le connecteur n'interroge pas : il rend
 * une erreur motivée, et l'interface propose d'ouvrir la centrale à la main.
 *
 * ## Ce que cette implémentation couvre, et ce qu'elle ignore
 *
 * Le groupe qui s'applique est celui de notre agent s'il est nommé, celui de
 * `User-agent: *` sinon. La règle retenue pour un chemin est **la plus longue**
 * qui le préfixe — la convention suivie par Google et Bing —, `Allow`
 * l'emportant à longueur égale.
 *
 * `Crawl-delay` n'est pas lu : le connecteur ne fait qu'une à deux requêtes par
 * recherche, sur demande de l'utilisateur, ce qui reste sous n'importe quel
 * délai déclaré. `Sitemap` ne nous concerne pas.
 *
 * Une absence de `robots.txt` — 404, hôte muet, fichier illisible — vaut
 * autorisation : c'est la règle du protocole, et l'inverse rendrait le
 * connecteur muet devant la moitié des centrales pour une raison qui n'existe
 * pas.
 */

export interface RobotsRule {
  allow: boolean
  path: string
}

export interface RobotsVerdict {
  allowed: boolean
  /** La règle qui a tranché, écrite comme dans le fichier. `null` = aucune. */
  rule: string | null
}

/**
 * Le jeton d'agent que nous portons.
 *
 * C'est celui de la reconnaissance (`tools/recon-centrales.mjs`), qui s'annonce
 * `SkitrackRecon/1.0`. Le connecteur, lui, pilote un vrai navigateur : il porte
 * l'agent de Chromium et relève donc du groupe `User-agent: *`, ce qui est la
 * lecture prudente — un groupe nommé est presque toujours plus permissif.
 */
export const ROBOTS_AGENT = 'SkitrackRecon'

/**
 * Règles applicables à notre agent.
 *
 * Un groupe commence à la première ligne `User-agent` qui suit une règle : deux
 * `User-agent` consécutifs déclarent le **même** groupe pour deux agents, ce
 * qui est la forme la plus répandue dans les fichiers réels.
 */
export function parseRobots(text: string, agent = ROBOTS_AGENT): RobotsRule[] {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = []
  let current: { agents: string[]; rules: RobotsRule[] } | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim()
    if (!line) continue
    const separator = line.indexOf(':')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()

    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      continue
    }
    if (key !== 'disallow' && key !== 'allow') continue
    // Une règle posée avant tout `User-agent` est hors norme : Google l'ignore.
    // `reservation.combloux.com` publie pourtant un fichier qui n'est que
    // « Disallow:/ », sans en-tête, et l'intention n'a rien d'ambigu. On la
    // rattache au groupe universel plutôt que de la jeter.
    if (!current) {
      current = { agents: ['*'], rules: [] }
      groups.push(current)
    }
    current.rules.push({ allow: key === 'allow', path: value })
  }

  const mine = groups.find((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a)))
  const star = groups.find((g) => g.agents.includes('*'))
  return (mine ?? star)?.rules ?? []
}

/**
 * Motif `robots.txt` → expression régulière.
 *
 * `*` vaut n'importe quelle suite de caractères, `$` en fin de motif ancre la
 * fin du chemin. Tout le reste est littéral, y compris `?` et `.` — d'où
 * l'échappement.
 *
 * Réduire le motif à son préfixe, comme le faisait une première version, était
 * une approximation ruineuse : `Disallow: /*?action=*` se réduit à `/`, ce qui
 * interdit le site entier alors que la règle ne vise que les URL portant le
 * paramètre `action`. Les centrales Ingénie publient exactement ce motif ; les
 * déclarer intégralement interdites aurait supprimé la source la mieux
 * couverte du comparateur.
 */
function toRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const escaped = body.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`)
}

/**
 * Ce chemin est-il permis ?
 *
 * `path` s'entend **avec sa requête** — `/booking?action=result&cid=5` —, sans
 * quoi les règles qui ne visent que des paramètres ne s'appliqueraient jamais.
 *
 * `Disallow:` sans valeur n'interdit rien : c'est la façon canonique de tout
 * autoriser. À égalité de longueur de motif, `Allow` l'emporte, et le motif le
 * plus long l'emporte sur le plus court — la convention suivie par Google.
 */
export function robotsAllows(rules: RobotsRule[], path: string): RobotsVerdict {
  let verdict: RobotsVerdict = { allowed: true, rule: null }
  let best = -1

  for (const rule of rules) {
    if (!rule.path) continue
    if (!toRegExp(rule.path).test(path)) continue
    const weight = rule.path.length
    if (weight < best || (weight === best && !rule.allow)) continue
    best = weight
    verdict = { allowed: rule.allow, rule: `${rule.allow ? 'Allow' : 'Disallow'}: ${rule.path}` }
  }
  return verdict
}

/** Un `robots.txt` lu, avec l'heure de sa lecture. */
interface CachedRobots {
  rules: RobotsRule[]
  readAt: number
}

const CACHE = new Map<string, CachedRobots>()

/** Au-delà, on relit : un exploitant peut changer d'avis, et une session de
 *  l'application vit plusieurs heures. */
const TTL_MS = 60 * 60 * 1000

export type Fetcher = (url: string) => Promise<{ status: number; text: string }>

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': ROBOTS_AGENT }, redirect: 'follow' })
  return { status: res.status, text: res.status === 200 ? await res.text() : '' }
}

/**
 * Le relevé de ce chemin est-il autorisé sur cette origine ?
 *
 * Mémoïsé par origine : une recherche interroge deux pages de la même centrale,
 * et l'utilisateur en relance souvent plusieurs de suite sur la même station.
 * Un échec réseau sur `robots.txt` **n'interdit pas** — il est traité comme un
 * fichier absent, et mis en cache aussi, sans quoi chaque recherche paierait
 * une requête morte.
 */
export async function allowsPath(origin: string, path: string, fetcher: Fetcher = defaultFetcher): Promise<RobotsVerdict> {
  const cached = CACHE.get(origin)
  const fresh = cached && Date.now() - cached.readAt < TTL_MS
  if (fresh) return robotsAllows(cached.rules, path)

  let rules: RobotsRule[] = []
  try {
    const res = await fetcher(`${origin}/robots.txt`)
    if (res.status === 200 && /^\s*(user-agent|disallow|allow|sitemap)/im.test(res.text)) {
      rules = parseRobots(res.text)
    }
  } catch {
    // Hôte muet ou TLS refusé : le protocole dit « pas de règles », pas
    // « interdit ». On note la lecture pour ne pas la refaire à chaque frappe.
  }
  CACHE.set(origin, { rules, readAt: Date.now() })
  return robotsAllows(rules, path)
}

/** Vide le cache — les tests en ont besoin, l'application non. */
export function forgetRobots(): void {
  CACHE.clear()
}
