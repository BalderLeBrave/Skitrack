/** Mix de pistes alpines (OpenSkiMap) — nombre, km et part. */

export type PisteColorClassic = 'green' | 'blue' | 'red' | 'black'
export type PisteColorExtra = 'expert' | 'freeride' | 'unknown' | 'park'
export type PisteColor = PisteColorClassic | PisteColorExtra
export type PisteBucket = PisteColorClassic | 'other'

export type SlopesQuality = 'complete' | 'partial' | 'empty' | 'curated'
export type SlopesSource = 'openskimap' | 'curated'
export type PisteMixMode = 'count' | 'km' | 'pct'

export type SlopesCountByColor = Partial<Record<PisteColor, number>>

export interface DomainSlopes {
  slopes_count_by_color: SlopesCountByColor
  slopes_km_by_color?: Partial<Record<PisteColor, number>>
  slopes_count_total: number
  slopes_count_alpine_classic: number
  slopes_quality: SlopesQuality
  slopes_source: SlopesSource
  slopes_osm_total?: number
  slopes_computed_at?: string
}

export const PISTE_CLASSIC: PisteColorClassic[] = ['green', 'blue', 'red', 'black']
export const PISTE_EXTRA: PisteColorExtra[] = ['expert', 'freeride', 'unknown', 'park']
export const PISTE_BUCKETS: PisteBucket[] = ['green', 'blue', 'red', 'black', 'other']

export const PISTE_HEX_LIGHT: Record<PisteBucket, string> = {
  green: '#22A34A',
  blue: '#2B6CB0',
  red: '#C53030',
  black: '#1A1A1A',
  other: '#718096'
}

export const PISTE_HEX_DARK: Record<PisteBucket, string> = {
  green: '#22A34A',
  blue: '#63B3ED',
  red: '#FC8181',
  black: '#E2E8F0',
  other: '#A0AEC0'
}

export const PISTE_PRESETS = {
  famille: { minShareGreenBlue: 0.6, maxShareBlack: 0.15 },
  mixte: { maxShareAnyClassic: 0.5 },
  engage: { minShareRedBlack: 0.5 },
  expert: { minBlackCount: 8, minShareBlackExpert: 0.2 }
} as const

const FR_KEYS: Record<string, PisteColor> = {
  vert: 'green',
  bleu: 'blue',
  rouge: 'red',
  noir: 'black',
  autre: 'unknown',
  other: 'unknown'
}

export function normalizePisteCounts(raw: Record<string, number> | null | undefined): SlopesCountByColor {
  const out: SlopesCountByColor = {}
  if (!raw) return out
  for (const [key, value] of Object.entries(raw)) {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) continue
    const color = (FR_KEYS[key] ?? key) as PisteColor
    out[color] = (out[color] ?? 0) + n
  }
  return out
}

export function alpineClassicTotal(counts: SlopesCountByColor): number {
  return PISTE_CLASSIC.reduce((n, c) => n + (counts[c] ?? 0), 0)
}

export function segmentShare(counts: SlopesCountByColor, color: PisteColorClassic): number {
  const total = alpineClassicTotal(counts)
  if (total <= 0) return 0
  return (counts[color] ?? 0) / total
}

export function extraPisteTotal(counts: SlopesCountByColor): number {
  return (counts.expert ?? 0) + (counts.freeride ?? 0) + (counts.unknown ?? 0) + (counts.park ?? 0)
}

export function emptyDomainSlopes(): DomainSlopes {
  return {
    slopes_count_by_color: {},
    slopes_count_total: 0,
    slopes_count_alpine_classic: 0,
    slopes_quality: 'empty',
    slopes_source: 'openskimap'
  }
}

