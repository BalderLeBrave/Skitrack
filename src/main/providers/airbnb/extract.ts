/**
 * Extraction pure des annonces depuis le JSON `data-deferred-state-0`.
 *
 * Même logique que le marque-page (`scripts/airbnb-bookmarklet.src.ts`) et que
 * la version minifiée dans `renderer/.../airbnbBookmarklet.ts`. Centralisée ici
 * pour que le scraper Puppeteer et tout futur chemin d'import partagent le même
 * parseur, testable sans navigateur.
 */

export interface AirbnbClipListing {
  id: string
  name: string
  subtitle?: string
  priceLabel?: string
  lat?: number
  lon?: number
  ratingLabel?: string
  image?: string
  url?: string
  /** Capacité publiée (`personCapacity` / `guestCapacity`). Jamais le groupe UI. */
  guests?: number
  /** « N chambres » sur la carte, ou clé homonyme dans le nœud. */
  bedrooms?: number
}

export interface AirbnbClipPayload {
  source: 'airbnb'
  destination?: string
  checkIn?: string
  checkOut?: string
  listings: AirbnbClipListing[]
}

/** Récupère le premier libellé contenant « € » sous un objet de prix. */
function priceLabelOf(node: unknown): string | undefined {
  let found: string | undefined
  const rec = (value: unknown): void => {
    if (found || value == null || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    const label = record.accessibilityLabel
    if (typeof label === 'string' && label.indexOf('€') >= 0) {
      found = label
      return
    }
    for (const key of Object.keys(record)) rec(record[key])
  }
  rec(node)
  return found
}

/**
 * Occupancy d'un `StaySearchResult`, sans inventer de chemin.
 *
 * Capacité : clés `personCapacity` / `guestCapacity` / `maxGuestCapacity`
 * relevées le 2026-08-30 sur `/api/v3/StaysPdpSections` (parsers.py
 * AIRBNB_CAPACITE). Si le nœud search les porte, on les lit ; sinon null.
 *
 * Chambres : texte de carte constaté le 2026-08-30
 * « 2 chambres · 6 lits · 1 salle de bain » — pas le titre.
 */
export function occupancyFromStaySearchResult(record: Record<string, unknown>): {
  guests?: number
  bedrooms?: number
  line?: string
} {
  let guests: number | undefined
  let bedrooms: number | undefined
  let line: string | undefined
  const takeInt = (n: unknown): number | undefined => {
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0 || n > 50) return undefined
    return n
  }
  const walk = (value: unknown, depth: number): void => {
    if (depth > 8 || value == null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1)
      return
    }
    const obj = value as Record<string, unknown>
    for (const [key, v] of Object.entries(obj)) {
      const k = key.toLowerCase()
      if (guests == null && (k === 'personcapacity' || k === 'guestcapacity' || k === 'maxguestcapacity')) {
        guests = takeInt(v)
      }
      if (typeof v === 'string' && v.length > 0 && v.length <= 80) {
        const ch = /(\d+)\s*chambres?\b/i.exec(v)
        if (ch && bedrooms == null) {
          const n = Number(ch[1])
          if (Number.isFinite(n) && n > 0) {
            bedrooms = n
            line = v.trim()
          }
        }
      } else if (typeof v === 'object') {
        walk(v, depth + 1)
      }
    }
  }
  walk(record, 0)
  return { guests, bedrooms, line }
}

/**
 * Parcourt l'arbre JSON Airbnb à la recherche des nœuds `StaySearchResult`.
 * Déduplique par id numérique.
 */
export function extractListingsFromDeferredState(
  root: unknown,
  meta?: { checkIn?: string; checkOut?: string; destination?: string }
): AirbnbClipPayload {
  const results: AirbnbClipListing[] = []

  const walk = (value: unknown): void => {
    if (value == null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    const record = value as Record<string, unknown>

    if (record.__typename === 'StaySearchResult') {
      const demand = (record.demandStayListing ?? {}) as Record<string, unknown>
      const location = (demand.location ?? {}) as Record<string, unknown>
      const coordinate = (location.coordinate ?? {}) as Record<string, unknown>

      let numericId = ''
      const encoded = typeof demand.id === 'string' ? demand.id : ''
      if (encoded) {
        try {
          const decoded = Buffer.from(encoded, 'base64').toString('utf8')
          const colon = decoded.lastIndexOf(':')
          numericId = colon >= 0 ? decoded.slice(colon + 1) : decoded
        } catch {
          numericId = ''
        }
      }

      const pictures = (record.contextualPictures ?? []) as Array<Record<string, unknown>>
      const firstPicture = pictures.length ? (pictures[0].picture as string | undefined) : undefined

      const name =
        (typeof record.subtitle === 'string' && record.subtitle.trim()) ||
        (typeof record.title === 'string' && record.title.trim()) ||
        ''

      if (numericId && name) {
        const occ = occupancyFromStaySearchResult(record)
        const subtitleParts = [
          typeof record.subtitle === 'string' ? record.subtitle : undefined,
          occ.line
        ].filter((s): s is string => Boolean(s && s.trim()))
        const subtitle = [...new Set(subtitleParts)].join(' · ') || undefined
        results.push({
          id: numericId,
          name,
          subtitle,
          priceLabel: priceLabelOf(record.structuredDisplayPrice),
          lat: typeof coordinate.latitude === 'number' ? coordinate.latitude : undefined,
          lon: typeof coordinate.longitude === 'number' ? coordinate.longitude : undefined,
          ratingLabel: typeof record.avgRatingA11yLabel === 'string' ? record.avgRatingA11yLabel : undefined,
          image: firstPicture,
          guests: occ.guests,
          bedrooms: occ.bedrooms
        })
      }
    }

    for (const key of Object.keys(record)) walk(record[key])
  }

  walk(root)

  const seen: Record<string, boolean> = {}
  const unique = results.filter((item) => {
    if (seen[item.id]) return false
    seen[item.id] = true
    return true
  })

  return {
    source: 'airbnb',
    destination: meta?.destination,
    checkIn: meta?.checkIn,
    checkOut: meta?.checkOut,
    listings: unique
  }
}

/**
 * Parse le textContent du nœud `#data-deferred-state-0` et renvoie le payload.
 * Lève une Error descriptive si le JSON est absent ou illisible.
 */
export function extractFromDeferredStateText(
  text: string,
  meta?: { checkIn?: string; checkOut?: string; destination?: string }
): AirbnbClipPayload {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch {
    throw new Error('Données Airbnb présentes mais illisibles (JSON invalide).')
  }
  return extractListingsFromDeferredState(root, meta)
}
