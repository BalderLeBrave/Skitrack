/**
 * Parser JSON-LD / Open Graph / itemprop — rien n'est inventé.
 *
 * Schémas hétérogènes (LodgingBusiness, Product, Offer, AggregateOffer, @graph)
 * aplatis puis fusionnés par priorité de confiance.
 */

import { readCoords } from './listingCoords'
import {
  calculateCompleteness,
  field,
  identifyMissingCriticalFields,
  type ExtractedFees,
  type ExtractedListing,
  type ExtractedPrice,
  type ExtractionConfidence,
  type FieldProvenance,
  type GeoPrecision,
  type PriceUnit
} from './listingImport'

type Json = Record<string, unknown>

const LODGING_TYPES =
  /^(LodgingBusiness|Accommodation|House|Apartment|Hotel|Motel|Hostel|Resort|VacationRental|Residence|SingleFamilyResidence|Place)$/i

function typesOf(node: Json): string[] {
  const raw = node['@type']
  const list = Array.isArray(raw) ? raw : raw != null ? [raw] : []
  return list.map((t) => String(t).replace(/^https?:\/\/schema\.org\/?/i, ''))
}

function isType(node: Json, re: RegExp): boolean {
  return typesOf(node).some((t) => re.test(t))
}

export function flattenGraph(node: unknown, out: Json[] = []): Json[] {
  if (Array.isArray(node)) {
    for (const item of node) flattenGraph(item, out)
    return out
  }
  if (typeof node !== 'object' || node === null) return out
  const obj = node as Json
  out.push(obj)
  if ('@graph' in obj) flattenGraph(obj['@graph'], out)
  return out
}

export function extractAllJsonLd(html: string): unknown[] {
  const blocks: unknown[] = []
  const pattern = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = pattern.exec(html)) !== null) {
    const raw = m[1]
      .trim()
      .replace(/^\s*<!--/, '')
      .replace(/-->\s*$/, '')
      .replace(/^\s*<!\[CDATA\[/, '')
      .replace(/\]\]>\s*$/, '')
    try {
      blocks.push(JSON.parse(raw))
    } catch {
      /* bloc JSON-LD invalide : les sites en publient régulièrement */
    }
  }
  return blocks
}

function decodeEntities(value: string): string {
  const amp = String.fromCharCode(38)
  return value
    .replace(new RegExp(amp + 'quot;', 'g'), '"')
    .replace(/&#0?39;/g, "'")
    .replace(new RegExp(amp + 'apos;', 'g'), "'")
    .replace(new RegExp(amp + 'nbsp;', 'g'), ' ')
    .replace(new RegExp(amp + 'lt;', 'g'), '<')
    .replace(new RegExp(amp + 'gt;', 'g'), '>')
    .replace(new RegExp(amp + 'amp;', 'g'), amp)
}

export function extractMetaTag(html: string, property: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${property}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
    'i'
  )
  const reversed = new RegExp(
    `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${property}["']`,
    'i'
  )
  const m = pattern.exec(html) ?? reversed.exec(html)
  return m ? decodeEntities(m[1]).trim() : null
}

export function extractItemProp(html: string, prop: string): string | null {
  const attr = new RegExp(
    `itemprop\\s*=\\s*["']${prop}["'][^>]*(?:content\\s*=\\s*["']([^"']+)["']|>([^<]+)<)`,
    'i'
  )
  const m = attr.exec(html)
  if (!m) return null
  const value = (m[1] ?? m[2] ?? '').trim()
  return value ? decodeEntities(value) : null
}