export function domainSlopesOf(d: {
  slopes?: DomainSlopes
  slopes_count_by_color?: Record<string, number> | null
  slopes_km_by_color?: Record<string, number> | null
  slopes_count_total?: number | null
  slopes_count_alpine_classic?: number | null
  slopes_quality?: string | null
  slopes_source?: string | null
  slopes_osm_total?: number | null
  slopes_computed_at?: string | null
}): DomainSlopes {
  if (d.slopes) {
    return {
      ...d.slopes,
      slopes_count_by_color: normalizePisteCounts(d.slopes.slopes_count_by_color),
      slopes_km_by_color: d.slopes.slopes_km_by_color
        ? normalizePisteCounts(d.slopes.slopes_km_by_color)
        : undefined
    }
  }
  const counts = normalizePisteCounts(d.slopes_count_by_color)
  const classic = alpineClassicTotal(counts)
  const total = Object.values(counts).reduce((n, v) => n + (v ?? 0), 0)
  const quality = (d.slopes_quality as SlopesQuality | undefined) ?? (total <= 0 ? 'empty' : 'complete')
  return {
    slopes_count_by_color: counts,
    slopes_km_by_color: d.slopes_km_by_color ? normalizePisteCounts(d.slopes_km_by_color) : undefined,
    slopes_count_total: d.slopes_count_total ?? total,
    slopes_count_alpine_classic: d.slopes_count_alpine_classic ?? classic,
    slopes_quality: quality,
    slopes_source: (d.slopes_source as SlopesSource | undefined) ?? 'openskimap',
    slopes_osm_total: d.slopes_osm_total ?? undefined,
    slopes_computed_at: d.slopes_computed_at ?? undefined
  }
}

export type PistePreset = 'all' | 'famille' | 'mixte' | 'engage' | 'expert'

export type PisteCompareFilters = {
  minGreen?: number
  minBlue?: number
  minRed?: number
  minBlack?: number
  minOther?: number
  unit: PisteMixMode
  preset: PistePreset
  hideEmpty: boolean
  sort:
    | 'total_desc'
    | 'green_blue_share_desc'
    | 'red_black_share_desc'
    | 'black_desc'
    | 'brochure_delta'
}

