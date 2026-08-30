/**
 * Providers AccommodationProvider basés sur Playwright (repli hors API).
 *
 * ⚠ Scraping — robots.txt / CGU souvent interdisent. Les connecteurs API
 * (Booking Demand, Expedia Rapid, LiteAPI) restent prioritaires quand une clé
 * est présente : ces providers web sont destinés au mode « scrape » explicite.
 */

import type { Page } from 'playwright'
import type { Accommodation, AccommodationProvider, ProviderHealth, SearchParams } from '../types'
import {
  extractBookingCards,
  extractCozycozyCards,
  extractExpediaFamilyCards,
  extractGitesCards,
  type RawCard
} from './extractors'
import {
  baseAccommodation,
  parsePrice,
  scrollPage,
  sleep,
  withPage,
  withRetries,
  type ScrapeAttemptOptions
} from './shared'
import {
  bookingSearchUrl,
  cozycozySearchUrl,
  expediaSearchUrl,
  gitesSearchUrl
} from './urls'

function mapCards(
  source: string,
  cards: RawCard[],
  params: SearchParams
): Accommodation[] {
  const out: Accommodation[] = []
  for (const c of cards) {
    if (!c.title || !c.url) continue
    const price = parsePrice(c.priceText)
    const rating = c.ratingText ? parseFloat(c.ratingText.replace(',', '.')) : undefined
    out.push(
      baseAccommodation(
        source,
        {
          sourceId: c.sourceId,
          title: c.title,
          url: c.url,
          // Position de la carte de résultat (Booking : `data-atlas-latlng`).
          // Absente sur les autres sources : le champ reste vide.
          latitude: c.lat,
          longitude: c.lon,
          totalPrice: price,
          currency: 'EUR',
          rating: Number.isFinite(rating) ? rating : undefined,
          // Taille du bien, telle que la page de résultats l'écrit. Ces champs
          // existaient au modèle pivot et personne ne les remplissait : les
          // annonces Booking ressortaient sans chambres ni surface, et l'écran
          // en concluait que « le relevé n'a rien rapporté ».
          bedrooms: c.bedrooms,
          beds: c.beds,
          areaSqm: c.areaSqm,
          images: c.image ? [c.image] : undefined
        },
        params
      )
    )
  }
  return out
}

async function loadAndExtract(
  page: Page,
  url: string,
  timeoutMs: number,
  extract: () => RawCard[],
  scrolls = 2
): Promise<RawCard[]> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
  await sleep(1500 + Math.random() * 800)
  await scrollPage(page, scrolls)
  try {
    await page.waitForLoadState('networkidle', { timeout: 6_000 })
  } catch {
    // ignore
  }
  await sleep(500)
  return page.evaluate(extract)
}

function makeProvider(
  name: string,
  buildUrl: (p: SearchParams) => string,
  extract: () => RawCard[],
  opts?: ScrapeAttemptOptions
): AccommodationProvider {
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const timeoutMs = opts?.timeoutMs ?? 45_000
      const headless = opts?.headless !== false
      return withRetries(name, opts ?? {}, async (attempt) => {
        const cards = await withPage(
          headless,
          (page) => loadAndExtract(page, buildUrl(params), timeoutMs, extract, 2),
          attempt > 1
        )
        const list = mapCards(name, cards, params)
        if (list.length === 0) {
          throw new Error(`${name}: aucune carte extraite (page dynamique ou blocage anti-bot)`)
        }
        return list
      })
    },
    async health(): Promise<ProviderHealth> {
      return {
        name,
        reachable: true,
        detail: 'scraper Playwright (repli web — préférer API si disponible)'
      }
    }
  }
}

/**
 * Résultats par page d'une SERP Booking, et pas d'une SERP en général : c'est
 * le pas de `offset`, donc une donnée du site, pas un réglage.
 */
const BOOKING_PAGE_SIZE = 25

/**
 * Pages au maximum, garde-fou de volume.
 *
 * Cinq pages, c'est cent vingt-cinq biens et une dizaine de secondes de plus.
 * Au-delà, on ne rend plus service à qui compare une semaine de vacances : on
 * fait du volume sur un site qui n'a rien demandé.
 */
const BOOKING_MAX_PAGES = 5

