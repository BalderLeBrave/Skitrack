/**
 * Lance la recherche Airbnb automatisée et fusionne le résultat dans la liste.
 * Inclut un timeout global côté renderer (Promise.race).
 */

import { parseAirbnbClipboard } from './airbnbClip'
import { mergeAirbnbPaste } from './airbnbMerge'
import { enrichWithAccess } from './lodgingAccess'
import type { Lodging } from './lodgings'
import { stationNameOf } from './stations'

/** Délai max global de la recherche (ms). Couvre retries Playwright inclus. */
export const AIRBNB_SEARCH_TIMEOUT_MS = 120_000

export interface RunAirbnbSearchParams {
  domainId: number
  domainName: string
  villageOrMinAlt: number
  checkIn: string
  checkOut: string
  adults: number
  children?: number
  capacity: number
  nights: number
  imported: Lodging[]
  /** Override timeout global (ms). */
  timeoutMs?: number
}

export interface RunAirbnbSearchOk {
  ok: true
  imported: Lodging[]
  added: number
  updated: number
  count: number
  /**
   * Annonces déjà connues que ce relevé n'a pas retrouvées à ces dates.
   *
   * Un compte, pas une phrase : la mise en mots appartient à l'écran, qui a la
   * langue courante sous la main. Voir `LodgingsPage`.
   */
  missing: number
  message: string
}

export interface RunAirbnbSearchFail {
  ok: false
  error: string
  timedOut?: boolean
}

export type RunAirbnbSearchResult = RunAirbnbSearchOk | RunAirbnbSearchFail

function timeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    window.setTimeout(() => {
      const err = new Error(
        `Délai dépassé (${Math.round(ms / 1000)}s). La recherche Airbnb a été interrompue. ` +
          'Réessayez, vérifiez le proxy, ou validez un CAPTCHA s’il était ouvert.'
      )
      ;(err as Error & { timedOut?: boolean }).timedOut = true
      reject(err)
    }, ms)
  })
}

async function scrapeOnce(params: RunAirbnbSearchParams) {
  return window.skitrack.airbnbScrape({
    // Airbnb range la destination dans le chemin de l'URL et ne connaît que
    // des noms de lieux : « Les Arcs », pas « Les Arcs – Peisey-Vallandry ».
    city: stationNameOf(params.domainName) || params.domainName,
    checkIn: params.checkIn || undefined,
    checkOut: params.checkOut || undefined,
    adults: params.adults,
    children: params.children ?? 0,
    scrollCount: 3,
    maxRetries: 3,
    // Sous-timeout par tentative Playwright (le global race coupe le tout)
    // timeoutMs is supported by main scrape params via AirbnbScrapeParams in main
  })
}

export async function runAirbnbSearch(
  params: RunAirbnbSearchParams
): Promise<RunAirbnbSearchResult> {
  const globalTimeout = params.timeoutMs ?? AIRBNB_SEARCH_TIMEOUT_MS

  let outcome: Awaited<ReturnType<typeof window.skitrack.airbnbScrape>>
  try {
    outcome = await Promise.race([scrapeOnce(params), timeoutPromise(globalTimeout)])
  } catch (err) {
    const timedOut = Boolean(err && typeof err === 'object' && (err as { timedOut?: boolean }).timedOut)
    return {
      ok: false,
      timedOut,
      error: err instanceof Error ? err.message : String(err)
    }
  }

  if (!outcome.ok) {
    const isTimeout = /timeout|délai|timed out/i.test(outcome.error)
    return {
      ok: false,
      timedOut: isTimeout,
      error:
        outcome.error +
        (outcome.attempts ? ` (${outcome.attempts} essai(s))` : '')
    }
  }

  const { listings, errors, meta } = parseAirbnbClipboard(outcome.payloadJson)
  if (listings.length === 0) {
    return {
      ok: false,
      error: errors[0] ?? 'Aucune annonce exploitable dans la page Airbnb.'
    }
  }

  const { imported, added, updated, missing } = mergeAirbnbPaste(params.imported, listings, {
    checkIn: meta.checkIn ?? params.checkIn,
    checkOut: meta.checkOut ?? params.checkOut,
    domainId: params.domainId,
    capacity: params.capacity,
    nights: params.nights,
    fallbackAltitude: params.villageOrMinAlt
  })

  if (added.length === 0 && updated === 0) {
    return {
      ok: true,
      imported,
      added: 0,
      updated: 0,
      count: listings.length,
      missing,
      message: `Les ${listings.length} annonce(s) sont déjà à jour.`
    }
  }

  const { lodgings: enriched, note } = await enrichWithAccess(added, params.domainId)
  const byId = new Map(enriched.map((l) => [l.id, l]))
  const finalList = imported.map((l) => byId.get(l.id) ?? l)

  const parts = [
    `${added.length} nouvelle(s)`,
    updated > 0 ? `${updated} prix actualisé(s)` : null,
    outcome.captchaSolved ? 'CAPTCHA validé' : null,
    outcome.attempts && outcome.attempts > 1 ? `essai ${outcome.attempts}` : null
  ].filter(Boolean)

  return {
    ok: true,
    imported: finalList,
    added: added.length,
    updated,
    count: outcome.count,
    missing,
    message: parts.join(' · ') + (note ? ` — ${note}` : '')
  }
}
