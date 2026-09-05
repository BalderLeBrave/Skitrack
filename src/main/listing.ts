/**
 * Lecture d'une annonce de logement à partir de son URL.
 *
 * Politique produit (barrières Claude retirées, 2026-09-01) :
 *
 * - Airbnb, Booking, Abritel, Gîtes de France : lisibles.
 *   CozyCozy est interdit (doublon Airbnb / Booking / Gîtes).
 * - `robots.txt` n'est pas un veto interne (`robots.ts` est permissif).
 * - User-Agent Chrome desktop, pas un identifiant d'application.
 * - Le rendu Playwright réutilise le contexte stealth / proxy de
 *   `webscrape/shared.ts` (évasion WAF conservée).
 * - Un 403 n'est **pas** relancé dans le navigateur : c'est un refus,
 *   le formulaire manuel prend le relais.
 *
 * Cette lecture vit dans le processus principal parce que le renderer est sous
 * une CSP stricte qui lui interdit toute origine distante — et c'est très bien
 * ainsi : le HTML tiers n'est jamais exécuté, seulement analysé comme du texte.
 */

import type { ListingExtract } from '@shared/ipc-contract'
import { isForbiddenListingHost } from '@shared/listingHosts'
import {
  classifyHttpStatus,
  resolveFetchStrategy,
  retryDelayMs,
  type FetchStatus,
  type ResolutionStrategy
} from '@shared/listingImport'
import { parseMetadata } from '@shared/normalizeJsonLd'
import { allowsPath } from './providers/station/robots'
import { withPage } from './providers/webscrape/shared'
import { generateListingHash, generateOfferHash } from './listingHash'

export { readCoords } from '@shared/listingCoords'

/** Chrome desktop — le même que le socle Playwright stealth. */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const TIMEOUT_MS = 15_000
/** Au-delà, ce n'est pas une page d'annonce : on abandonne plutôt que d'avaler. */
const MAX_BYTES = 3_000_000

function siteOf(host: string): string {
  return host.replace(/^www\./, '')
}

function emptyExtract(
  url: string,
  site: string,
  blockedReason: string | null,
  extra?: Partial<ListingExtract>
): ListingExtract {
  return {
    ok: blockedReason === null,
    blockedReason,
    url,
    site,
    title: null,
    description: null,
    images: [],
    price: null,
    currency: null,
    lat: null,
    lon: null,
    rooms: null,
    capacity: null,
    address: null,
    missing: ['titre', 'prix', 'chambres', 'capacité', 'position'],
    fetchStatus: extra?.fetchStatus ?? 'parse_error',
    resolutionStrategy: extra?.resolutionStrategy ?? 'user_manual_entry',
    listingHash: extra?.listingHash,
    completenessScore: extra?.completenessScore ?? 0,
    missingCriticalFields: extra?.missingCriticalFields ?? ['priceBase', 'checkIn', 'checkOut', 'guests'],
    ...extra
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function get(url: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, {
    signal,
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }
  })
}

/**
 * `robots.txt` de l'hôte — **délégué à `providers/station/robots.ts`**.
 * Permissif depuis le 2026-08-26 : rend toujours `true`.
 */
export async function isAllowedByRobots(target: URL, signal: AbortSignal): Promise<boolean> {
  const verdict = await allowsPath(target.origin, target.pathname + target.search, async (url) => {
    const res = await get(url, signal)
    return { status: res.status, text: res.ok ? await res.text() : '' }
  })
  return verdict.allowed
}

async function renderHtml(url: string): Promise<string | null> {
  try {
    return await withPage(true, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS * 3 })
      await page.waitForTimeout(2_500)
      return await page.content()
    })
  } catch {
    return null
  }
}

function toExtract(
  parsed: ReturnType<typeof parseMetadata>,
  rawUrl: string,
  site: string,
  status: FetchStatus,
  strategy: ResolutionStrategy
): ListingExtract {
  const geo = parsed.geo
  const missingLabels: [unknown, string][] = [
    [parsed.title, 'titre'],
    [parsed.priceBase, 'prix'],
    [parsed.rooms, 'chambres'],
    [parsed.guests ?? parsed.occupancyMax, 'capacité'],
    [geo, 'position']
  ]
  return {
    ok: status === 'success' || status === 'partial_content',
    blockedReason: status === 'access_denied' ? `${site} a refusé la lecture automatique.` : null,
    url: parsed.canonicalUrl?.value ?? rawUrl,
    site,
    title: parsed.title?.value ?? null,
    description: parsed.description?.value ?? null,
    images: parsed.image ? [parsed.image.value] : [],
    price: parsed.priceBase?.value ?? null,
    currency: parsed.priceBase?.currency ?? null,
    lat: geo?.value.lat ?? null,
    lon: geo?.value.lon ?? null,
    rooms: parsed.rooms?.value ?? null,
    capacity: parsed.guests?.value ?? parsed.occupancyMax?.value ?? null,
    address: parsed.addressText?.value ?? null,
    missing: missingLabels.filter(([v]) => v == null).map(([, l]) => l),
    fetchStatus: status,
    resolutionStrategy: strategy,
    canonicalUrl: parsed.canonicalUrl?.value ?? null,
    priceUnit: parsed.priceBase?.unit ?? null,
    priceIsFrom: parsed.priceBase?.isFrom ?? false,
    completenessScore: parsed.completenessScore,
    listingHash: parsed.listingHash,
    offerHash: parsed.offerHash,
    missingCriticalFields: parsed.missingCriticalFields,
    geoPrecision: geo?.precision ?? 'none',
    feesComplete: parsed.fees?.isComplete ?? false
  }
}

