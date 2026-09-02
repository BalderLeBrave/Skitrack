/**
 * Providers AccommodationProvider basés sur Playwright (repli hors API).
 *
 * ⚠ Scraping — robots.txt / CGU souvent interdisent. Les connecteurs API
 * (Booking Demand, Expedia Rapid, LiteAPI) restent prioritaires quand une clé
 * est présente : ces providers web sont destinés au mode « scrape » explicite.
 */

import type { Accommodation, AccommodationProvider, ProviderHealth, SearchParams } from '../types'
import type { Page } from 'playwright'
import type { PaginationReport, StoppedReason } from '@shared/reasonCodes'
import {
  extractBookingCards,
  extractCozycozyCards,
  extractExpediaFamilyCards,
  extractGitesCards,
  extractVrboCards,
  type RawCard
} from './extractors'
import {
  baseAccommodation,
  gitesSearchEmptyKind,
  cozycozySearchEmptyKind,
  listingPhotoUrl,
  looksBlocked,
  mergeGitesCardsFromHtml,
  webscrapePriceFields,
  scrollToEnd,
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
import {
  applyGitesClientContract,
  classifyGitesTypology,
  gitesCodeFromUrl,
  gitesDatesNotFillable,
  gitesQuoteFailed,
  gitesResaForm,
  gitesWidgetUrl,
  interpretGitesQuoteBody,
  isKeptIndividualGiteOffer,
  isoToFrDate,
  parseGitesWidgetContext,
  parseGitesWidgetPhoto
} from './gitesFichePrice'
import {
  abritelCanonicalUrl,
  cozyHitsToRawCards,
  isVrboFamilyProvider,
  parseCozyResultPayloads
} from './cozyResultList'

function mapCards(
  source: string,
  cards: RawCard[],
  params: SearchParams
): Accommodation[] {
  const out: Accommodation[] = []
  for (const c of cards) {
    if (!c.title || !c.url) continue
    if (/cozycozy\.com/i.test(c.url)) continue
    if (source === 'gites-web' && !isKeptIndividualGiteOffer({ type: c.propertyType, url: c.url })) {
      continue
    }
    const parsed = webscrapePriceFields(source, c.priceText)
    // Gîtes tuile = /semaine, jamais un total. Le séjour arrive du widget ITEA.
    const totalPrice =
      typeof c.stayAmount === 'number' && c.stayAmount > 0
        ? Math.round(c.stayAmount * 100) / 100
        : source === 'gites-web'
          ? undefined
          : parsed.totalPrice
    // VRBO : séjour daté + occupancy obligatoires. Gîtes : tuile d'abord,
    // le total ITEA arrive ensuite sur la fiche.
    if (source === 'vrbo-web') {
      if (totalPrice == null || totalPrice <= 0) continue
      if (c.guests == null || c.bedrooms == null) continue
    }
    const { nightlyPrice, weeklyPrice } = parsed
    const rating = c.ratingText ? parseFloat(c.ratingText.replace(',', '.')) : undefined
    const photo = listingPhotoUrl(c.image, c.url)
    out.push(
      baseAccommodation(
        source,
        {
          sourceId: c.sourceId,
          title: c.title,
          url: c.url,
          // Position publiée par la page de résultats. Booking la lit dans son
          // magasin Apollo ; Gîtes de France, CozyCozy, VRBO et Expedia dans le
          // JSON-LD de la page. Absente, le champ reste vide — jamais fabriqué.
          latitude: c.lat,
          longitude: c.lon,
          // Abritel/VRBO via getResultList : total séjour daté.
          // Gîtes tuile : indicatif /semaine, remplacé par le widget ITEA.
          // On ne multiplie jamais nightly × nuits ni weekly × semaines.
          totalPrice,
          nightlyPrice,
          weeklyPrice,
          currency: 'EUR',
          rating: Number.isFinite(rating) ? rating : undefined,
          // Taille du bien, telle que la page de résultats l'écrit. Ces champs
          // existaient au modèle pivot et personne ne les remplissait : les
          // annonces Booking ressortaient sans chambres ni surface, et l'écran
          // en concluait que « le relevé n'a rien rapporté ».
          bedrooms: c.bedrooms,
          beds: c.beds,
          areaSqm: c.areaSqm,
          // La capacité en personnes, enfin relayée. `Accommodation.guests`
          // existait, `baseAccommodation` le recopiait et `runProviderSearch`
          // le lisait — mais aucun connecteur ne l'écrivait, si bien que
          // `pers` valait toujours 0 et que `partyVerdict` classait toutes les
          // annonces relevées en « non annoncé ».
          guests: c.guests,
          propertyType: c.propertyType,
          images: photo ? [photo] : undefined,
          searchPageIndex: c.pageIndex,
          searchRank: c.searchRank
        },
        params
      )
    )
  }
  return out
}

/**
 * Intercepte getResultList / getResults sur la SERP datée CozyCozy.
 * Dump 2026-09-02 : occupancy, total séjour, GPS, photos, providerCode.
 */
async function collectCozyApiHits(page: Page, url: string, timeoutMs: number): Promise<RawCard[]> {
  const payloads: unknown[] = []
  const onResponse = async (res: { url: () => string; json: () => Promise<unknown> }): Promise<void> => {
    if (!/\/api\/(getResultList|getResults)(?:\?|$)/.test(res.url())) return
    try {
      payloads.push(await res.json())
    } catch {
      /* corps non JSON : on ignore */
    }
  }
  page.on('response', onResponse)
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    const until = Date.now() + Math.min(16_000, timeoutMs)
    while (payloads.length === 0 && Date.now() < until) await sleep(400)
    await scrollToEnd(page)
    await sleep(1800)
  } finally {
    page.off('response', onResponse)
  }
  return cozyHitsToRawCards(parseCozyResultPayloads(payloads))
}

