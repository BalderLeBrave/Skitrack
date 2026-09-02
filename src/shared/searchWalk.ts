/**
 * Garde-fous du walk SERP — une station, pas une page.
 *
 * Booking / Gîtes / Abritel : 30 pages. Booking 30×25 = 750 bruts.
 * Airbnb : scrolls infinis, idle 2 cycles, max 30 (pas de cursor HAR).
 * Abritel : re-scroll getResultList, idle 2, max 30.
 * Budget 6 min : 30 pages lentes ne doivent pas coller l’écran plus longtemps.
 */

export const SEARCH_WALK = {
  maxPages: 30,
  maxListings: 750,
  bookingPageSize: 25,
  pagesBudgetMs: 360_000,
  cozyMaxScrolls: 30,
  airbnbMaxScrolls: 30,
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
  const blocked =
    row.reason_code === 'blocked' || row.reason_code === 'challenge_unresolved'
  if (row.fetched === 0 && blocked) return 'F2'
  if (row.fetched === 0) return 'F1'
  if (row.parsed === 0) return 'F3'
  if (row.shown === 0) return 'F4'
  if (row.pages_fetched <= 1) return 'F5'
  return null
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
