/**
 * Proxies pour les scrapers Playwright — résidentiels **et mobiles (4G/5G)**.
 *
 * ## Pourquoi le mobile
 *
 * Les IP mobiles (opérateurs) ont en général une réputation meilleure que les
 * pools résidentiels datacenter-adjacent. reCAPTCHA v3 et les anti-bots des
 * OTAs (Airbnb, Booking…) les notent souvent plus haut. En contrepartie : débit
 * plus variable, sessions sticky parfois payantes, pool plus petit.
 *
 * ## Sources (priorité)
 *
 * 1. `SKITRACK_MOBILE_PROXY` / `SKITRACK_MOBILE_PROXY_LIST`  → type **mobile**
 * 2. Coffre `scrape_proxy_mobile`
 * 3. `SKITRACK_PROXY` / `SKITRACK_PROXY_LIST`               → type **residential**
 * 4. Coffre `scrape_proxy`
 *
 * Si des proxies **résidentiels** sont configurés (ou dérivés de Bright Data),
 * ils sont utilisés par défaut. Les mobiles restent disponibles via
 * `SKITRACK_PROXY_MODE=prefer_mobile` ou `mobile`.
 *
 * ## Format d’URL
 *
 *     http://user:pass@host:port
 *     socks5://user:pass@host:port
 *
 * Géotargeting / sticky session : souvent dans le **username**, selon le
 * fournisseur (Bright Data, Oxylabs, IPRoyal, Soax, Proxy-Seller, etc.) :
 *
 *     user-country-fr-session-abc123
 *     user-fr-sessid-xyz
 *
 * ## Mode
 *
 * `SKITRACK_PROXY_MODE` :
 * - `mobile`       — mobiles uniquement
 * - `residential`  — résidentiels uniquement (défaut)
 * - `prefer_mobile` — mobiles puis résidentiels
 * - `rotate_all`   — mélange round-robin de toute la liste
 *
 * Sans `scrape_proxy`, un résidentiel Bright Data est dérivé du WS
 * `brightdata_browser` (pays FR, session sticky).
 */

import { brightDataResidentialFromBrowserWs, resolveBrightDataBrowserWs } from './booking/brightdata'

export type ProxyKind = 'mobile' | 'residential'

export interface ProxyConfig {
  server: string
  username?: string
  password?: string
  raw: string
  kind: ProxyKind
}

export type ProxyMode = 'mobile' | 'residential' | 'prefer_mobile' | 'rotate_all'

let listCache: ProxyConfig[] | null = null
let cursor = 0
let vaultGetter: ((key: string) => string | undefined) | undefined

/** Branche le coffre Electron (appelé depuis providersBridge). */
export function setProxyVaultGetter(fn: (key: string) => string | undefined): void {
  vaultGetter = fn
  resetProxyCache()
}

export function resetProxyCache(): void {
  listCache = null
  cursor = 0
}

/** Parse une URL proxy en config Playwright. */
export function parseProxyUrl(raw: string, kind: ProxyKind = 'residential'): ProxyConfig | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const u = new URL(trimmed)
    if (!u.hostname) return null
    const protocol = (u.protocol || 'http:').replace(/:$/, '')
    const port =
      u.port || (protocol === 'https' ? '443' : protocol.startsWith('socks') ? '1080' : '80')
    const server = `${protocol}://${u.hostname}:${port}`
    const username = u.username ? decodeURIComponent(u.username) : undefined
    const password = u.password ? decodeURIComponent(u.password) : undefined
    return { server, username, password, raw: trimmed, kind }
  } catch {
    if (/^[\w.-]+:\d+$/.test(trimmed)) {
      return { server: `http://${trimmed}`, raw: trimmed, kind }
    }
    return null
  }
}

/**
 * Injecte un id de session sticky dans le username (patterns courants).
 * N’altère pas le mot de passe. Si le username contient déjà `session` /
 * `sessid`, on ne touche à rien.
 */