export async function fetchListing(rawUrl: string): Promise<ListingExtract> {
  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return emptyExtract(rawUrl, '—', 'URL invalide.', { fetchStatus: 'parse_error' })
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return emptyExtract(rawUrl, '—', 'Seules les adresses http(s) sont acceptées.', { fetchStatus: 'parse_error' })
  }

  const host = target.hostname.toLowerCase()
  const site = siteOf(host)
  const listingHash = generateListingHash(target.toString())

  if (isForbiddenListingHost(target.toString())) {
    return emptyExtract(rawUrl, site, `${site} n’est pas lu automatiquement (agrégateur).`, {
      fetchStatus: 'access_denied',
      listingHash,
      resolutionStrategy: 'user_manual_entry'
    })
  }

  let attempt = 0
  let lastStatus: FetchStatus = 'network_error'
  let lastHttp: number | undefined
  let html: string | null = null

  while (attempt < 4) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      void (await isAllowedByRobots(target, controller.signal))
      const res = await get(target.toString(), controller.signal)
      lastHttp = res.status
      const classified = classifyHttpStatus(res.status)
      if (classified) {
        lastStatus = classified
        const strategy = resolveFetchStrategy({ status: classified }, attempt)
        if (strategy === 'auto_retry') {
          attempt++
          await sleep(retryDelayMs(attempt - 1))
          continue
        }
        return emptyExtract(rawUrl, site, `${site} a répondu ${res.status}.`, {
          fetchStatus: classified,
          listingHash,
          resolutionStrategy: strategy
        })
      }

      if (res.status >= 400) {
        lastStatus = 'network_error'
        return emptyExtract(rawUrl, site, `${site} a répondu ${res.status}.`, {
          fetchStatus: 'network_error',
          listingHash,
          resolutionStrategy: 'user_manual_entry'
        })
      }

      const buffer = await res.arrayBuffer()
      if (buffer.byteLength > MAX_BYTES) {
        return emptyExtract(rawUrl, site, 'Page trop volumineuse pour être analysée.', {
          fetchStatus: 'parse_error',
          listingHash
        })
      }
      html = new TextDecoder('utf-8').decode(buffer)
      lastStatus = 'success'
      break
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError'
      lastStatus = aborted ? 'timeout' : 'network_error'
      const strategy = resolveFetchStrategy({ status: lastStatus }, attempt)
      if (strategy === 'auto_retry') {
        attempt++
        await sleep(retryDelayMs(attempt - 1))
        continue
      }
      return emptyExtract(
        rawUrl,
        site,
        `Lecture impossible (${aborted ? 'délai dépassé' : String(err)}).`,
        { fetchStatus: lastStatus, listingHash, resolutionStrategy: 'user_manual_entry' }
      )
    } finally {
      clearTimeout(timer)
    }
  }

  if (html !== null) {
    const preview = parseMetadata(html, target.toString(), { listingHash })
    const empty =
      !preview.title &&
      !preview.priceBase &&
      !preview.geo &&
      (!preview.rawJsonLd || (Array.isArray(preview.rawJsonLd) && preview.rawJsonLd.length === 0))
    if (empty) {
      const rendered = await renderHtml(target.toString())
      if (rendered !== null) html = rendered
    }
  }

  if (html === null) {
    return emptyExtract(rawUrl, site, `${site} a répondu ${lastHttp ?? 'sans contenu lisible'}.`, {
      fetchStatus: lastStatus,
      listingHash,
      resolutionStrategy: 'user_manual_entry'
    })
  }

  const parsed = parseMetadata(html, target.toString(), { listingHash })
  parsed.listingHash = listingHash
  const stayIn = parsed.checkIn?.value
  const stayOut = parsed.checkOut?.value
  const guests = parsed.guests?.value ?? parsed.occupancyMax?.value
  if (stayIn && stayOut && guests != null) {
    parsed.offerHash = generateOfferHash(listingHash, stayIn, stayOut, guests)
  }

  const thin = parsed.completenessScore < 60
  const status: FetchStatus = thin ? 'partial_content' : 'success'
  const strategy: ResolutionStrategy =
    status === 'partial_content' ? 'partial_with_form' : parsed.completenessScore < 80 ? 'partial_with_form' : 'proceed'
  parsed.fetchMetadata.fetchStatus = status
  parsed.fetchMetadata.resolutionStrategy = strategy
  parsed.fetchMetadata.attempts = Math.max(1, attempt + 1)
  parsed.fetchMetadata.httpStatus = lastHttp

  return toExtract(parsed, rawUrl, site, status, strategy)
}
