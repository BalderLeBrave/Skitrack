/**
 * Lecture de la grille d'occupation, fiche par fiche, au navigateur.
 *
 * C'est l'approche coûteuse, et elle a été choisie en connaissance de cause :
 * une navigation, un clic et une attente **par annonce**. Tout ce module
 * consiste donc à en borner le prix, parce qu'une recherche Chamonix ramène
 * plusieurs dizaines de fiches et qu'on ne peut pas ouvrir cinquante onglets.
 *
 * Quatre garde-fous, dans cet ordre d'importance :
 *
 * 0. **Un budget de temps global** (`BUDGET_MS`). C'est le seul garde-fou qui
 *    borne vraiment la recherche : les autres plafonnent une opération, pas
 *    leur somme. Sans lui, vingt-quatre fiches à trois délais de vingt
 *    secondes chacune peuvent tenir la recherche plusieurs minutes — c'est
 *    arrivé, et le relevé ne rendait jamais la main. Passé le budget, on
 *    s'arrête là où on en est.
 * 1. **Un plafond de fiches** (`MAX_FICHES`). Au-delà, les annonces restantes
 *    gardent ce que la SERP en disait, et l'appelant est prévenu — un relevé
 *    tronqué en silence se lirait comme un relevé complet.
 * 2. **Une concurrence bornée** (`CONCURRENCY`). Le contexte Playwright est
 *    partagé ; ouvrir sans limite écroule la machine avant le site.
 * 3. **Un délai par fiche** (`FICHE_TIMEOUT_MS`). Une fiche lente ne doit pas
 *    retenir la recherche entière.
 * 4. **Un cache par URL et par dates.** Deux recherches identiques dans la même
 *    session ne rouvrent pas les mêmes fiches.
 *
 * Un échec sur une fiche reste local : on rend `null`, l'annonce garde le prix
 * de la SERP et sa capacité inconnue. C'est la règle du moteur — une source en
 * panne n'en vide pas d'autres, et ici une fiche en panne n'en écarte pas
 * d'autres.
 */

import type { Page } from 'playwright'
import { withPagePool } from '../webscrape/shared'
import { debugLog } from '../debug'
import {
  ficheUrlWithStay,
  GRID_SELECTOR,
  OPEN_PANEL_SELECTOR,
  summarise,
  type FicheOccupancy,
  type OccupancyRow
} from './occupancy'

/**
 * Fiches ouvertes au maximum pour une recherche. Au-delà, la SERP fait foi.
 *
 * Réglé sur une mesure, pas sur une intuition : relevé Chamonix du 2026-08-21,
 * 22 annonces tarifées, 12 fiches lues en 12 s à concurrence 3 — soit environ
 * une seconde par fiche. Quarante tiennent donc largement dans le budget, et
 * couvrent une SERP entière. C'est `BUDGET_MS` qui borne pour de vrai ; ce
 * plafond n'est qu'un garde-fou contre une SERP anormalement longue.
 */
export const MAX_FICHES = 40

/**
 * Budget de temps de toute la phase d'enrichissement.
 *
 * Une recherche qui ne rend pas la main est pire qu'une recherche imprécise :
 * l'utilisateur ne voit rien du tout. Passé ce délai, les fiches non lues
 * gardent le prix de la SERP et sont comptées dans `skipped`.
 */
export const BUDGET_MS = 75_000

/** Fiches ouvertes en parallèle. */
const CONCURRENCY = 3

const FICHE_TIMEOUT_MS = 15_000

/** Cache de session : `url|from|to` → grille, ou `null` si la fiche s'est tue. */
const cache = new Map<string, FicheOccupancy | null>()

function cacheKey(url: string, from: string, to: string): string {
  return `${url}|${from}|${to}`
}

/**
 * Ouvre une fiche et rend sa grille, `null` si elle n'en publie pas.
 *
 * Le clic sur « Sélectionner votre chambre » est ce qui déclenche le rendu :
 * la grille n'existe pas dans le HTML servi, et l'attendre sans cliquer
 * expirerait à chaque fois.
 */