async function loadAndExtract(
  page: Page,
  url: string,
  timeoutMs: number,
  extract: () => RawCard[]
): Promise<RawCard[]> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
  await sleep(1500 + Math.random() * 800)
  // Deux défilements fixes tronquaient les pages à chargement différé — voir
  // `scrollToEnd`. On descend jusqu'à ce que la page cesse de grandir.
  await scrollToEnd(page)
  try {
    await page.waitForLoadState('networkidle', { timeout: 6_000 })
  } catch {
    // ignore
  }
  await sleep(500)
  const cards = await page.evaluate(extract)
  try {
    const html = await page.content()
    if (/js-search-tile|g2f-accommodationTile/.test(html)) {
      return mergeGitesCardsFromHtml(cards, html)
    }
  } catch {
    /* HTML illisible : on garde le relevé DOM */
  }
  return cards
}

/**
 * Le motif d'un relevé vide, distingué au lieu d'être supposé.
 *
 * « aucune carte extraite (page dynamique ou blocage anti-bot) » recouvrait
 * deux causes opposées sous un seul message : des sélecteurs périmés, qu'on
 * corrige dans `extractors.ts`, et un refus de la source, contre lequel il n'y
 * a rien à corriger. Les confondre rendait le diagnostic impossible à faire
 * depuis les journaux.
 */
async function emptyReason(page: Page, name: string): Promise<Error> {
  if (await looksBlocked(page)) {
    return new Error(`${name}: relevé refusé par la source (captcha ou blocage anti-robot)`)
  }
  let html = ''
  try {
    html = await page.content()
  } catch {
    html = ''
  }
  const gites = gitesSearchEmptyKind(html)
  if (gites === 'destination_missing') {
    return new Error(
      `${name}: destination non résolue (entity_id vide) [empty_inventory]`
    )
  }
  if (gites === 'no_results') {
    return new Error(`${name}: stock vide [empty_inventory]`)
  }
  const cozy = cozycozySearchEmptyKind(html)
  if (cozy === 'spa_unlaunched') {
    return new Error(
      `${name}: SPA Cosmos montée, recherche non lancée (router-outlet vide) [0_after_parse]`
    )
  }
  return new Error(
    `${name}: aucune carte extraite — la page a répondu, les sélecteurs sont à revoir`
  )
}

/**
 * Connecteur de relevé web, paginé.
 *
 * `pageStep` est le pas de `offset` du site : c'est une donnée de la source,
 * pas un réglage. Zéro le désactive — le connecteur ne lit alors que la
 * première page, comme avant.
 *
 * La pagination manquait ici, et à personne d'autre : seul Booking l'avait,
 * dans son propre connecteur. Expedia, Gîtes de France, CozyCozy et VRBO
 * s'arrêtaient donc au premier écran de résultats, sans que rien ne le dise.
 */
