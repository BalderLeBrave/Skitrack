/**
 * Cartes Abritel lues dans GET /api/getResultList.
 *
 * CozyCozy n'est PAS une source : agrégateur Airbnb + Booking + Gîtes, doublon.
 * On n'en retient que providerCode abritel / vrbo / homeaway (vrbo.com = 429).
 * Occupancy, total séjour non indicatif, GPS, photo, dates — dump 2026-09-02.
 *
 * Abritel est la marque FR (même plateforme). Les fiches s'ouvrent sur
 * abritel.fr avec startDate / endDate / adults — dump deeplink CozyCozy.
 */

export type CozyResultHit = {
  accommodationId: number | string
  name: string
  propertyType: string
  guests?: number
  bedrooms?: number
  beds?: number
  stay: number
  nightly?: number
  lat?: number
  lon?: number
  providerCode: string
  providerName: string
  deeplink: string
  photo?: string
  fromDate?: string
  toDate?: string
}

export type AbritelStay = {
  checkIn?: string | null
  checkOut?: string | null
  adults?: number | null
  children?: number | null
}

export function isVrboFamilyProvider(code?: string, name?: string, url?: string): boolean {
  const s = `${code ?? ''} ${name ?? ''} ${url ?? ''}`.toLowerCase()
  return /\b(abritel|vrbo|homeaway)\b/.test(s)
}

const ABRITEL_TRACKING = ['mpd', 'mpe', 'mpb', 'mpa', 'mpq', 'label', 'camref', 'clickedRef']

/**
 * Deeplink affilié → fiche Abritel.
 * Dump : `startDate` + `endDate` + `adults` (ex. p6410325a, 13–20/02, 8 pers.).
 * Tracking `mpd`/`mpe` retiré. vrbo.com réécrit en abritel.fr.
 */
export function abritelCanonicalUrl(deeplink: string, stay?: AbritelStay): string {
  const m = deeplink.match(
    /destination:(https:\/\/(?:www\.)?(?:abritel\.fr|vrbo\.com)[^&\s]+)/i
  )
  const raw = m ? decodeURIComponent(m[1]) : deeplink
  try {
    const u = new URL(raw)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    if (host === 'vrbo.com' || host === 'abritel.fr') {
      u.hostname = 'www.abritel.fr'
      u.protocol = 'https:'
    }
    for (const key of ABRITEL_TRACKING) u.searchParams.delete(key)
    if (stay) {
      if (stay.checkIn) {
        u.searchParams.set('startDate', stay.checkIn)
        u.searchParams.set('chkin', stay.checkIn)
      }
      if (stay.checkOut) {
        u.searchParams.set('endDate', stay.checkOut)
        u.searchParams.set('chkout', stay.checkOut)
      }
      if (stay.adults != null && stay.adults > 0) {
        u.searchParams.set('adults', String(stay.adults))
      }
      const children = stay.children != null && stay.children > 0 ? stay.children : 0
      if (stay.adults != null && stay.adults > 0) {
        u.searchParams.set('children', String(children))
      }
    }
    return u.toString()
  } catch {
    return raw
  }
}

function positive(n: unknown): number | undefined {
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n
  return undefined
}

function hitFromEntry(e: Record<string, unknown>): Record<string, unknown> | null {
  const hits = Array.isArray(e.highlightedResults) ? e.highlightedResults : []
  if (hits[0] && typeof hits[0] === 'object') return hits[0] as Record<string, unknown>
  if (e.provider && typeof e.provider === 'object') return e.provider as Record<string, unknown>
  return null
}

function httpUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith('//')) return `https:${s}`
  return undefined
}

function firstPhotoFrom(obj: Record<string, unknown> | null | undefined): string | undefined {
  if (!obj) return undefined
  const thumbs = (obj.lightThumbnails ?? {}) as Record<string, unknown>
  const first = Array.isArray(thumbs.firstUrls) ? thumbs.firstUrls : []
  const fromThumbs = httpUrl(first[0])
  if (fromThumbs) return fromThumbs
  const direct = httpUrl(obj.photo)
  if (direct) return direct
  const photos = Array.isArray(obj.photos) ? obj.photos : []
  const fromPhotos = httpUrl(photos[0])
  if (fromPhotos) return fromPhotos
  const images = Array.isArray(obj.images) ? obj.images : []
  const img0 = images[0]
  if (typeof img0 === 'string') return httpUrl(img0)
  if (img0 && typeof img0 === 'object') {
    const rec = img0 as Record<string, unknown>
    return httpUrl(rec.url) ?? httpUrl(rec.src)
  }
  return undefined
}

