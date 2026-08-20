/**
 * Timeouts et sonde AJAX / JSONP pour les centrales Ingénie.
 *
 * Ingénie charge le moteur et les dispos via **JSONP** (balise `<script>`),
 * pas via XHR classique :
 *
 *   GET {origin}/widget-dispos?jsonpCallback=onCallResponse_N&action=…
 *   GET {origin}/booking?jsonpCallback=…&action=…
 *
 * Headers observés (Les 2 Alpes, 2026-08) :
 *   content-type: application/javascript; charset=utf-8
 *   access-control-allow-origin: *
 *   access-control-allow-headers: x-requested-with
 *   cache-control: no-store, no-cache, must-revalidate
 *   set-cookie: PHPSESSID=…; SameSite=None; Secure; HttpOnly
 *
 * Pas de header custom côté client (JSONP = script src). Les formulaires
 * « Rechercher » déclenchent ensuite navigation ou rechargement de listes.
 */

import type { Page, Request, Response } from 'playwright'
import { debugLog } from '../debug'

/** Budgets temps dédiés au cycle AJAX Ingénie (ms). */
export const AJAX_TIMEOUT = {
  /** Chargement initial du formulaire (spinner → champs datedeb). */
  formMs: 30_000,
  /** Réponse JSONP widget-dispos / booking après action. */
  jsonpMs: 20_000,
  /** Apparition des prix après clic Rechercher. */
  resultsMs: 25_000,
  /** Navigation / networkidle de secours après submit. */
  navigationMs: 30_000
} as const

const INTERESTING =
  /widget-dispos|\/booking(?:\?|$)|moteur|ajax|dispo|jsonpCallback|action=result/i

export interface AjaxExchange {
  method: string
  url: string
  resourceType: string
  requestHeaders: Record<string, string>
  status?: number
  responseHeaders?: Record<string, string>
  contentType?: string
  at: number
}

export interface AjaxProbe {
  exchanges: AjaxExchange[]
  dispose: () => void
  /** Attend une réponse JSONP/XHR matching, ou timeout. */
  waitForInteresting: (timeoutMs: number) => Promise<AjaxExchange | null>
  summary: () => string
}

function pickHeaders(
  headers: Record<string, string>,
  keys: string[]
): Record<string, string> {
  const out: Record<string, string> = {}
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  )
  for (const k of keys) {
    const v = lower[k.toLowerCase()]
    if (v) out[k] = v
  }
  return out
}

const REQ_KEYS = [
  'accept',
  'content-type',
  'x-requested-with',
  'origin',
  'referer',
  'user-agent',
  'cookie'
]
const RES_KEYS = [
  'content-type',
  'access-control-allow-origin',
  'access-control-allow-headers',
  'cache-control',
  'set-cookie',
  'server',
  'x-xss-protection'
]

/**
 * Attache une sonde réseau sur la page : journalise les appels Ingénie
 * et permet d’attendre une réponse avec timeout explicite.
 */
export function attachAjaxProbe(page: Page): AjaxProbe {
  const exchanges: AjaxExchange[] = []
  const waiters: Array<{
    resolve: (e: AjaxExchange | null) => void
    timer: ReturnType<typeof setTimeout>
  }> = []

  const onRequest = (req: Request): void => {
    const url = req.url()
    if (!INTERESTING.test(url)) return
    const entry: AjaxExchange = {
      method: req.method(),
      url,
      resourceType: req.resourceType(),
      requestHeaders: pickHeaders(req.headers(), REQ_KEYS),
      at: Date.now()
    }
    exchanges.push(entry)
    debugLog('station-ajax', 'request', {
      method: entry.method,
      type: entry.resourceType,
      url: url.slice(0, 180),
      headers: entry.requestHeaders
    })
  }

  const onResponse = async (res: Response): Promise<void> => {
    const url = res.url()
    if (!INTERESTING.test(url)) return
    const headers = res.headers()
    const entry: AjaxExchange = {
      method: res.request().method(),
      url,
      resourceType: res.request().resourceType(),
      requestHeaders: pickHeaders(res.request().headers(), REQ_KEYS),
      status: res.status(),
      responseHeaders: pickHeaders(headers, RES_KEYS),
      contentType: headers['content-type'] ?? headers['Content-Type'],
      at: Date.now()
    }
    exchanges.push(entry)
    debugLog('station-ajax', 'response', {
      status: entry.status,
      type: entry.resourceType,
      contentType: entry.contentType,
      url: url.slice(0, 180),
      headers: entry.responseHeaders
    })
    for (const w of waiters.splice(0)) {
      clearTimeout(w.timer)
      w.resolve(entry)
    }
  }

  page.on('request', onRequest)
  page.on('response', (res) => {
    void onResponse(res)
  })

  return {
    exchanges,
    dispose: () => {
      page.off('request', onRequest)
      for (const w of waiters.splice(0)) {
        clearTimeout(w.timer)
        w.resolve(null)
      }
    },
    waitForInteresting(timeoutMs: number) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const i = waiters.findIndex((w) => w.timer === timer)
          if (i >= 0) waiters.splice(i, 1)
          resolve(null)
        }, timeoutMs)
        waiters.push({ resolve, timer })
      })
    },
    summary() {
      if (exchanges.length === 0) return 'aucun échange AJAX/JSONP Ingénie capturé'
      return exchanges
        .slice(-8)
        .map((e) => {
          const st = e.status != null ? String(e.status) : '…'
          const ct = e.contentType?.split(';')[0] ?? '?'
          return `${e.method} ${st} ${ct} ${e.url.slice(0, 100)}`
        })
        .join(' | ')
    }
  }
}

/**
 * Attend le formulaire moteur, avec erreur claire si le timeout AJAX expire.
 */
export async function waitForIngenieForm(page: Page, selectors: string, timeoutMs: number): Promise<void> {
  try {
    await page.waitForSelector(selectors, { timeout: timeoutMs })
  } catch {
    throw new Error(
      `Timeout AJAX formulaire Ingénie (${Math.round(timeoutMs / 1000)}s) — ` +
        `le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).`
    )
  }
}

/**
 * Après « Rechercher » : prix DOM ou réponse réseau, avec timeout global.
 */
export async function waitForIngenieResults(
  page: Page,
  probe: AjaxProbe,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const sel = '.prix_en_cours, .bloc_resultat, .liste_resultats, .fiche-info'
  const remaining = (): number => Math.max(500, deadline - Date.now())

  const resultPromise = page.waitForSelector(sel, { timeout: remaining() }).then(() => 'dom' as const)
  const ajaxPromise = probe.waitForInteresting(remaining()).then((e) => (e ? 'ajax' as const : null))

  const winner = await Promise.race([
    resultPromise.catch(() => null),
    ajaxPromise
  ])

  if (winner === 'dom' || winner === 'ajax') {
    await new Promise((r) => setTimeout(r, 400))
    return
  }

  // Dernière chance : networkidle court
  try {
    await page.waitForLoadState('networkidle', { timeout: Math.min(8_000, remaining()) })
  } catch {
    // ignore
  }

  const has = await page.$(sel)
  if (has) return

  throw new Error(
    `Timeout AJAX résultats Ingénie (${Math.round(timeoutMs / 1000)}s). ` +
      `Sonde: ${probe.summary()}`
  )
}