function makeProvider(
  name: string,
  buildUrl: (p: SearchParams, offset?: number) => string,
  extract: () => RawCard[],
  pageStep = 0,
  opts?: ScrapeAttemptOptions
): AccommodationProvider {
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      const timeoutMs = opts?.timeoutMs ?? 45_000
      const headless = opts?.headless !== false
      return withRetries(name, opts ?? {}, async (attempt) => {
        let blocked: Error | null = null
        const cards = await withPage(
          headless,
          async (page) => {
            const collected =
              pageStep > 0
                ? await collectPages(
                    (offset) => buildUrl(params, offset),
                    pageStep,
                    (url) => loadAndExtract(page, url, timeoutMs, extract)
                  )
                : await loadAndExtract(page, buildUrl(params), timeoutMs, extract)
            if (collected.length === 0) blocked = await emptyReason(page, name)
            return collected
          },
          attempt > 1
        )
        const list = mapCards(name, cards, params)
        if (list.length === 0) throw blocked ?? new Error(`${name}: aucune carte retenue`)
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
export async function collectPages(
  urlFor: (offset: number) => string,
  pageSize: number,
  fetchPage: (url: string) => Promise<RawCard[]>,
  maxPages = BOOKING_MAX_PAGES,
  budgetMs = BOOKING_PAGES_BUDGET_MS
): Promise<RawCard[]> {
  const all: RawCard[] & { report?: PaginationReport } = []
  const seen = new Set<string>()
  const startedAt = Date.now()
  let stoppedReason: StoppedReason = 'exhausted'
  let pagesFetched = 0
  let listingsFound = 0

  for (let index = 0; index < maxPages; index++) {
    // La première page se lit toujours : sans elle il n'y a pas de relevé.
    if (index > 0 && Date.now() - startedAt >= budgetMs) {
      stoppedReason = 'budget'
      break
    }
    const cards = await fetchPage(urlFor(index * pageSize))
    pagesFetched++
    listingsFound += cards.length
    if (cards.length === 0) {
      stoppedReason = index === 0 ? 'empty_page' : 'exhausted'
      break
    }

    let fresh = 0
    for (const card of cards) {
      const key = card.sourceId || card.url
      if (!key || seen.has(key)) continue
      seen.add(key)
      all.push({ ...card, pageIndex: index, searchRank: all.length })
      fresh++
    }

    if (fresh === 0) {
      stoppedReason = 'no_fresh'
      break
    }
    if (cards.length < pageSize) {
      stoppedReason = 'exhausted'
      break
    }
    if (index === maxPages - 1) stoppedReason = 'max_pages'
  }

  all.report = {
    pagesFetched,
    listingsFound,
    listingsDeduped: all.length,
    stoppedReason
  }
  return all
}

export function paginationOf(cards: RawCard[]): PaginationReport | undefined {
  return (cards as RawCard[] & { report?: PaginationReport }).report
}

/**
 * Le cas Booking, inchangé.
 *
 * La signature est conservée telle quelle : `providers.test.ts` l'exerce sur
 * cinq cas — trois pages, offset figé, page vide, plafond, budget — et ces
 * tests décrivent un comportement qui n'a pas de raison de changer.
 */
export async function collectBookingPages(
  params: SearchParams,
  fetchPage: (url: string) => Promise<RawCard[]>,
  maxPages = BOOKING_MAX_PAGES,
  budgetMs = BOOKING_PAGES_BUDGET_MS
): Promise<RawCard[]> {
  return collectPages(
    (offset) => bookingSearchUrl(params, offset),
    BOOKING_PAGE_SIZE,
    fetchPage,
    maxPages,
    budgetMs
  )
}

export function createBookingWebProvider(opts?: ScrapeAttemptOptions): AccommodationProvider {
  const name = 'booking-web'
  const timeoutMs = opts?.timeoutMs ?? 45_000
  const headless = opts?.headless !== false
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      return withRetries(name, opts ?? {}, async (attempt) => {
        let blocked: Error | null = null
        const cards = await withPage(
          headless,
          async (page) => {
            const collected = await collectBookingPages(params, (url) =>
              loadAndExtract(page, url, timeoutMs, extractBookingCards)
            )
            // Zéro carte sur la **première** page : la station a toujours au
            // moins un hébergement, donc la page a menti ou refusé. On lui
            // demande laquelle des deux avant de fermer l'onglet.
            if (collected.length === 0) blocked = await emptyReason(page, name)
            return collected
          },
          attempt > 1
        )
        const list = mapCards(name, cards, params)
        if (list.length === 0) throw blocked ?? new Error(`${name}: aucune carte retenue`)
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

/**
 * Pas de pagination de chaque source.
 *
 * Ce sont des données des sites, relevées dans leurs propres liens « page
 * suivante », et non des réglages : Expedia et VRBO comptent en rang de
 * résultat, Gîtes de France et CozyCozy en numéro de page.
 */
const EXPEDIA_PAGE_SIZE = 50
const GITES_PAGE_STEP = 1

export function createExpediaWebProvider(opts?: ScrapeAttemptOptions): AccommodationProvider {
  return makeProvider(
    'expedia-web',
    expediaSearchUrl,
    extractExpediaFamilyCards,
    EXPEDIA_PAGE_SIZE,
    opts
  )
}

export function createGitesWebProvider(opts?: ScrapeAttemptOptions): AccommodationProvider {
  const base = makeProvider('gites-web', gitesSearchUrl, extractGitesCards, GITES_PAGE_STEP, opts)
  return {
    name: 'gites-web',
    async search(params: SearchParams): Promise<Accommodation[]> {
      const list = await base.search(params)
      return enrichGitesStayTotals(list, params, opts)
    },
    health: () =>
      base.health?.() ??
      Promise.resolve({
        name: 'gites-web',
        reachable: true,
        detail: 'Gîtes de France — devis ITEA daté, gîtes seulement'
      })
  }
}

const GITES_ENRICH_BUDGET_MS = 180_000
const GITES_ENRICH_LIMIT = 40

/**
 * Tuile Gîtes = « À partir de N € /semaine ». Le total daté n'existe qu'après
 * POST gereResa.php (dump catalogue : Copains 4261,52 ≠ 1330, Centaurée
 * 2899,36 ≠ 1400, Feuillardiers 1898,40 ≠ 950). Sans devis, hors liste.
 * Typologie / capacité / chambres filtrées avant et après devis.
 */
async function enrichGitesStayTotals(
  list: Accommodation[],
  params: SearchParams,
  opts?: ScrapeAttemptOptions
): Promise<Accommodation[]> {
  const deb = isoToFrDate(params.checkIn)
  const fin = isoToFrDate(params.checkOut)
  if (!deb || !fin || !params.checkIn || !params.checkOut) return []
  const adults = Math.max(1, params.adults ?? 2)
  const bedrooms = params.bedrooms ?? 0

  const eligible = list.filter((a) => {
    if (!gitesCodeFromUrl(a.url)) return false
    const typ = classifyGitesTypology({ type: a.propertyType, url: a.url })
    if (typ !== 'gite') return false
    if (a.guests == null || a.bedrooms == null) return false
    if (a.guests < adults) return false
    if (a.bedrooms < bedrooms) return false
    return true
  })
  const need = eligible.slice(0, GITES_ENRICH_LIMIT)
  if (need.length === 0) return []

  const timeoutMs = opts?.timeoutMs ?? 45_000
  const headless = opts?.headless !== false
  const deadline = Date.now() + GITES_ENRICH_BUDGET_MS
  const quoted = new Map<
    string,
    { total?: number; unavailable?: boolean; ident?: string; photo?: string }
  >()
  try {
    await withPage(headless, async (page) => {
      for (const card of need) {
        if (Date.now() >= deadline) break
        const code = gitesCodeFromUrl(card.url)
        if (!code) continue
        try {
          await page.goto(gitesWidgetUrl(code), {
            waitUntil: 'domcontentloaded',
            timeout: Math.min(timeoutMs, 20_000)
          })
          await sleep(900)
          const html = await page.content()
          const ctx = parseGitesWidgetContext(html)
          const photo = parseGitesWidgetPhoto(html)
          if (!ctx) continue
          const identTyp = classifyGitesTypology({ ident: ctx.ident, url: card.url })
          if (identTyp !== 'gite') {
            quoted.set(card.url, { unavailable: true, ident: ctx.ident, photo })
            continue
          }
          const body = await page.evaluate(
            async (args: { formExo: string; formTab: string }) => {
              const post = async (form: string) => {
                const res = await fetch('/lib_2/ajax/gereResa.php', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: form
                })
                return res.text()
              }
              const exo = await post(args.formExo)
              let exercice = ''
              try {
                const j = JSON.parse(exo) as { exercice?: string }
                if (j.exercice) exercice = String(j.exercice)
              } catch {
                /* HTML ou vide */
              }
              const tabForm = exercice
                ? args.formTab.replace(/exercice=[^&]*/, `exercice=${encodeURIComponent(exercice)}`)
                : args.formTab
              return post(tabForm)
            },
            {
              formExo: gitesResaForm(ctx, {
                dateDeb: deb,
                dateFin: fin,
                adults,
                type: 'getExerciceByDateFin'
              }),
              formTab: gitesResaForm(ctx, {
                dateDeb: deb,
                dateFin: fin,
                adults,
                type: 'getHTMLTabPrixFormulesSejour'
              })
            }
          )
          const parsed = interpretGitesQuoteBody(body)
          if (parsed.price_firm && parsed.stay) {
            quoted.set(card.url, { total: parsed.stay, ident: ctx.ident, photo })
          } else if (
            gitesDatesNotFillable(body) ||
            gitesQuoteFailed(body) ||
            !parsed.available
          ) {
            quoted.set(card.url, { unavailable: true, ident: ctx.ident, photo })
          }
        } catch {
          /* une fiche rate : pas de teaser /semaine — on n'invente pas le séjour */
        }
      }
    })
  } catch {
    return []
  }

  const catalog = need.map((a) => {
    const q = quoted.get(a.url)
    return {
      listing_id: a.url,
      ident: q?.ident,
      property_type: a.propertyType,
      url: a.url,
      guests: a.guests ?? null,
      bedrooms: a.bedrooms ?? null,
      price_from: a.weeklyPrice ?? null,
      quote: q?.total
        ? {
            check_in: params.checkIn!,
            check_out: params.checkOut!,
            guests: adults,
            stay: q.total,
            available: true
          }
        : {
            check_in: params.checkIn!,
            check_out: params.checkOut!,
            guests: adults,
            stay: null,
            available: false
          }
    }
  })
  const verdict = applyGitesClientContract(catalog, {
    check_in: params.checkIn,
    check_out: params.checkOut,
    guests: adults,
    bedrooms
  })
  const byUrl = new Map(list.map((a) => [a.url, a]))
  return verdict.shown.flatMap((kept) => {
    const a = byUrl.get(kept.listing_id)
    if (!a) return []
    const q = quoted.get(kept.listing_id)
    const existing = a.images?.find((u) => /^https?:\/\//i.test(u))
    const widget = listingPhotoUrl(q?.photo, a.url)
    const photo = existing ?? widget
    return [
      {
        ...a,
        images: photo ? [photo] : a.images,
        totalPrice: kept.price_total_stay_amount,
        weeklyPrice: undefined,
        nightlyPrice: undefined,
        priceConfidence: 'total_confirmed' as const,
        availabilityStatus: 'available' as const
      }
    ]
  })
}

/**
 * Abritel : abritel.fr SERP = 429. Inventaire lu via getResultList
 * (providerCode=abritel). CozyCozy n'émet aucune carte propre.
 */
export function createVrboWebProvider(opts?: ScrapeAttemptOptions): AccommodationProvider {
  const name = 'vrbo-web'
  const timeoutMs = opts?.timeoutMs ?? 45_000
  const headless = opts?.headless !== false
  return {
    name,
    async search(params: SearchParams): Promise<Accommodation[]> {
      return withRetries(name, opts ?? {}, async (attempt) => {
        let blocked: Error | null = null
        const cards = await withPage(
          headless,
          async (page) => {
            /*
             * vrbo.com / abritel.fr SERP = 429 « Bot or Not? » (dump 2026-09-01).
             * L'inventaire Abritel est déjà dans CozyCozy getResultList
             * (providerCode=abritel, total séjour, photo, GPS, capacité).
             */
            const url = cozycozySearchUrl(params)
            let collected = (await collectCozyApiHits(page, url, timeoutMs)).filter((c) =>
              isVrboFamilyProvider(undefined, undefined, c.url)
            )
            if (collected.length === 0) {
              collected = (await page.evaluate(extractCozycozyCards)).filter((c) =>
                isVrboFamilyProvider(undefined, undefined, c.url)
              )
            }
            if (collected.length === 0) {
              collected = (await page.evaluate(extractVrboCards)).filter((c) =>
                isVrboFamilyProvider(undefined, undefined, c.url)
              )
            }
            if (collected.length === 0) {
              blocked = (await looksBlocked(page))
                ? new Error(`${name}: relevé refusé par la source (captcha ou blocage anti-robot)`)
                : new Error(
                    `${name}: Abritel absent du relevé CozyCozy — abritel.fr reste en 429`
                  )
            }
            return collected
          },
          attempt > 1
        )
        const list = mapCards(name, cards, params).map((a) => ({
          ...a,
          url: abritelCanonicalUrl(a.url, {
            checkIn: params.checkIn,
            checkOut: params.checkOut,
            adults: params.adults,
            children: params.children
          })
        }))
        if (list.length === 0) throw blocked ?? new Error(`${name}: aucune carte retenue`)
        return list
      })
    },
    async health(): Promise<import('../types').ProviderHealth> {
      return {
        name,
        reachable: true,
        detail: 'Abritel via CozyCozy getResultList (abritel.fr 429)'
      }
    }
  }
}

export const WEB_SCRAPE_PROVIDER_NAMES = [
  'booking-web',
  'expedia-web',
  'gites-web',
  'vrbo-web'
] as const
