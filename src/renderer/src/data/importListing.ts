/**
 * Passe ExtractedListing → Lodging.
 *
 * Un total incomparable reste à 0 avec une confiance partielle / inconnue.
 * Sans geo, pas de ski-in, pas de distance. L'altitude n'est pas reprise du texte.
 */

import type { ExtractedListing, PriceUnit } from '@shared/listingImport'
import { differenceInDays, normalizeOffer } from '@shared/listingImport'
import type { Lodging } from './lodgings'
import { listingKeyFromUrl } from './lodgings'

export interface ImportStay {
  checkIn: string
  checkOut: string
  guests: number
  domainId: number
}

export function toImportedLodging(
  extracted: ExtractedListing,
  stay: ImportStay,
  id: number,
  overrides?: {
    title?: string
    price?: number
    unit?: PriceUnit
    isFrom?: boolean
    lat?: number
    lon?: number
    precision?: 'exact' | 'approximate' | 'none'
    address?: string
    guests?: number
    rooms?: number
    checkIn?: string
    checkOut?: string
    feesComplete?: boolean
    cleaning?: number
    touristTax?: number
    service?: number
    utilities?: number
    deposit?: number
    depositRefundable?: boolean
  }
): Lodging {
  const merged: ExtractedListing = {
    ...extracted,
    title: overrides?.title
      ? { value: overrides.title, source: 'manual', confidence: 'high', extractedAt: Date.now() }
      : extracted.title,
    priceBase:
      overrides?.price != null
        ? {
            value: overrides.price,
            currency: extracted.priceBase?.currency ?? 'EUR',
            unit: overrides.unit ?? extracted.priceBase?.unit ?? 'stay',
            isFrom: overrides.isFrom ?? extracted.priceBase?.isFrom ?? false,
            source: 'manual',
            confidence: 'high',
            extractedAt: Date.now()
          }
        : extracted.priceBase,
    guests: overrides?.guests != null
      ? { value: overrides.guests, source: 'manual', confidence: 'high', extractedAt: Date.now() }
      : extracted.guests,
    rooms: overrides?.rooms != null
      ? { value: overrides.rooms, source: 'manual', confidence: 'high', extractedAt: Date.now() }
      : extracted.rooms,
    checkIn: overrides?.checkIn
      ? { value: overrides.checkIn, source: 'manual', confidence: 'high', extractedAt: Date.now() }
      : extracted.checkIn,
    checkOut: overrides?.checkOut
      ? { value: overrides.checkOut, source: 'manual', confidence: 'high', extractedAt: Date.now() }
      : extracted.checkOut,
    addressText: overrides?.address
      ? { value: overrides.address, source: 'manual', confidence: 'high', extractedAt: Date.now() }
      : extracted.addressText,
    geo:
      overrides?.precision === 'none'
        ? undefined
        : overrides?.lat != null && overrides.lon != null
          ? {
              value: { lat: overrides.lat, lon: overrides.lon },
              source: 'manual',
              confidence: overrides.precision === 'approximate' ? 'medium' : 'high',
              extractedAt: Date.now(),
              precision: overrides.precision ?? 'exact'
            }
          : extracted.geo,
    fees:
      overrides?.feesComplete != null ||
      overrides?.cleaning != null ||
      overrides?.touristTax != null ||
      overrides?.service != null ||
      overrides?.utilities != null ||
      overrides?.deposit != null
        ? {
            cleaning: overrides.cleaning,
            touristTax: overrides.touristTax,
            service: overrides.service,
            utilities: overrides.utilities,
            deposit: overrides.deposit,
            depositRefundable: overrides.depositRefundable,
            isComplete: overrides.feesComplete === true,
            source: 'manual'
          }
        : extracted.fees
  }

  const checkIn = merged.checkIn?.value ?? stay.checkIn
  const checkOut = merged.checkOut?.value ?? stay.checkOut
  const guests = merged.guests?.value ?? merged.occupancyMax?.value ?? stay.guests
  const offer = normalizeOffer(merged, { checkIn, checkOut, guests })
  const nights = differenceInDays(checkOut, checkIn)
  const geo = merged.geo
  const hasGeo = geo != null && geo.precision !== 'none'
  const total = offer.priceTotal
  const isFrom = Boolean(merged.priceBase?.isFrom) || offer.flags.includes('price_is_from')

  let priceConfidence: Lodging['priceConfidence']
  if (total != null && offer.isComparable) priceConfidence = 'total_confirmed'
  else if (isFrom || offer.flags.includes('incomplete_fees')) priceConfidence = 'partial'
  else priceConfidence = 'unknown'

  const url = merged.canonicalUrl?.value ?? merged.fetchMetadata.url

  return {
    id,
    name: merged.title?.value?.trim() || url,
    type: 'Import',
    pers: guests,
    ch: merged.rooms?.value ?? 0,
    m2: null,
    note: '—',
    avis: 0,
    dist: 0,
    walk: 1,
    den: 0,
    skiIn: false,
    src: 'Import manuel · URL',
    pp: total != null && guests > 0 && nights > 0 ? Math.round((total / (guests * nights)) * 2) / 2 : 0,
    total: total ?? 0,
    annul: false,
    lift: '',
    liftDist: 0,
    alt: 0,
    stock: 1,
    url,
    image: merged.image?.value ?? null,
    photo: merged.image?.value && /^https?:\/\//i.test(merged.image.value) ? merged.image.value : '',
    lat: hasGeo ? geo.value.lat : undefined,
    lon: hasGeo ? geo.value.lon : undefined,
    locPrecision: hasGeo ? (geo.precision === 'exact' ? 'exact' : 'approximate') : undefined,
    importDomainId: stay.domainId,
    priceConfidence,
    priceCheckIn: checkIn,
    priceCheckOut: checkOut,
    fitsGuests: guests,
    scannedAt: Date.now(),
    listingHash: merged.listingHash || listingKeyFromUrl(url) || undefined,
    offerHash: merged.offerHash,
    priceIsFrom: isFrom,
    priceFlags: offer.flags,
    geoPrecision: geo?.precision ?? 'none',
    feesBreakdown: merged.fees
      ? {
          cleaning: merged.fees.cleaning,
          touristTax: merged.fees.touristTax,
          service: merged.fees.service,
          utilities: merged.fees.utilities,
          deposit: merged.fees.deposit,
          depositRefundable: merged.fees.depositRefundable,
          isComplete: merged.fees.isComplete
        }
      : undefined
  }
}

export function nextLodgingId(imported: { id: number }[]): number {
  return imported.reduce((max, l) => Math.max(max, l.id), 999) + 1
}