function canonicalHref(html: string): string | null {
  const m = /<link[^>]+rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["']/i.exec(html)
    ?? /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']canonical["']/i.exec(html)
  return m ? decodeEntities(m[1]).trim() : null
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[^\d.,-]/g, '').replace(/\s/g, '')
  if (!cleaned) return null
  const normalized =
    cleaned.includes(',') && cleaned.includes('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(',', '.')
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function unitFromText(text: string | null | undefined): PriceUnit | null {
  if (!text) return null
  const t = text.toLowerCase()
  if (/nuit|night|\/n\b|per[\s-]?night|unitcode["']?\s*:\s*["']day/i.test(t)) return 'night'
  if (/semaine|week|\/sem|per[\s-]?week|unitcode["']?\s*:\s*["']wee/i.test(t)) return 'week'
  if (/séjour|sejour|stay|total/i.test(t)) return 'stay'
  return null
}

function unitFromCode(code: unknown): PriceUnit | null {
  if (typeof code !== 'string') return null
  const c = code.toUpperCase()
  if (c === 'DAY' || c === 'D' || c === 'NIGHT') return 'night'
  if (c === 'WEE' || c === 'WEEKS' || c === 'W') return 'week'
  return null
}

function looksLikeFrom(text: string | null | undefined): boolean {
  if (!text) return false
  return /à partir de|a partir de|from\s|starting at|dès\s|des\s+\d/i.test(text)
}

interface PriceHit {
  value: number
  currency: string
  unit: PriceUnit
  isFrom: boolean
}

export function extractPrice(offers: unknown, surroundingText?: string): PriceHit | null {
  if (offers == null) return null
  if (Array.isArray(offers)) {
    for (const item of offers) {
      const hit = extractPrice(item, surroundingText)
      if (hit) return hit
    }
    return null
  }
  if (typeof offers === 'number' && Number.isFinite(offers) && offers > 0) {
    return {
      value: offers,
      currency: 'EUR',
      unit: unitFromText(surroundingText) ?? 'unknown',
      isFrom: looksLikeFrom(surroundingText)
    }
  }
  if (typeof offers !== 'object') return null
  const node = offers as Json
  const spec = (node.priceSpecification ?? node.priceSpec) as Json | Json[] | undefined
  const specNode = Array.isArray(spec) ? spec[0] : spec

  const low = parseNumber(node.lowPrice)
  const high = parseNumber(node.highPrice)
  const direct =
    parseNumber(node.price) ??
    parseNumber(specNode && typeof specNode === 'object' ? specNode.price : null) ??
    parseNumber(node.minPrice)

  const currency =
    str(node.priceCurrency) ??
    str(node.currency) ??
    (specNode && typeof specNode === 'object' ? str(specNode.priceCurrency) : null) ??
    'EUR'

  const unit =
    unitFromCode(node.unitCode) ??
    unitFromCode(specNode && typeof specNode === 'object' ? specNode.unitCode : null) ??
    unitFromText(str(node.unitText)) ??
    unitFromText(surroundingText) ??
    'unknown'

  const isAggregate = isType(node, /AggregateOffer/i)
  const isFrom =
    looksLikeFrom(surroundingText) ||
    looksLikeFrom(str(node.name)) ||
    looksLikeFrom(str(node.description)) ||
    (isAggregate && low != null) ||
    (low != null && high != null && low !== high && direct == null)

  const value = isFrom ? (low ?? direct) : (direct ?? low)
  if (value == null || value <= 0) return null
  return { value, currency, unit, isFrom }
}

function geoOf(node: Json): { lat: number; lon: number } | null {
  const geo = node.geo
  const obj = (typeof geo === 'object' && geo !== null ? (geo as Json) : node) as Json
  const lat = parseNumber(obj.latitude ?? node.latitude)
  const lon = parseNumber(obj.longitude ?? node.longitude)
  if (lat == null || lon == null) return null
  if (lat === 0 && lon === 0) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

function addressOf(node: Json): string | null {
  const address = node.address
  if (typeof address === 'string') return address.trim() || null
  if (typeof address !== 'object' || address === null) {
    return str(node.addressLocality) ?? str(node.streetAddress)
  }
  const a = address as Json
  const parts = [str(a.streetAddress), str(a.postalCode), str(a.addressLocality), str(a.addressRegion)].filter(
    (p): p is string => Boolean(p)
  )
  return parts.length > 0 ? parts.join(', ') : str(a.addressLocality)
}

function guestsOf(node: Json): number | null {
  const occ = node.occupancy
  if (typeof occ === 'number') return occ > 0 ? occ : null
  if (typeof occ === 'object' && occ !== null) {
    const o = occ as Json
    const n = parseNumber(o.value ?? o.maxValue ?? o.max ?? o.n)
    if (n != null && n > 0) return n
  }
  const n = parseNumber(
    node.numberOfGuests ?? node.maxGuests ?? node.people ?? node.occupancyMax ?? node.maximumAttendeeCapacity
  )
  return n != null && n > 0 ? n : null
}

function roomsOf(node: Json): number | null {
  const n = parseNumber(node.numberOfRooms ?? node.numberOfBedrooms ?? node.bedrooms ?? node.roomCount)
  return n != null && n > 0 ? n : null
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  return m ? m[1] : null
}

function stayOf(node: Json): { checkIn: string | null; checkOut: string | null } {
  const offers = node.offers
  const offerNode = Array.isArray(offers) ? (offers[0] as Json | undefined) : offers
  const o = (typeof offerNode === 'object' && offerNode !== null ? offerNode : node) as Json
  return {
    checkIn: isoDate(o.checkInDate ?? o.checkinDate ?? o.validFrom ?? o.availabilityStarts),
    checkOut: isoDate(o.checkOutDate ?? o.checkoutDate ?? o.validThrough ?? o.availabilityEnds)
  }
}

function feesOf(node: Json, source: FieldProvenance): ExtractedFees | undefined {
  const cleaning = parseNumber(node.cleaningFee ?? node.cleaning_fee)
  const touristTax = parseNumber(node.touristTax ?? node.tourist_tax ?? node.taxes)
  const service = parseNumber(node.serviceFee ?? node.service_fee)
  const utilities = parseNumber(node.utilities ?? node.charges)
  const deposit = parseNumber(node.securityDeposit ?? node.deposit)
  if (cleaning == null && touristTax == null && service == null && utilities == null && deposit == null) {
    return undefined
  }
  return {
    cleaning: cleaning ?? undefined,
    touristTax: touristTax ?? undefined,
    service: service ?? undefined,
    utilities: utilities ?? undefined,
    deposit: deposit ?? undefined,
    isComplete: false,
    source
  }
}

export function findLodgingCandidates(nodes: Json[]): Json[] {
  const lodging: Json[] = []
  const products: Json[] = []
  const offers: Json[] = []
  for (const node of nodes) {
    if (isType(node, LODGING_TYPES)) lodging.push(node)
    else if (isType(node, /^Product$/i)) products.push(node)
    else if (isType(node, /^(Offer|AggregateOffer)$/i)) offers.push(node)
  }
  return [...lodging, ...products, ...offers]
}

export function parseMetadata(
  html: string,
  url: string,
  options?: { source?: FieldProvenance; listingHash?: string; now?: number }
): ExtractedListing {
  const now = options?.now ?? Date.now()
  const sourceHint = options?.source ?? 'jsonld'
  const extracted: Partial<ExtractedListing> = {
    fetchMetadata: {
      url,
      fetchStatus: 'success',
      resolutionStrategy: 'proceed',
      attempts: 1,
      timestamp: now
    },
    missingCriticalFields: [],
    listingHash: options?.listingHash ?? '',
    completenessScore: 0
  }

  const jsonLdBlocks = extractAllJsonLd(html)
  extracted.rawJsonLd = jsonLdBlocks.length > 0 ? jsonLdBlocks : undefined
  const nodes: Json[] = []
  for (const block of jsonLdBlocks) flattenGraph(block, nodes)
  const candidates = findLodgingCandidates(nodes)

  const takeTitle = (name: string | null, source: FieldProvenance, conf: ExtractionConfidence): void => {
    if (extracted.title || !name) return
    extracted.title = field(name, source, conf, now)
  }
  const takePrice = (hit: PriceHit | null, source: FieldProvenance): void => {
    if (extracted.priceBase || !hit) return
    const price: ExtractedPrice = {
      value: hit.value,
      currency: hit.currency,
      unit: hit.unit,
      isFrom: hit.isFrom,
      source,
      confidence: hit.isFrom || hit.unit === 'unknown' ? 'medium' : 'high',
      extractedAt: now
    }
    extracted.priceBase = price
  }
  const takeGeo = (
    coords: { lat: number; lon: number } | null,
    source: FieldProvenance,
    precision: GeoPrecision
  ): void => {
    if (extracted.geo || !coords) return
    extracted.geo = {
      value: coords,
      source,
      confidence: precision === 'exact' ? 'high' : 'medium',
      extractedAt: now,
      precision
    }
  }

  for (const candidate of candidates) {
    const blob = `${str(candidate.name) ?? ''} ${str(candidate.description) ?? ''}`
    takeTitle(str(candidate.name), sourceHint, 'high')
    takePrice(extractPrice(candidate.offers ?? candidate, blob), sourceHint)
    takeGeo(geoOf(candidate), sourceHint, 'exact')
    if (!extracted.addressText) {
      const addr = addressOf(candidate)
      if (addr) extracted.addressText = field(addr, sourceHint, 'high', now)
    }
    if (!extracted.guests) {
      const g = guestsOf(candidate)
      if (g) extracted.guests = field(g, sourceHint, 'high', now)
    }
    if (!extracted.occupancyMax) {
      const o = guestsOf(candidate)
      if (o) extracted.occupancyMax = field(o, sourceHint, 'high', now)
    }
    if (!extracted.rooms) {
      const r = roomsOf(candidate)
      if (r) extracted.rooms = field(r, sourceHint, 'high', now)
    }
    if (!extracted.checkIn || !extracted.checkOut) {
      const stay = stayOf(candidate)
      if (!extracted.checkIn && stay.checkIn) extracted.checkIn = field(stay.checkIn, sourceHint, 'medium', now)
      if (!extracted.checkOut && stay.checkOut) extracted.checkOut = field(stay.checkOut, sourceHint, 'medium', now)
    }
    if (!extracted.description) {
      const d = str(candidate.description)
      if (d) extracted.description = field(d, sourceHint, 'high', now)
    }
    if (!extracted.image) {
      const img = candidate.image
      const urlImg =
        typeof img === 'string'
          ? img
          : Array.isArray(img)
            ? str(img[0])
            : typeof img === 'object' && img !== null
              ? str((img as Json).url)
              : null
      if (urlImg) extracted.image = field(urlImg, sourceHint, 'medium', now)
    }
    if (!extracted.fees) {
      const fees = feesOf(candidate, sourceHint)
      if (fees) extracted.fees = fees
    }
  }

  if (!extracted.title) {
    const ogTitle = extractMetaTag(html, 'og:title')
    if (ogTitle) extracted.title = field(ogTitle, 'opengraph', 'medium', now)
  }
  if (!extracted.description) {
    const ogDesc = extractMetaTag(html, 'og:description')
    if (ogDesc) extracted.description = field(ogDesc, 'opengraph', 'medium', now)
  }
  if (!extracted.image) {
    const ogImg = extractMetaTag(html, 'og:image')
    if (ogImg) extracted.image = field(ogImg, 'opengraph', 'medium', now)
  }
  if (!extracted.priceBase) {
    const amount = extractMetaTag(html, 'product:price:amount')
    const n = parseNumber(amount)
    if (n != null && n > 0) {
      const currency = extractMetaTag(html, 'product:price:currency') ?? 'EUR'
      const blob = `${extracted.title?.value ?? ''} ${extracted.description?.value ?? ''}`
      extracted.priceBase = {
        value: n,
        currency,
        unit: unitFromText(blob) ?? 'unknown',
        isFrom: looksLikeFrom(blob),
        source: 'opengraph',
        confidence: 'medium',
        extractedAt: now
      }
    }
  }
  if (!extracted.priceBase) {
    const itemPrice = extractItemProp(html, 'price')
    const n = parseNumber(itemPrice)
    if (n != null && n > 0) {
      extracted.priceBase = {
        value: n,
        currency: extractItemProp(html, 'priceCurrency') ?? 'EUR',
        unit: 'unknown',
        isFrom: false,
        source: 'itemprop',
        confidence: 'low',
        extractedAt: now
      }
    }
  }

  const canon = canonicalHref(html)
  if (canon) extracted.canonicalUrl = field(canon, 'canonical', 'high', now)

  if (!extracted.geo) {
    const page = readCoords(html)
    if (page) takeGeo(page, 'page', 'exact')
  }

  extracted.completenessScore = calculateCompleteness(extracted)
  extracted.missingCriticalFields = identifyMissingCriticalFields(extracted)
  if (extracted.completenessScore < 60 && extracted.fetchMetadata) {
    extracted.fetchMetadata.resolutionStrategy = 'partial_with_form'
  }

  return extracted as ExtractedListing
}

export function parseJsonLdText(text: string, url: string, listingHash = ''): ExtractedListing {
  const trimmed = text.trim()
  let html = trimmed
  if (!/<script/i.test(trimmed)) {
    try {
      JSON.parse(trimmed)
      html = `<script type="application/ld+json">${trimmed}</script>`
    } catch {
      html = trimmed
    }
  }
  return parseMetadata(html, url, { source: 'user_pasted_jsonld', listingHash })
}
