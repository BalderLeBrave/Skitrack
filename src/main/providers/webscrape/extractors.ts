/**
 * Extracteurs DOM (exécutés dans la page via page.evaluate).
 * Sélecteurs volontairement larges : les sites changent de classes souvent ;
 * on s’appuie sur href / structure plutôt que sur des BEM figés.
 */

export interface RawCard {
  sourceId: string
  title: string
  url: string
  priceText?: string
  ratingText?: string
  image?: string
  /**
   * Position publiée par la page de résultats, quand elle la porte.
   *
   * Booking l'embarque dans son magasin Apollo (voir `extractBookingCards`) ;
   * la lire n'ajoute aucune requête. Ajouté le 2026-08-29 sur ordre d'Adrien :
   * les annonces Booking arrivaient sans position et la carte les dispersait
   * autour de la station.
   */
  lat?: number
  lon?: number
}

/** Booking.com — cartes [data-testid="property-card"] ou liens /hotel/ */
export function extractBookingCards(): RawCard[] {
  const out: RawCard[] = []
  const seen = new Set<string>()

  /*
   * Positions des biens, lues dans le magasin Apollo embarqué.
   *
   * La page de résultats porte un `<script type="application/json"
   * data-capla-store-data="apollo">` (~450 Ko) où chaque bien apparaît sous
   * `basicPropertyData` : `location.latitude/longitude`, et `pageName` — qui
   * est exactement le slug de l'URL `/hotel/xx/<pageName>.fr.html` de sa
   * carte. C'est la donnée dont Booking se sert pour son propre mini-plan.
   *
   * Constaté sur la page du 2026-08-30 : l'attribut `data-atlas-latlng`
   * d'autrefois n'existe plus (0 occurrence), le magasin Apollo en porte 25.
   * Une lecture qui échoue laisse l'index vide — les cartes sortent alors
   * sans position, comme avant, jamais avec une position fabriquée.
   */
  const positions: Record<string, { lat: number; lon: number }> = {}
  try {
    const store = document.querySelector('script[data-capla-store-data="apollo"]')
    if (store && store.textContent) {
      const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) {
          for (const item of node) walk(item)
          return
        }
        const obj = node as Record<string, unknown>
        const loc = obj.location as Record<string, unknown> | undefined
        const pageName = obj.pageName
        if (
          typeof pageName === 'string' &&
          loc &&
          typeof loc.latitude === 'number' &&
          typeof loc.longitude === 'number' &&
          (loc.latitude !== 0 || loc.longitude !== 0)
        ) {
          positions[pageName] = { lat: loc.latitude, lon: loc.longitude }
        }
        for (const key in obj) walk(obj[key])
      }
      walk(JSON.parse(store.textContent))
    }
  } catch {
    /* magasin illisible : les cartes sortiront sans position */
  }
  const cards = document.querySelectorAll('[data-testid="property-card"], [data-testid="property-card-container"]')
  const nodes = cards.length
    ? cards
    : document.querySelectorAll('a[href*="/hotel/"][data-testid], a[href*="/hotel/"].e13098a3')

  nodes.forEach((node) => {
    const root = node.closest('[data-testid="property-card"]') || node
    const link =
      (root.querySelector('a[href*="/hotel/"]') as HTMLAnchorElement | null) ||
      (node as HTMLAnchorElement)
    const href = link?.href
    if (!href || !href.includes('/hotel/')) return
    const sourceId =
      root.getAttribute('data-hotel-id') ||
      href.match(/\.([a-z0-9]+)\.fr\.html/i)?.[1] ||
      href.match(/hotel\/[^/]+\/([^.]+)/i)?.[1] ||
      href
    if (seen.has(sourceId)) return
    seen.add(sourceId)
    const title =
      root.querySelector('[data-testid="title"], [data-testid="property-card-title"]')?.textContent?.trim() ||
      link.getAttribute('title') ||
      link.textContent?.trim() ||
      ''
    if (!title || title.length < 2) return
    const priceText =
      root.querySelector('[data-testid="price-and-discounted-price"], [data-testid="price"]')?.textContent?.trim() ||
      root.textContent?.match(/\d[\d\s.,]*\s*€/)?.[0]
    const ratingText =
      root.querySelector('[data-testid="review-score"], [aria-label*="note"]')?.textContent?.trim() || undefined
    const img = (root.querySelector('img') as HTMLImageElement | null)?.src
    // Position du bien : jointure avec le magasin Apollo par le slug de l'URL.
    const slug = href.match(/\/hotel\/[a-z]{2}\/([^./?#]+)/i)?.[1]
    const pos = slug ? positions[slug] : undefined
    out.push({
      sourceId,
      title,
      url: href.split('?')[0],
      priceText,
      ratingText,
      image: img,
      lat: pos?.lat,
      lon: pos?.lon
    })
  })
  return out
}

/** Expedia — cartes property */
export function extractExpediaFamilyCards(): RawCard[] {
  const out: RawCard[] = []
  const seen = new Set<string>()
  const anchors = document.querySelectorAll(
    'a[href*="/Hotel-Search"], a[href*="/ho"], a[data-stid="open-hotel-information"]'
  )
  document.querySelectorAll('[data-stid="property-listing"], section.uitk-card, li.uitk-card').forEach((root) => {
    const link =
      (root.querySelector('a[href*="/ho"], a[href*="Hotel"]') as HTMLAnchorElement | null) || null
    const href = link?.href
    if (!href) return
    const id =
      href.match(/\/ho(\d+)/i)?.[1] ||
      href.match(/hotel_id[=:](\d+)/i)?.[1] ||
      href
    if (seen.has(id)) return
    seen.add(id)
    const title =
      root.querySelector('h3, h2, [data-stid="content-hotel-title"]')?.textContent?.trim() ||
      link?.textContent?.trim() ||
      ''
    if (!title || title.length < 2) return
    const priceText =
      root.querySelector('[data-stid="price-lockup-text"], .uitk-text-emphasis-theme')?.textContent?.trim() ||
      root.textContent?.match(/\d[\d\s.,]*\s*€/)?.[0]
    const img = (root.querySelector('img') as HTMLImageElement | null)?.src
    out.push({ sourceId: id, title, url: href, priceText, image: img })
  })
  // fallback liens seuls
  if (out.length === 0) {
    anchors.forEach((a) => {
      const href = (a as HTMLAnchorElement).href
      const id = href.match(/\/ho(\d+)/i)?.[1]
      if (!id || seen.has(id)) return
      seen.add(id)
      const title = a.textContent?.trim() || id
      out.push({ sourceId: id, title, url: href })
    })
  }
  return out
}

/** Gîtes de France */
export function extractGitesCards(): RawCard[] {
  const out: RawCard[] = []
  const seen = new Set<string>()
  document.querySelectorAll('a[href*="/fr/"], article, .search-result, .gite-card, .card').forEach((node) => {
    const link =
      node.tagName === 'A'
        ? (node as HTMLAnchorElement)
        : (node.querySelector('a[href*="gites-de-france"], a[href*="/fr/"]') as HTMLAnchorElement | null)
    const href = link?.href
    if (!href || !href.includes('gites-de-france')) return
    if (!/\/fr\/.+/.test(href)) return
    const sourceId = href.replace(/\/$/, '').split('/').pop() || href
    if (seen.has(sourceId)) return
    seen.add(sourceId)
    const title =
      node.querySelector('h2, h3, .title, .card-title')?.textContent?.trim() ||
      link?.textContent?.trim() ||
      ''
    if (!title || title.length < 3) return
    const priceText = node.textContent?.match(/\d[\d\s.,]*\s*€/)?.[0]
    const img = (node.querySelector('img') as HTMLImageElement | null)?.src
    out.push({ sourceId, title, url: href, priceText, image: img })
  })
  return out
}

/** CozyCozy — méta-résultats */
export function extractCozycozyCards(): RawCard[] {
  const out: RawCard[] = []
  const seen = new Set<string>()
  document.querySelectorAll('a[href*="/offer"], a[href*="/listing"], article, [class*="Offer"], [class*="result"]').forEach((node) => {
    const link =
      node.tagName === 'A'
        ? (node as HTMLAnchorElement)
        : (node.querySelector('a[href]') as HTMLAnchorElement | null)
    const href = link?.href
    if (!href || !href.includes('cozycozy')) return
    const sourceId = href.split('?')[0].replace(/\/$/, '').split('/').slice(-2).join('/')
    if (seen.has(sourceId)) return
    seen.add(sourceId)
    const title =
      node.querySelector('h2, h3, [class*="title"], [class*="Title"]')?.textContent?.trim() ||
      link?.getAttribute('title') ||
      link?.textContent?.trim() ||
      ''
    if (!title || title.length < 3) return
    const priceText = node.textContent?.match(/\d[\d\s.,]*\s*€/)?.[0]
    const img = (node.querySelector('img') as HTMLImageElement | null)?.src
    out.push({ sourceId, title, url: href, priceText, image: img })
  })
  return out
}
