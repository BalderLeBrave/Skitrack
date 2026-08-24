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
 *
 * `state: 'attached'` et non « visible » : plusieurs centrales — 2 Alpes en
 * tête — montent un calendrier maison qui garde le vrai `input[name="datedeb"]`
 * en `display:none` et n'affiche qu'un habillage. Attendre la visibilité y
 * expire toujours, alors que le moteur est prêt. Le champ n'est pas dans le
 * HTML servi : sa présence dans le DOM reste donc le signal que le script a
 * monté le formulaire, et `submitSearch` écrit dedans par `evaluate`, ce qui
 * ne demande aucune visibilité.
 *
 * Obscura 0.2.1 : `waitForSelector` ne voit pas `datedeb` alors que
 * `page.evaluate(querySelector)` si. On poll `evaluate` en parallèle.
 */
export async function waitForIngenieForm(page: Page, selectors: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const attached = await page.evaluate(() =>
        Boolean(document.querySelector('input[name="datedeb"], select[name="datedeb"]'))
      )
      if (attached) return
    } catch {
      // navigation / context momentané
    }
    try {
      await page.waitForSelector(selectors, {
        timeout: Math.min(400, Math.max(50, deadline - Date.now())),
        state: 'attached'
      })
      return
    } catch {
      // Obscura : le moteur de sélecteurs Playwright ne voit pas datedeb
      // alors que `evaluate` si. On reboucle jusqu’au timeout AJAX.
    }
  }
  throw new Error(
    `Timeout AJAX formulaire Ingénie (${Math.round(timeoutMs / 1000)}s) — ` +
      `le moteur n’a pas exposé datedeb (spinner bloqué ou script en échec).`
  )
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
  // Troisième coureur : poll `evaluate`. Sous Obscura, `waitForSelector` et
  // `page.$` sont aveugles (voir waitForIngenieForm) — sans ce poll, seule la
  // sonde réseau pouvait gagner la course, et une centrale dont les prix
  // arrivent par le DOM partait en faux timeout.
  const domHas = (): Promise<boolean> =>
    page
      .evaluate(() =>
        Boolean(
          document.querySelector('.prix_en_cours, .bloc_resultat, .liste_resultats, .fiche-info')
        )
      )
      .catch(() => false)
  const pollPromise = (async (): Promise<'poll' | null> => {
    // `isClosed` arrête le poll perdant : la course résolue, la page se ferme
    // et la boucle n'a pas à tourner jusqu'au timeout sur un contexte mort.
    while (Date.now() < deadline && !page.isClosed()) {
      if (await domHas()) return 'poll'
      await new Promise((r) => setTimeout(r, 300))
    }
    return null
  })()

  const winner = await Promise.race([
    resultPromise.catch(() => null),
    ajaxPromise,
    pollPromise
  ])

  if (winner === 'dom' || winner === 'ajax' || winner === 'poll') {
    await new Promise((r) => setTimeout(r, 400))
    return
  }

  // Dernière chance : networkidle court
  try {
    await page.waitForLoadState('networkidle', { timeout: Math.min(8_000, remaining()) })
  } catch {
    // ignore
  }

  if (await domHas()) return

  throw new Error(
    `Timeout AJAX résultats Ingénie (${Math.round(timeoutMs / 1000)}s). ` +
      `Sonde: ${probe.summary()}`
  )
}