function photoOf(e: Record<string, unknown>): string | undefined {
  return firstPhotoFrom(e) ?? firstPhotoFrom(hitFromEntry(e))
}

export function parseCozyResultPayload(json: unknown): CozyResultHit[] {
  if (!json || typeof json !== 'object') return []
  const root = json as Record<string, unknown>
  const list = Array.isArray(root.entries)
    ? root.entries
    : Array.isArray(root.results)
      ? root.results
      : Array.isArray(json)
        ? json
        : []
  const out: CozyResultHit[] = []
  const seen = new Set<string>()

  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    const h = hitFromEntry(e)
    if (!h) continue
    const priceObj = h.totalPrice as Record<string, unknown> | undefined
    if (priceObj?.indicative === true) continue
    const stayRaw = priceObj?.value ?? h.eurPriceValue
    const stay = typeof stayRaw === 'number' && stayRaw > 0 ? Math.round(stayRaw * 100) / 100 : 0
    if (stay <= 0) continue
    const deeplink = typeof h.deeplinkUrl === 'string' ? h.deeplinkUrl : ''
    if (!deeplink) continue
    const providerCode = String(h.providerCode ?? '')
    const providerName = String(h.providerName ?? h.providerText ?? '')
    if (!isVrboFamilyProvider(providerCode, providerName, deeplink)) continue
    const name = typeof e.name === 'string' ? e.name.replace(/\s+/g, ' ').trim() : ''
    if (!name) continue

    const details = (e.subTitleDetails ?? {}) as Record<string, unknown>
    const guests = positive(details.guestCapacity)
    const bedrooms = positive(details.bedRoomCount) ?? positive(h.bedRoomCount)
    if (guests == null || bedrooms == null) continue

    const id = e.accommodationId ?? h.accommodationId ?? h.externalId ?? deeplink
    const key = String(id)
    if (seen.has(key)) continue
    seen.add(key)

    const coords = (e.coordinates ?? {}) as Record<string, unknown>
    const nightlyRaw = h.eurPricePerNight
    const nightly =
      typeof nightlyRaw === 'number' && nightlyRaw > 0 ? Math.round(nightlyRaw) : Math.round(stay / 7)

    out.push({
      accommodationId: id as number | string,
      name,
      propertyType: typeof e.title === 'string' ? e.title : 'logement',
      guests,
      bedrooms,
      beds: positive(details.bedCount),
      stay,
      nightly,
      lat: typeof coords.latitude === 'number' ? coords.latitude : undefined,
      lon: typeof coords.longitude === 'number' ? coords.longitude : undefined,
      providerCode,
      providerName,
      deeplink,
      photo: photoOf(e),
      fromDate: typeof h.fromDate === 'string' ? h.fromDate : undefined,
      toDate: typeof h.toDate === 'string' ? h.toDate : undefined
    })
  }
  return out
}

export function parseCozyResultPayloads(payloads: unknown[]): CozyResultHit[] {
  const seen = new Set<string>()
  const out: CozyResultHit[] = []
  for (const payload of payloads) {
    for (const hit of parseCozyResultPayload(payload)) {
      const key = String(hit.accommodationId)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(hit)
    }
  }
  return out
}

/** Vers le modèle carte du relevé web. Prix = total séjour daté. */
export function cozyHitsToRawCards(hits: CozyResultHit[]): import('./extractors').RawCard[] {
  return hits.map((h) => {
    const family = isVrboFamilyProvider(h.providerCode, h.providerName, h.deeplink)
    return {
      sourceId: String(h.accommodationId),
      title: h.name,
      url: family
        ? abritelCanonicalUrl(h.deeplink, {
            checkIn: h.fromDate,
            checkOut: h.toDate
          })
        : h.deeplink,
      priceText: `${h.stay} € pour 7 nuits`,
      stayAmount: h.stay,
      image: h.photo,
      lat: h.lat,
      lon: h.lon,
      guests: h.guests,
      bedrooms: h.bedrooms,
      beds: h.beds
    }
  })
}