/**
 * Temps au-delà duquel on ne commence plus de page.
 *
 * Le plafond de pages ne borne pas la durée : chaque page porte son propre
 * délai de chargement et ses propres retentes, et cinq pages lentes tiennent
 * l'écran de recherche plusieurs minutes. Ce budget ne coupe jamais une page
 * en cours — il décide seulement si l'on en ouvre une de plus.
 */
const BOOKING_PAGES_BUDGET_MS = 60_000

/**
 * Parcourt les pages de résultats et rend l'union, dédoublonnée.
 *
 * Trois raisons d'arrêter, et elles se valent toutes les trois :
 *
 * 1. la page est vide — il n'y a plus rien à lire ;
 * 2. elle est plus courte qu'une page pleine — c'est la dernière ;
 * 3. **elle n'apporte aucun bien nouveau**. Ce troisième cas est le garde-fou
 *    de l'hypothèse : si Booking cessait un jour d'honorer `offset`, chaque
 *    page rendrait la même liste. On le détecte au lieu de tourner cinq fois
 *    pour rien, et le relevé se termine sur les vingt-cinq d'avant plutôt que
 *    sur une erreur.
 *
 * Toutes les pages sont lues dans le **même onglet** : rouvrir un contexte par
 * page coûterait cher et ressemblerait beaucoup plus à un robot qu'un visiteur
 * qui clique « page suivante ».
 */
export async function collectBookingPages(
  params: SearchParams,
  fetchPage: (url: string) => Promise<RawCard[]>,
  maxPages = BOOKING_MAX_PAGES,
  budgetMs = BOOKING_PAGES_BUDGET_MS
): Promise<RawCard[]> {
  const all: RawCard[] = []
  const seen = new Set<string>()
  const startedAt = Date.now()

  for (let index = 0; index < maxPages; index++) {
    // La première page se lit toujours : sans elle il n'y a pas de relevé.
    if (index > 0 && Date.now() - startedAt >= budgetMs) break
    const url = bookingSearchUrl(params, index * BOOKING_PAGE_SIZE)
    const cards = await fetchPage(url)
    if (cards.length === 0) break

    let fresh = 0
    for (const card of cards) {
      const key = card.sourceId || card.url
      if (!key || seen.has(key)) continue
      seen.add(key)
      all.push(card)
      fresh++
    }

    if (fresh === 0) break
    if (cards.length < BOOKING_PAGE_SIZE) break
  }

  return all
}

export function createBookingWebProvider(opts?: ScrapeAttemptOptions): AccommodationProvider {
  const name = 'booking-web'
  const timeoutMs = opts?.timeoutMs ?? 45_000
  const headless = opts?.headless !== false
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      return withRetries(name, opts ?? {}, async (attempt) => {
        const cards = await withPage(
          headless,
          (page) =>
            collectBookingPages(params, (url) =>
              loadAndExtract(page, url, timeoutMs, extractBookingCards, 2)
            ),
          attempt > 1
        )
        const list = mapCards(name, cards, params)
        // Zéro carte sur la **première** page, c'est un blocage : la station a
        // toujours au moins un hébergement. Zéro carte sur la suivante, c'est
        // la fin de la liste, et `collectBookingPages` s'y est déjà arrêté.
        if (list.length === 0) {
          throw new Error(`${name}: aucune carte extraite (page dynamique ou blocage anti-bot)`)
        }
        return list
      })
    },
    async health(): Promise<ProviderHealth> {
      return {
        name,
        reachable: true,
        detail: `scraper Playwright, ${BOOKING_MAX_PAGES} page(s) au plus (repli web — préférer API si disponible)`
      }
    }
  }
}

export function createExpediaWebProvider(opts?: ScrapeAttemptOptions): AccommodationProvider {
  return makeProvider('expedia-web', expediaSearchUrl, extractExpediaFamilyCards, opts)
}

export function createGitesWebProvider(opts?: ScrapeAttemptOptions): AccommodationProvider {
  return makeProvider('gites-web', gitesSearchUrl, extractGitesCards, opts)
}

export function createCozycozyWebProvider(opts?: ScrapeAttemptOptions): AccommodationProvider {
  return makeProvider('cozycozy-web', cozycozySearchUrl, extractCozycozyCards, opts)
}

export const WEB_SCRAPE_PROVIDER_NAMES = [
  'booking-web',
  'expedia-web',
  'gites-web',
  'cozycozy-web'
] as const
