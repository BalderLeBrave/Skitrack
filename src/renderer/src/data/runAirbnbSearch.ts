/**
 * Lance la recherche Airbnb automatisée et fusionne le résultat dans la liste.
 * Inclut un timeout global côté renderer (Promise.race).
 */

import { parseAirbnbClipboard } from './airbnbClip'
import { mergeAirbnbPaste } from './airbnbMerge'
import { enrichWithAccess } from './lodgingAccess'
import type { Lodging } from './lodgings'
import { stationNameOf } from './stations'
import type { SearchZone } from '@shared/geo'
import { filterToZone } from '@shared/geo'

/** Délai max global de la recherche (ms). Couvre retries Playwright inclus. */
export const AIRBNB_SEARCH_TIMEOUT_MS = 120_000

export interface RunAirbnbSearchParams {
  domainId: number
  /** Identifiant du domaine côté moteur local — voir `Domain.engineId`. */
  engineDomainId?: number
  domainName: string
  villageOrMinAlt: number
  checkIn: string
  checkOut: string
  adults: number
  children?: number
  capacity: number
  nights: number
  imported: Lodging[]
  /**
   * Zone du domaine. Les annonces dont Airbnb publie une position hors de cette
   * zone sont écartées avant fusion.
   *
   * Le relevé part d'un **nom** de station, seul format qu'Airbnb accepte dans
   * son chemin d'URL, et un nom a des homonymes. Le scraper n'a aucun moyen de
   * le savoir ; c'est ici, où le domaine est connu, que la question se tranche.
   * Absente si le domaine n'a pas de coordonnées : on ne rejette rien sur une
   * zone qu'on ne sait pas tracer.
   */
  zone?: SearchZone | null
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


/** Libellé Airbnb pour les stations (souvent différent du nom OSM / FM). */
function airbnbPlaceName(domainName: string): string {
  const key = domainName.trim().toLowerCase()
  const map: Record<string, string> = {
    'les 2 alpes': 'Les 2 Alpes',
    'les deux alpes': 'Les 2 Alpes',
    "val d'isère": "Val d'Isère",
    'val d isere': "Val d'Isère",
    'tignes': 'Tignes',
    'serre chevalier': 'Serre Chevalier',
    'val thorens': 'Val Thorens',
    'courchevel': 'Courchevel',
    'la plagne': 'La Plagne',
    'les arcs': 'Les Arcs',
    'chamonix': 'Chamonix',
    'megève': 'Megève',
    'megeve': 'Megève',
    'méribel': 'Meribel',
    'meribel': 'Meribel'
  }
  for (const [k, v] of Object.entries(map)) {
    if (key === k || key.startsWith(k + ' ') || key.includes(k)) return v
  }
  return stationNameOf(domainName) || domainName
}

async function scrapeOnce(params: RunAirbnbSearchParams) {
  return window.skitrack.airbnbScrape({
    // Airbnb range la destination dans le chemin de l'URL et ne connaît que
    // des noms de lieux : « Les Arcs », pas « Les Arcs – Peisey-Vallandry ».
    city: airbnbPlaceName(params.domainName),
    checkIn: params.checkIn || undefined,
    checkOut: params.checkOut || undefined,
    adults: params.adults,
    children: params.children ?? 0,
    scrollCount: 3,
    maxRetries: 3,
    // Headed (défaut main) : meilleur score reCAPTCHA. Ne pas forcer headless.
    timeoutMs: 60_000
  })
}

/**
 * Relève Airbnb automatisée (Playwright), en parallèle des autres sources.
 * En cas d’échec (CAPTCHA, robots, timeout), l’UI conserve le lien de redirection.
 */
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

  // Rattachement géographique. Les annonces sans position publiée sont
  // conservées — Airbnb n'en donne pas toujours — mais celles qu'il place
  // ailleurs sont écartées ici, avant qu'elles n'entrent dans la liste.
  const zoned = params.zone
    ? filterToZone(listings, params.zone, (l) => ({ lat: l.lat, lon: l.lon }))
    : { kept: listings, rejected: [], unlocated: listings.length }
  if (zoned.rejected.length > 0) {
    console.info(
      `[SKITRACK] Airbnb : ${zoned.rejected.length} annonce(s) hors de la zone du domaine, écartée(s) —`,
      zoned.rejected.slice(0, 5).map((l) => l.name)
    )
  }
  if (zoned.kept.length === 0) {
    return {
      ok: false,
      error:
        `Les ${listings.length} annonce(s) rendues par Airbnb sont toutes hors du périmètre du domaine. ` +
        'Le nom de station envoyé a probablement été compris comme une autre commune.'
    }
  }

  const { imported, added, updated, missing } = mergeAirbnbPaste(params.imported, zoned.kept, {
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
      count: zoned.kept.length,
      missing,
      message: `Les ${zoned.kept.length} annonce(s) sont déjà à jour.`
    }
  }

  const { lodgings: enriched, note } = await enrichWithAccess(added, params.engineDomainId)
  const byId = new Map(enriched.map((l) => [l.id, l]))
  const finalList = imported.map((l) => byId.get(l.id) ?? l)

  const parts = [
    `${added.length} nouvelle(s)`,
    updated > 0 ? `${updated} prix actualisé(s)` : null,
    // Le rejet géographique se dit : une recherche qui rend moins d'annonces
    // que la page Airbnb n'en montrait doit expliquer où sont passées les
    // autres, sinon le relevé passe pour incomplet.
    zoned.rejected.length > 0 ? `${zoned.rejected.length} hors zone écartée(s)` : null,
    outcome.captchaSolved ? 'CAPTCHA validé' : null,
    outcome.attempts && outcome.attempts > 1 ? `essai ${outcome.attempts}` : null
  ].filter(Boolean)

  return {
    ok: true,
    imported: finalList,
    added: added.length,
    updated,
    count: zoned.kept.length,
    missing,
    message: parts.join(' · ') + (note ? ` — ${note}` : '')
  }
}