export function withStickySession(proxy: ProxyConfig, sessionId?: string): ProxyConfig {
  if (!proxy.username) return proxy
  const lower = proxy.username.toLowerCase()
  if (lower.includes('session') || lower.includes('sessid') || lower.includes('sess-')) {
    return proxy
  }
  const sid = sessionId || `sk${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  // Pattern le plus répandu chez les fournisseurs mobile/résidentiel
  const username = `${proxy.username}-session-${sid}`
  return { ...proxy, username }
}

function splitList(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function collect(
  envSingle: string | undefined,
  envList: string | undefined,
  vaultKey: string,
  kind: ProxyKind,
  get?: (key: string) => string | undefined
): ProxyConfig[] {
  const raws: string[] = []
  if (envSingle) raws.push(envSingle)
  if (envList) raws.push(...splitList(envList))
  if (get) {
    const fromVault = get(vaultKey)
    if (fromVault) {
      if (/[\n,;]/.test(fromVault)) raws.push(...splitList(fromVault))
      else raws.push(fromVault)
    }
  }
  const out: ProxyConfig[] = []
  const seen = new Set<string>()
  for (const r of raws) {
    const p = parseProxyUrl(r, kind)
    if (!p || seen.has(p.raw)) continue
    seen.add(p.raw)
    out.push(p)
  }
  return out
}

export function resolveProxyMode(): ProxyMode {
  const m = (process.env.SKITRACK_PROXY_MODE || 'residential').toLowerCase()
  if (m === 'mobile' || m === 'residential' || m === 'prefer_mobile' || m === 'rotate_all') {
    return m
  }
  return 'residential'
}

/**
 * Charge mobile + résidentiel, puis filtre selon le mode.
 */
export function loadProxyList(vaultGet?: (key: string) => string | undefined): ProxyConfig[] {
  if (listCache) return listCache

  const get = vaultGet ?? vaultGetter

  const mobile = collect(
    process.env.SKITRACK_MOBILE_PROXY || process.env.SKITRACK_MOBILE_PROXY_URL,
    process.env.SKITRACK_MOBILE_PROXY_LIST,
    'scrape_proxy_mobile',
    'mobile',
    get
  )

  const residential = collect(
    process.env.SKITRACK_PROXY ||
      process.env.SKITRACK_PROXY_URL ||
      process.env.BRIGHTDATA_RESIDENTIAL,
    process.env.SKITRACK_PROXY_LIST,
    'scrape_proxy',
    'residential',
    get
  )
  if (residential.length === 0) {
    const ws = resolveBrightDataBrowserWs(
      get ? { brightdata_browser: get('brightdata_browser') } : {},
      process.env
    )
    const derived = ws ? brightDataResidentialFromBrowserWs(ws) : undefined
    const parsed = derived ? parseProxyUrl(derived, 'residential') : null
    if (parsed) residential.push(parsed)
  }

  const mode = resolveProxyMode()
  let ordered: ProxyConfig[]
  switch (mode) {
    case 'mobile':
      ordered = mobile
      break
    case 'residential':
      ordered = residential
      break
    case 'rotate_all':
      ordered = [...mobile, ...residential]
      break
    case 'prefer_mobile':
    default:
      ordered = mobile.length > 0 ? mobile : residential
      // Si mobile présent, on peut enchaîner résidentiel en secours :
      if (mobile.length > 0 && residential.length > 0) {
        ordered = [...mobile, ...residential]
      }
      break
  }

  listCache = ordered
  return listCache
}

/**
 * Cible un pays sur un username Bright Data (`-country-fr`).
 * No-op si ce n'est pas du Bright Data, ou si le pays est déjà posé.
 */
export function withBrightDataCountry(proxy: ProxyConfig, country = 'fr'): ProxyConfig {
  if (!proxy.username || !/^brd-customer-/i.test(proxy.username)) return proxy
  if (/-country-/i.test(proxy.username)) return proxy
  const cc = (country || 'fr').toLowerCase()
  return { ...proxy, username: `${proxy.username}-country-${cc}` }
}

/**
 * Prochain proxy (round-robin). Session sticky par défaut : même IP tout
 * le walk SERP (pagination Booking). Bright Data est géociblé FR.
 */
export function nextProxy(
  vaultGet?: (key: string) => string | undefined,
  opts?: { sticky?: boolean; sessionId?: string }
): ProxyConfig | null {
  const list = loadProxyList(vaultGet)
  if (list.length === 0) return null
  let item = list[cursor % list.length]
  cursor += 1
  item = withBrightDataCountry(item, 'fr')
  const sticky = opts?.sticky !== false
  if (sticky) {
    item = withStickySession(item, opts?.sessionId)
  }
  return item
}

export function currentProxy(vaultGet?: (key: string) => string | undefined): ProxyConfig | null {
  const list = loadProxyList(vaultGet)
  if (list.length === 0) return null
  return list[cursor % list.length]
}

export function toPlaywrightProxy(p: ProxyConfig): {
  server: string
  username?: string
  password?: string
} {
  return {
    server: p.server,
    ...(p.username ? { username: p.username } : {}),
    ...(p.password ? { password: p.password } : {})
  }
}

export function proxyCount(vaultGet?: (key: string) => string | undefined): number {
  return loadProxyList(vaultGet).length
}

export function proxyStats(vaultGet?: (key: string) => string | undefined): {
  mobile: number
  residential: number
  mode: ProxyMode
} {
  // Bypass cache filter: recount from env
  resetProxyCache()
  const all = loadProxyList(vaultGet)
  return {
    mobile: all.filter((p) => p.kind === 'mobile').length,
    residential: all.filter((p) => p.kind === 'residential').length,
    mode: resolveProxyMode()
  }
}
