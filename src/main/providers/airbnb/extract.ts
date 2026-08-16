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
        results.push({
          id: numericId,
          name,
          subtitle: typeof record.subtitle === 'string' ? record.subtitle : undefined,
          priceLabel: priceLabelOf(record.structuredDisplayPrice),
          lat: typeof coordinate.latitude === 'number' ? coordinate.latitude : undefined,
          lon: typeof coordinate.longitude === 'number' ? coordinate.longitude : undefined,
          ratingLabel: typeof record.avgRatingA11yLabel === 'string' ? record.avgRatingA11yLabel : undefined,
          image: firstPicture
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