async function readOne(
  page: Page,
  url: string,
  from: string,
  to: string,
  channel: string
): Promise<FicheOccupancy | null> {
  const target = ficheUrlWithStay(url, from, to, channel)
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: FICHE_TIMEOUT_MS })

  const opener = page.locator(OPEN_PANEL_SELECTOR).first()
  await opener.waitFor({ state: 'visible', timeout: FICHE_TIMEOUT_MS })
  await opener.click()

  await page.locator(GRID_SELECTOR).first().waitFor({ state: 'attached', timeout: FICHE_TIMEOUT_MS })

  // Exécuté **dans la page** : `document` y existe. Le corps est aligné sur
  // `parseGridFromDom` d'`occupancy.ts`, que le test couvre hors navigateur.
  const rows: OccupancyRow[] = await page.evaluate(() => {
    const clean = (v: string | null | undefined): string | undefined => {
      const t = String(v ?? '').replace(/\s+/g, ' ').trim()
      return t.length > 0 ? t : undefined
    }
    const out: {
      adults: number
      children: number
      pax: number
      total: number
      condition?: string
      policy?: string
    }[] = []
    const nodes = document.querySelectorAll('.cpt-room-composition')
    nodes.forEach((node) => {
      const icons = node.querySelectorAll('.composition-pax .icon-pax-wrap i')
      let adults = 0
      let children = 0
      icons.forEach((icon) => {
        const cls = String(icon.className || '')
        if (cls.indexOf('icon-max-adult') >= 0) adults++
        else if (cls.indexOf('icon-max-child') >= 0) children++
      })
      const priceText = node.querySelector('.text-price')?.textContent ?? ''
      const total = parseInt(String(priceText).replace(/[^\d]/g, ''), 10)
      if (adults + children > 0 && Number.isFinite(total) && total > 0) {
        out.push({
          adults,
          children,
          pax: adults + children,
          total,
          condition: clean(node.querySelector('.composition-rate')?.textContent),
          policy: clean(node.querySelector('.label-policy')?.textContent)
        })
      }
    })
    return out
  })

  return summarise(rows)
}

export interface FicheOccupancyRequest {
  /** URL de fiche, telle que la SERP l'a publiée. */
  url: string
}

export interface FicheOccupancyResult {
  /** Grilles lues, par URL de fiche. Une entrée absente = non relevée. */
  byUrl: Map<string, FicheOccupancy>
  /**
   * Fiches laissées de côté — plafond atteint ou budget de temps épuisé.
   * À dire, jamais à taire : un relevé tronqué en silence se lit comme complet.
   */
  skipped: number
  /** Fiches ouvertes qui n'ont rien rendu. */
  failed: number
}

/**
 * Lit les grilles d'un lot de fiches, sous plafond et à concurrence bornée.
 *
 * L'ordre du lot est celui de l'appelant : c'est lui qui sait lesquelles
 * comptent — en pratique les moins chères, celles que l'utilisateur regardera.
 */
export async function readFicheOccupancies(
  urls: string[],
  from: string,
  to: string,
  channel: string,
  headless = true
): Promise<FicheOccupancyResult> {
  const byUrl = new Map<string, FicheOccupancy>()
  let failed = 0

  const unique = [...new Set(urls.filter(Boolean))]
  const budgeted = unique.slice(0, MAX_FICHES)
  const skipped = unique.length - budgeted.length

  // Ce que le cache connaît déjà ne coûte rien.
  const todo: string[] = []
  for (const url of budgeted) {
    const key = cacheKey(url, from, to)
    if (cache.has(key)) {
      const hit = cache.get(key)
      if (hit) byUrl.set(url, hit)
      continue
    }
    todo.push(url)
  }

  let ranOutOfTime = 0
  if (todo.length > 0) {
    const deadline = Date.now() + BUDGET_MS
    const workers = Math.min(CONCURRENCY, todo.length)
    await withPagePool(workers, headless, async (pages) => {
      let cursor = 0
      await Promise.all(
        pages.map(async (page) => {
          for (;;) {
            const index = cursor++
            if (index >= todo.length) return
            if (Date.now() >= deadline) {
              ranOutOfTime += 1
              return
            }
            const url = todo[index]
            try {
              if (page.isClosed()) return
              const grid = await readOne(page, url, from, to, channel)
              cache.set(cacheKey(url, from, to), grid)
              if (grid) byUrl.set(url, grid)
              else failed++
            } catch (err) {
              cache.set(cacheKey(url, from, to), null)
              failed++
              debugLog('ceto-fiche', 'Number of failed fiche reads', {
                url,
                reason: err instanceof Error ? err.message : String(err)
              })
            }
          }
        })
      )
    })
  }

  const totalSkipped = skipped + ranOutOfTime
  debugLog('ceto-fiche', 'Number of occupancy grids read', {
    asked: unique.length,
    read: byUrl.size,
    failed,
    skippedOverCap: skipped,
    skippedOutOfTime: ranOutOfTime,
    budgetMs: BUDGET_MS
  })

  return { byUrl, skipped: totalSkipped, failed }
}

/**
 * Grilles des fiches SERP, moins chères d'abord (le plafond coupe la queue).
 */
export async function occupancyGridsForSerp(
  listings: { url?: string | null; total?: number | null }[],
  from: string,
  to: string,
  channel: string
): Promise<Map<string, FicheOccupancy>> {
  const byPrice = [...listings].sort((a, b) => (a.total ?? 0) - (b.total ?? 0))
  const grids = await readFicheOccupancies(
    byPrice.map((l) => l.url ?? '').filter(Boolean),
    from,
    to,
    channel
  )
  if (grids.skipped > 0) {
    debugLog('ceto-fiche', 'Number of listings left on the SERP price', {
      skipped: grids.skipped,
      cap: MAX_FICHES
    })
  }
  return grids.byUrl
}

/** Vide le cache de session. Utilisé par les tests. */
export function clearFicheOccupancyCache(): void {
  cache.clear()
}
