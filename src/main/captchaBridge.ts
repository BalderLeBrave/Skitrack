/**
 * Pont Electron → `CaptchaSolver` du sidecar (2captcha).
 *
 * Le solveur existe (`sidecar/skitrack/services/captcha_solver.py`) et est
 * injecté dans `POST /api/scrape/{provider}`. Le chemin UI (Playwright
 * Electron) ne l'appelait jamais : Airbnb attendait un geste humain, les
 * OTA webscrape levaient `looksBlocked` sans tenter la clé déjà prévue.
 *
 * Ici on **rebranche** ce qui existe. Pas de nouvelle technique d'évasion,
 * pas de remplacement du wait humain. Si le sidecar n'est pas prêt ou si
 * la clé manque, on rend `null` et l'appelant pose `challenge_unresolved`.
 */

import type { Page } from 'playwright'

export interface SidecarHandle {
  baseUrl: string
  token: string
}

let sidecarOf: () => SidecarHandle | null = () => null

export function bindSidecarCaptcha(getter: () => SidecarHandle | null): void {
  sidecarOf = getter
}

export async function extractRecaptchaSiteKey(page: Page): Promise<string | null> {
  try {
    return await page.evaluate(() => {
      const attr =
        document.querySelector('[data-sitekey]')?.getAttribute('data-sitekey') ??
        document.querySelector('.g-recaptcha')?.getAttribute('data-sitekey')
      if (attr) return attr
      const iframe = document.querySelector<HTMLIFrameElement>(
        'iframe[src*="recaptcha"], iframe[src*="google.com/recaptcha"]'
      )
      if (!iframe?.src) return null
      try {
        return new URL(iframe.src).searchParams.get('k')
      } catch {
        return null
      }
    })
  } catch {
    return null
  }
}

/**
 * Demande un jeton reCAPTCHA au solveur déjà présent dans le sidecar.
 *
 * `null` = pas appelé, pas de clé, timeout, ou sidecar down. L'appelant
 * n'a pas le droit d'en déduire une liste vide : il pose
 * `challenge_unresolved`.
 */
export async function solveRecaptchaViaSidecar(
  siteKey: string,
  pageUrl: string,
  version: 'v2' | 'v3' = 'v2'
): Promise<string | null> {
  const handle = sidecarOf()
  if (!handle) return null
  try {
    const resp = await fetch(`${handle.baseUrl}/api/scrape/captcha/solve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Skitrack-Token': handle.token
      },
      body: JSON.stringify({ site_key: siteKey, page_url: pageUrl, version })
    })
    if (!resp.ok) return null
    const body = (await resp.json()) as { success?: boolean; token?: string }
    return body.success && body.token ? body.token : null
  } catch {
    return null
  }
}

export async function trySolveVisibleCaptcha(page: Page): Promise<boolean> {
  const siteKey = await extractRecaptchaSiteKey(page)
  if (!siteKey) return false
  const token = await solveRecaptchaViaSidecar(siteKey, page.url() || '')
  if (!token) return false
  try {
    await page.evaluate((tok) => {
      const area = document.querySelector<HTMLTextAreaElement>('#g-recaptcha-response')
      if (area) area.value = tok
      const w = window as unknown as {
        grecaptcha?: { getResponse?: () => string }
        ___grecaptcha_cfg?: { clients?: Record<string, unknown> }
      }
      const clients = w.___grecaptcha_cfg?.clients
      if (clients) {
        /* jeton posé : le callback du widget, s'il existe, reste au site. */
        void clients
      }
    }, token)
    return true
  } catch {
    return false
  }
}
