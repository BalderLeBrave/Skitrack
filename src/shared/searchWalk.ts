/**
 * Garde-fous du walk SERP — une station, pas une page.
 *
 * Booking / Gîtes / Abritel / Airbnb : 15 pages (ou 15 scrolls).
 * Booking 15×25 = 375 bruts. On s'arrête plus tôt si la SERP annonce un total.
 */

export const SEARCH_WALK = {
  maxPages: 15,
  gitesMaxPages: 15,
  maxListings: 375,
  bookingPageSize: 25,
  pagesBudgetMs: 360_000,
  cozyMaxScrolls: 15,
  airbnbMaxScrolls: 15,
  idleCycles: 2
} as const

/**
 * Logement entier seulement. Type source, pas le titre (« 3 chambres » n'est pas
 * une chambre d'hôtes). Type absent → on garde : filtrer entire avant le type
 * vidait tout le catalogue (spec F5).
 */
export function isPrivateOrSharedListing(propertyType?: string | null): boolean {
  if (!propertyType || !propertyType.trim()) return false
  const t = propertyType
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (/chambre d[' ]?hotes|bed[- ]and[- ]breakfast/.test(t)) return true
  if (/private[ _-]?room|chambre privee|shared[ _-]?room|chambre partage/.test(t)) return true
  if (/hotel_room|chambre d[' ]?hotel/.test(t)) return true
  // Tuile Airbnb « Hôtel · Les 2 Alpes » : pas un logement entier.
  if (/^h[oô]tels?\b/.test(t) && !/appartement|chalet|maison|logement entier/.test(t)) return true
  return false
}

export type StationRunFork = 'F1' | 'F2' | 'F3' | 'F4' | 'F5'

export interface StationRunSource {
  provider: string
  fetched: number
  parsed: number
  shown: number
  pages_fetched: number
  stopped_reason?: string
  reason_code?: string
  error?: string | null
  advertised?: number
  quote_fetches?: number
  cache_hits?: number
  ms_search?: number
  ms_quote?: number
  fork: StationRunFork | null
}

export interface StationRunLog {
  station: string
  check_in?: string
  check_out?: string
  guests?: number
  bedrooms?: number
  sources: StationRunSource[]
}

export function forkOf(row: Omit<StationRunSource, 'fork'>): StationRunFork | null {
  // Skip intentionnel : pas une panne de collecte.
  if (
    row.reason_code === 'delegated' ||
    row.reason_code === 'not_wired' ||
    row.reason_code === 'no_official_url'
  ) {
    return null
  }
  const blocked =
    row.reason_code === 'blocked' || row.reason_code === 'challenge_unresolved'
  if (row.fetched === 0 && blocked) return 'F2'
  if (row.fetched === 0) return 'F1'
  if (row.parsed === 0) return 'F3'
  if (row.shown === 0) return 'F4'
  // Centrale Ingénie : une SERP AJAX, pas des pages Booking. 98 logements /
  // 1 page / exhausted n'est pas F5.
  if (row.provider === 'station-web' && row.fetched > 0) return null
  if (row.pages_fetched <= 1) return 'F5'
  return null
}

/**
 * Une page SERP est-elle la dernière ?
 *
 * Booking affiche 25 cartes ; l'extracteur en lit parfois 23. Traiter 23 comme
 * « dernière page » arrêtait le walk (station_run live : 25, 1 page, exhausted).
 * Seuil 80 % : une vraie dernière page de reliquat (15/25) s'arrête encore.
 * pageSize ≤ 1 (Gîtes `page=` 1-based) : vide = fin, une carte = page pleine.
 */
export function pageLooksLast(cardCount: number, pageSize: number): boolean {
  if (pageSize <= 1) return cardCount < pageSize
  return cardCount < Math.ceil(pageSize * 0.8)
}

/**
 * Total annoncé par la SERP (« 87 établissements trouvés »).
 * Hors bornes 1–50 000 : ce n'est pas un décompte, on ignore.
 */
export function parseAdvertisedCount(text: string | null | undefined): number | null {
  if (!text) return null
  const t = text.replace(/\u00a0/g, ' ')
  const sur = t.match(/sur\s+([\d][\d\s.,]{0,10})/i)
  if (sur) {
    const n = Number(sur[1].replace(/[\s.,]/g, ''))
    if (Number.isFinite(n) && n > 0 && n <= 50_000) return n
  }
  const m = t.match(
    /([\d][\d\s.,]{0,10})\s*(?:établissements?|logements?|hébergements?|résultats?|properties|results|annonces?)/i
  )
  if (!m) return null
  const n = Number(m[1].replace(/[\s.,]/g, ''))
  if (!Number.isFinite(n) || n <= 0 || n > 50_000) return null
  return n
}

export const STOPPED_REASON_LABEL: Record<string, string> = {
  exhausted: 'fin de liste',
  max_pages: 'plafond 15 pages',
  max_listings: 'plafond logements',
  budget: 'temps max',
  empty_page: 'page vide',
  no_fresh: 'pagination figée',
  blocked: 'bloqué',
  advertised: 'catalogue annoncé'
}

export function stoppedReasonLabel(reason?: string | null): string {
  if (!reason) return ''
  return STOPPED_REASON_LABEL[reason] ?? reason
}

export function formatStationRun(
  params: {
    destination: string
    checkIn?: string
    checkOut?: string
    adults?: number
    bedrooms?: number
  },
  sources: Omit<StationRunSource, 'fork'>[]
): StationRunLog {
  return {
    station: params.destination,
    check_in: params.checkIn,
    check_out: params.checkOut,
    guests: params.adults,
    bedrooms: params.bedrooms,
    sources: sources.map((row) => ({ ...row, fork: forkOf(row) }))
  }
}
