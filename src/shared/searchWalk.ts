/**
 * Garde-fous du walk SERP — une station, pas une page.
 *
 * Booking : 25 pages (25×25 = 625 bruts).
 * Abritel : re-scroll getResultList, idle 2, max 25.
 * Airbnb : scrolls infinis, idle 2, max 25 (pas de cursor HAR).
 * Gîtes : page 1-based, max 30 (inchangé : pas dans la demande 25).
 * Budget 5 min : 25 pages lentes ne doivent pas coller l’écran plus longtemps.
 */

export const SEARCH_WALK = {
  maxPages: 25,
  gitesMaxPages: 30,
  maxListings: 750,
  bookingPageSize: 25,
  pagesBudgetMs: 300_000,
  cozyMaxScrolls: 25,
  airbnbMaxScrolls: 25,
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
