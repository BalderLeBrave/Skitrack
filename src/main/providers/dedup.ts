/**
 * Reconnaissance d'un même bien publié sur plusieurs sources.
 *
 * Le même chalet apparaît sur Airbnb, Booking et Gîtes de France sous trois
 * titres, trois prix et souvent trois positions légèrement différentes — les
 * plateformes floutent volontairement les coordonnées avant réservation. Le
 * rapprochement combine donc plusieurs signaux faibles plutôt que d'en croire
 * un seul.
 *
 * Le modèle qui en sort est à trois niveaux :
 *
 *     property          le bien physique, indépendant des sources
 *      └─ property_source   sa page sur une plateforme donnée
 *          └─ offer          un prix, pour des dates données
 *
 * Politique de fusion : **on préfère rater un rapprochement que d'en inventer
 * un**. Fusionner deux biens distincts affiche un prix qui n'existe pas pour le
 * logement montré, ce qui est bien pire que de le lister deux fois.
 */

import type { Accommodation } from './types'

/** Deux annonces au-delà de cette distance ne sont jamais le même bien. */
const MAX_DISTANCE_M = 250
/** En deçà, deux titres décrivent probablement autre chose. */
const MIN_TITLE_SIMILARITY = 0.55
/** Score total requis pour fusionner. */
const MERGE_THRESHOLD = 0.7

export interface Offer {
  source: string
  sourceId: string
  url: string
  nightlyPrice?: number
  totalPrice?: number
  currency?: string
  checkIn?: string
  checkOut?: string
  availabilityStatus: Accommodation['availabilityStatus']
  priceConfidence: Accommodation['priceConfidence']
  retrievedAt: string
}

export interface PropertySource {
  source: string
  sourceId: string
  url: string
  title: string
  rating?: number
  reviewCount?: number
  rawProviderData?: unknown
}

export interface Property {
  propertyId: string
  title: string
  latitude?: number
  longitude?: number
  bedrooms?: number
  capacity?: number
  images: string[]
  sources: PropertySource[]
  offers: Offer[]
}

/** Distance orthodromique en mètres. */
function distanceM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000
  const toRad = (d: number): number => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function normaliseTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(appartement|apartment|chalet|studio|hotel|hôtel|gite|gîte|residence|résidence|le|la|les|de|du|des|a|à)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Similarité de Dice sur bigrammes : robuste aux mots réordonnés et aux fautes. */
export function titleSimilarity(a: string, b: string): number {
  const left = normaliseTitle(a)
  const right = normaliseTitle(b)
  if (!left || !right) return 0
  if (left === right) return 1

  const bigrams = (value: string): Map<string, number> => {
    const out = new Map<string, number>()
    for (let i = 0; i < value.length - 1; i++) {
      const pair = value.slice(i, i + 2)
      out.set(pair, (out.get(pair) ?? 0) + 1)
    }
    return out
  }

  const first = bigrams(left)
  const second = bigrams(right)
  let shared = 0
  for (const [pair, count] of first) shared += Math.min(count, second.get(pair) ?? 0)
  const total = left.length - 1 + (right.length - 1)
  return total > 0 ? (2 * shared) / total : 0
}

/**
 * Score de similitude entre deux annonces, de 0 à 1.
 *
 * La position est le signal fort quand elle existe : deux biens à moins de
 * 60 m avec un titre proche sont presque sûrement le même. Sans coordonnées,
 * le titre seul ne suffit pas — « Chalet Les Sapins » existe dans dix stations.
 */
export function similarity(a: Accommodation, b: Accommodation): number {
  let score = 0
  let weight = 0

  const hasCoords = a.latitude != null && a.longitude != null && b.latitude != null && b.longitude != null
  if (hasCoords) {
    const metres = distanceM(a.latitude!, a.longitude!, b.latitude!, b.longitude!)
    if (metres > MAX_DISTANCE_M) return 0
    score += (1 - metres / MAX_DISTANCE_M) * 0.45
    weight += 0.45
  }

  const titles = titleSimilarity(a.title, b.title)
  if (titles < MIN_TITLE_SIMILARITY && !hasCoords) return 0
  score += titles * 0.35
  weight += 0.35

  if (a.bedrooms != null && b.bedrooms != null) {
    score += (a.bedrooms === b.bedrooms ? 1 : 0) * 0.1
    weight += 0.1
  }
  if (a.guests != null && b.guests != null) {
    score += (Math.abs(a.guests - b.guests) <= 1 ? 1 : 0) * 0.1
    weight += 0.1
  }

  return weight > 0 ? score / weight : 0
}

function toOffer(item: Accommodation): Offer {
  return {
    source: item.source,
    sourceId: item.sourceId,
    url: item.url,
    nightlyPrice: item.nightlyPrice,
    totalPrice: item.totalPrice,
    currency: item.currency,
    checkIn: item.checkIn,
    checkOut: item.checkOut,
    availabilityStatus: item.availabilityStatus,
    priceConfidence: item.priceConfidence,
    retrievedAt: item.retrievedAt
  }
}

/**
 * Regroupe des annonces multi-sources en biens.
 *
 * Une annonce ne rejoint un bien existant que si elle vient d'une **autre**
 * source : deux annonces de la même plateforme sont deux biens distincts, la
 * plateforme les ayant déjà dédupliqués pour nous.
 */
export function deduplicate(items: Accommodation[]): Property[] {
  const properties: Property[] = []

  for (const item of items) {
    let best: { property: Property; score: number } | null = null
    for (const property of properties) {
      if (property.sources.some((s) => s.source === item.source)) continue
      const reference: Accommodation = {
        ...item,
        title: property.title,
        latitude: property.latitude,
        longitude: property.longitude,
        bedrooms: property.bedrooms,
        guests: property.capacity
      }
      const score = similarity(item, reference)
      if (score >= MERGE_THRESHOLD && (!best || score > best.score)) best = { property, score }
    }

    const source: PropertySource = {
      source: item.source,
      sourceId: item.sourceId,
      url: item.url,
      title: item.title,
      rating: item.rating,
      reviewCount: item.reviewCount,
      rawProviderData: item.rawProviderData
    }

    if (best) {
      best.property.sources.push(source)
      best.property.offers.push(toOffer(item))
      // On complète les trous sans écraser : la première source reste la
      // référence, les suivantes ne font qu'apporter ce qui manquait.
      best.property.latitude ??= item.latitude
      best.property.longitude ??= item.longitude
      best.property.bedrooms ??= item.bedrooms
      best.property.capacity ??= item.guests
      for (const image of item.images ?? []) {
        if (!best.property.images.includes(image)) best.property.images.push(image)
      }
      continue
    }

    properties.push({
      propertyId: `${item.source}:${item.sourceId}`,
      title: item.title,
      latitude: item.latitude,
      longitude: item.longitude,
      bedrooms: item.bedrooms,
      capacity: item.guests,
      images: [...(item.images ?? [])],
      sources: [source],
      offers: [toOffer(item)]
    })
  }

  return properties
}

/** Offre la moins chère dont le prix est exploitable, `null` sinon. */
export function cheapestOffer(property: Property): Offer | null {
  const priced = property.offers.filter((o) => o.totalPrice != null || o.nightlyPrice != null)
  if (priced.length === 0) return null
  return priced.reduce((best, offer) => {
    const value = offer.totalPrice ?? offer.nightlyPrice ?? Infinity
    const current = best.totalPrice ?? best.nightlyPrice ?? Infinity
    return value < current ? offer : best
  })
}
