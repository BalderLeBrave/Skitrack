/**
 * Contrat d'extraction d'une annonce — traçabilité, pas d'invention.
 *
 * Une valeur absente reste absente. Un prix « à partir de », une unité
 * inconnue ou des charges incomplètes interdisent un total comparable.
 */

export type FetchStatus =
  | 'success'
  | 'partial_content'
  | 'rate_limited'
  | 'access_denied'
  | 'timeout'
  | 'network_error'
  | 'parse_error'

export type ResolutionStrategy = 'auto_retry' | 'user_manual_entry' | 'partial_with_form' | 'abort' | 'proceed'

export type FieldProvenance =
  | 'jsonld'
  | 'opengraph'
  | 'itemprop'
  | 'canonical'
  | 'geocode'
  | 'manual'
  | 'user_pasted_jsonld'
  | 'page'

export type PriceUnit = 'night' | 'week' | 'stay' | 'unknown'
export type ExtractionConfidence = 'high' | 'medium' | 'low' | 'none'
export type GeoPrecision = 'exact' | 'approximate' | 'none'

export interface FieldWithProvenance<T> {
  value: T
  source: FieldProvenance
  confidence: ExtractionConfidence
  extractedAt: number
}

export interface ExtractedPrice extends FieldWithProvenance<number> {
  currency: string
  unit: PriceUnit
  isFrom: boolean
}

export interface ExtractedGeo extends FieldWithProvenance<{ lat: number; lon: number }> {
  precision: GeoPrecision
}

export interface ExtractedFees {
  cleaning?: number
  touristTax?: number
  service?: number
  utilities?: number
  deposit?: number
  depositRefundable?: boolean
  isComplete: boolean
  source: FieldProvenance
}

export interface FetchMetadata {
  url: string
  finalUrl?: string
  fetchStatus: FetchStatus
  resolutionStrategy: ResolutionStrategy
  attempts: number
  timestamp: number
  httpStatus?: number
  message?: string
}

export interface ExtractedListing {
  fetchMetadata: FetchMetadata
  title?: FieldWithProvenance<string>
  canonicalUrl?: FieldWithProvenance<string>
  priceBase?: ExtractedPrice
  fees?: ExtractedFees
  checkIn?: FieldWithProvenance<string>
  checkOut?: FieldWithProvenance<string>
  guests?: FieldWithProvenance<number>
  geo?: ExtractedGeo
  addressText?: FieldWithProvenance<string>
  occupancyMax?: FieldWithProvenance<number>
  rooms?: FieldWithProvenance<number>
  description?: FieldWithProvenance<string>
  image?: FieldWithProvenance<string>
  rawJsonLd?: unknown
  completenessScore: number
  listingHash: string
  offerHash?: string
  missingCriticalFields: string[]
}

export const CRITICAL_FIELDS = ['priceBase', 'checkIn', 'checkOut', 'guests'] as const

export interface FetchResult {
  status: FetchStatus
  html?: string
  extractedData?: Partial<ExtractedListing>
  errorDetails?: {
    httpStatus?: number
    retryAfter?: number
    message: string
  }
  recommendedStrategy: ResolutionStrategy
}

export function resolveFetchStrategy(result: Pick<FetchResult, 'status'>, retryCount: number): ResolutionStrategy {
  if (result.status === 'success') return 'proceed'
  if (
    (result.status === 'rate_limited' || result.status === 'timeout' || result.status === 'network_error') &&
    retryCount < 3
  ) {
    return 'auto_retry'
  }
  if (result.status === 'partial_content') return 'partial_with_form'
  if (
    result.status === 'access_denied' ||
    result.status === 'timeout' ||
    result.status === 'network_error' ||
    result.status === 'parse_error' ||
    result.status === 'rate_limited'
  ) {
    return 'user_manual_entry'
  }
  return 'abort'
}

export function retryDelayMs(retryCount: number): number {
  return Math.min(1000 * 2 ** retryCount, 30_000)
}

export function classifyHttpStatus(status: number): FetchStatus | null {
  if (status === 429) return 'rate_limited'
  if (status === 403 || status === 401) return 'access_denied'
  if (status === 408 || status === 504) return 'timeout'
  return null
}

/** Écart brut en nuits. 0 si les dates sont illisibles — jamais un 7 inventé. */
export function differenceInDays(checkOut: string, checkIn: string): number {
  const from = new Date(`${checkIn}T12:00:00`)
  const to = new Date(`${checkOut}T12:00:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

export interface NormalizedOffer {
  priceTotal: number | null
  priceBase: number | undefined
  fees: ExtractedFees | undefined
  flags: string[]
  isComparable: boolean
}

export function normalizeOffer(
  extracted: Pick<ExtractedListing, 'priceBase' | 'fees'>,
  stay: { checkIn: string; checkOut: string; guests: number }
): NormalizedOffer {
  const nights = differenceInDays(stay.checkOut, stay.checkIn)
  const flags: string[] = []
  let priceTotal: number | null = null
  const base = extracted.priceBase

  if (base) {
    if (base.unit === 'night' && nights > 0) {
      priceTotal = base.value * nights
    } else if (base.unit === 'week' && nights === 7) {
      priceTotal = base.value
    } else if (base.unit === 'week' && nights !== 7) {
      priceTotal = null
      flags.push('unit_mismatch')
    } else if (base.unit === 'stay') {
      priceTotal = base.value
    } else {
      priceTotal = null
      flags.push('unit_unknown')
    }

    if (base.isFrom) {
      priceTotal = null
      flags.push('price_is_from')
    }

    if (!extracted.fees?.isComplete) {
      priceTotal = null
      flags.push('incomplete_fees')
    }
  }

  if (extracted.fees && priceTotal !== null) {
    const totalFees =
      (extracted.fees.cleaning ?? 0) +
      (extracted.fees.touristTax ?? 0) +
      (extracted.fees.service ?? 0) +
      (extracted.fees.utilities ?? 0)
    priceTotal += totalFees
  }

  return {
    priceTotal,
    priceBase: extracted.priceBase?.value,
    fees: extracted.fees,
    flags,
    isComparable: priceTotal !== null && !flags.includes('price_is_from')
  }
}

export function identifyMissingCriticalFields(extracted: Partial<ExtractedListing>): string[] {
  const missing: string[] = []
  if (!extracted.priceBase) missing.push('priceBase')
  if (!extracted.checkIn) missing.push('checkIn')
  if (!extracted.checkOut) missing.push('checkOut')
  if (!extracted.guests && !extracted.occupancyMax) missing.push('guests')
  return missing
}

export function calculateCompleteness(extracted: Partial<ExtractedListing>): number {
  let score = 0
  if (extracted.title) score += 15
  if (extracted.priceBase) score += extracted.priceBase.isFrom ? 12 : 25
  if (extracted.checkIn && extracted.checkOut) score += 15
  if (extracted.guests || extracted.occupancyMax) score += 10
  if (extracted.geo && extracted.geo.precision !== 'none') {
    score += extracted.geo.precision === 'exact' ? 20 : 12
  }
  if (extracted.addressText) score += 10
  if (extracted.occupancyMax || extracted.rooms) score += 5
  return Math.min(100, score)
}

export function field<T>(
  value: T,
  source: FieldProvenance,
  confidence: ExtractionConfidence,
  at = Date.now()
): FieldWithProvenance<T> {
  return { value, source, confidence, extractedAt: at }
}