export interface PisteKmSplit {
  green: number
  blue: number
  red: number
  black: number
  other: number
  total: number
  /** Parts OSM appliquées au km annoncé, ou km OSM bruts s'il n'y a pas de fiche. */
  basis: 'brochure_scaled' | 'osm' | 'none'
  osmKm: number
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Plus grande reste : la somme des parts vaut exactement `total`. */
export function allocateToTotal(shares: number[], total: number, decimals = 1): number[] {
  if (shares.length === 0) return []
  const factor = 10 ** decimals
  const units = Math.round(total * factor)
  const weight = shares.reduce((n, s) => n + s, 0)
  if (weight <= 0 || units <= 0) return shares.map(() => 0)
  const raw = shares.map((s) => (s / weight) * units)
  const floors = raw.map(Math.floor)
  let left = units - floors.reduce((n, v) => n + v, 0)
  const order = raw
    .map((v, i) => ({ i, frac: v - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  let k = 0
  while (left > 0 && k < order.length * 2) {
    floors[order[k % order.length].i] += 1
    left -= 1
    k += 1
  }
  return floors.map((n) => n / factor)
}

function extraKm(km: Partial<Record<PisteColor, number>> | undefined): number {
  if (!km) return 0
  return PISTE_EXTRA.reduce((n, c) => n + (km[c] ?? 0), 0)
}

export function osmMappedKm(slopes: DomainSlopes): number {
  const km = slopes.slopes_km_by_color
  if (!km) return 0
  return round1(Object.values(km).reduce((n, v) => n + (v ?? 0), 0))
}

function bucketWeights(slopes: DomainSlopes): Record<PisteBucket, number> {
  const km = slopes.slopes_km_by_color
  const counts = slopes.slopes_count_by_color
  const kmSum =
    PISTE_CLASSIC.reduce((n, c) => n + (km?.[c] ?? 0), 0) + extraKm(km)
  const useKm = kmSum > 0
  const pick = (c: PisteColor): number => (useKm ? (km?.[c] ?? 0) : (counts[c] ?? 0))
  return {
    green: pick('green'),
    blue: pick('blue'),
    red: pick('red'),
    black: pick('black'),
    other: pick('expert') + pick('freeride') + pick('unknown') + pick('park')
  }
}

/**
 * Km par couleur dont la somme est le kilométrage **annoncé** de la fiche.
 *
 * On ne fabrique pas le total : `announcedKm` vient du référentiel. On ne
 * fabrique pas non plus la répartition : les parts viennent d'OpenSkiMap
 * (km cartographiés, sinon le nombre de pistes). Le dernier décimal absorbe
 * l'arrondi pour que vert+bleu+rouge+noir+autres = total annoncé.
 */
export function scaleKmToAnnounced(
  slopes: DomainSlopes,
  announcedKm?: number | null
): PisteKmSplit {
  const weights = bucketWeights(slopes)
  const wsum = PISTE_BUCKETS.reduce((n, k) => n + weights[k], 0)
  const osmKm = osmMappedKm(slopes)
  const announced = typeof announcedKm === 'number' && Number.isFinite(announcedKm) && announcedKm > 0
    ? announcedKm
    : 0
  const empty: PisteKmSplit = {
    green: 0,
    blue: 0,
    red: 0,
    black: 0,
    other: 0,
    total: 0,
    basis: 'none',
    osmKm
  }
  if (wsum <= 0) return empty
  const target = announced > 0 ? announced : osmKm
  if (target <= 0) return empty
  const parts = allocateToTotal(
    PISTE_BUCKETS.map((k) => weights[k]),
    target,
    1
  )
  const split: PisteKmSplit = {
    green: parts[0] ?? 0,
    blue: parts[1] ?? 0,
    red: parts[2] ?? 0,
    black: parts[3] ?? 0,
    other: parts[4] ?? 0,
    total: 0,
    basis: announced > 0 ? 'brochure_scaled' : 'osm',
    osmKm
  }
  split.total = round1(split.green + split.blue + split.red + split.black + split.other)
  return split
}

export function pisteSplitSum(split: PisteKmSplit): number {
  return round1(split.green + split.blue + split.red + split.black + split.other)
}

function colorMetric(
  slopes: DomainSlopes,
  color: PisteBucket,
  unit: PisteMixMode,
  announcedKm?: number
): number {
  if (unit === 'count') {
    if (color === 'other') return extraPisteTotal(slopes.slopes_count_by_color)
    return slopes.slopes_count_by_color[color] ?? 0
  }
  const split = scaleKmToAnnounced(slopes, announcedKm)
  const km = split[color]
  if (unit === 'km') return km
  return split.total > 0 ? (100 * km) / split.total : 0
}

export function domainMatchesPisteFilters(
  s: DomainSlopes,
  f: PisteCompareFilters,
  announcedKm?: number
): boolean {
  if (s.slopes_quality === 'empty') return f.hideEmpty ? false : f.preset === 'all' && !hasPisteMins(f)
  const unit = f.unit ?? 'count'
  const mins: [PisteBucket, number | undefined][] = [
    ['green', f.minGreen],
    ['blue', f.minBlue],
    ['red', f.minRed],
    ['black', f.minBlack],
    ['other', f.minOther]
  ]
  for (const [color, min] of mins) {
    if (!min) continue
    if (colorMetric(s, color, unit, announcedKm) < min) return false
  }
  const c = s.slopes_count_by_color
  const classic = alpineClassicTotal(c)
  if (classic <= 0 && f.preset !== 'all') return false
  const share = (n: number): number => (classic > 0 ? n / classic : 0)
  if (f.preset === 'famille') {
    return (
      share((c.green ?? 0) + (c.blue ?? 0)) >= PISTE_PRESETS.famille.minShareGreenBlue &&
      share(c.black ?? 0) <= PISTE_PRESETS.famille.maxShareBlack
    )
  }
  if (f.preset === 'mixte') {
    return PISTE_CLASSIC.every((k) => share(c[k] ?? 0) <= PISTE_PRESETS.mixte.maxShareAnyClassic)
  }
  if (f.preset === 'engage') {
    return share((c.red ?? 0) + (c.black ?? 0)) >= PISTE_PRESETS.engage.minShareRedBlack
  }
  if (f.preset === 'expert') {
    const black = c.black ?? 0
    const expertShare = share(black + (c.expert ?? 0))
    return black >= PISTE_PRESETS.expert.minBlackCount || expertShare >= PISTE_PRESETS.expert.minShareBlackExpert
  }
  return true
}

function hasPisteMins(f: PisteCompareFilters): boolean {
  return Boolean(f.minGreen || f.minBlue || f.minRed || f.minBlack || f.minOther)
}

export function comparePisteSort(a: DomainSlopes, b: DomainSlopes, sort: PisteCompareFilters['sort']): number {
  const shareGB = (s: DomainSlopes): number => {
    const c = alpineClassicTotal(s.slopes_count_by_color)
    if (c <= 0) return -1
    return ((s.slopes_count_by_color.green ?? 0) + (s.slopes_count_by_color.blue ?? 0)) / c
  }
  const shareRB = (s: DomainSlopes): number => {
    const c = alpineClassicTotal(s.slopes_count_by_color)
    if (c <= 0) return -1
    return ((s.slopes_count_by_color.red ?? 0) + (s.slopes_count_by_color.black ?? 0)) / c
  }
  if (sort === 'green_blue_share_desc') return shareGB(b) - shareGB(a)
  if (sort === 'red_black_share_desc') return shareRB(b) - shareRB(a)
  if (sort === 'black_desc') return (b.slopes_count_by_color.black ?? 0) - (a.slopes_count_by_color.black ?? 0)
  if (sort === 'brochure_delta') {
    const da = (a.slopes_count_total || 0) - (a.slopes_osm_total || 0)
    const db = (b.slopes_count_total || 0) - (b.slopes_osm_total || 0)
    return Math.abs(db) - Math.abs(da)
  }
  return b.slopes_count_total - a.slopes_count_total
}

export function pisteFiltersOf(s: {
  pisteMinGreen: number
  pisteMinBlue: number
  pisteMinRed: number
  pisteMinBlack: number
  pisteMinOther?: number
  pisteFilterUnit?: PisteMixMode
  pistePreset: PistePreset
  pisteHideEmpty: boolean
  sort: string
}): PisteCompareFilters {
  const sortMap: Record<string, PisteCompareFilters['sort']> = {
    piste_total_desc: 'total_desc',
    piste_green_blue_share_desc: 'green_blue_share_desc',
    piste_red_black_share_desc: 'red_black_share_desc',
    piste_black_desc: 'black_desc',
    piste_brochure_delta: 'brochure_delta'
  }
  return {
    minGreen: s.pisteMinGreen || undefined,
    minBlue: s.pisteMinBlue || undefined,
    minRed: s.pisteMinRed || undefined,
    minBlack: s.pisteMinBlack || undefined,
    minOther: s.pisteMinOther || undefined,
    unit: s.pisteFilterUnit ?? 'count',
    preset: s.pistePreset,
    hideEmpty: s.pisteHideEmpty,
    sort: sortMap[s.sort] ?? 'total_desc'
  }
}

export const PISTE_SORT_KEYS = [
  'piste_total_desc',
  'piste_green_blue_share_desc',
  'piste_red_black_share_desc',
  'piste_black_desc',
  'piste_brochure_delta'
] as const

export function isPisteSort(sort: string): sort is (typeof PISTE_SORT_KEYS)[number] {
  return (PISTE_SORT_KEYS as readonly string[]).includes(sort)
}

export function formatPisteKm(n: number, locale: string): string {
  return n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 1 })
}
