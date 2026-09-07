/**
 * Extracteur Expedia. Exécuté dans la page via page.evaluate :
 * aucune fermeture de module, helpers recopiés localement.
 */
import type { RawCard } from './types'

/** Expedia — cartes property */
export function extractExpediaFamilyCards(): RawCard[] {
  const out: RawCard[] = []
  const seen = new Set<string>()

  /*
   * Positions publiées par la page, lues dans le JSON-LD.
   *
   * Le bloc est inline et non factorisé : cette fonction est sérialisée puis
   * exécutée dans la page par `page.evaluate`, où aucune fermeture du module
   * n'existe. Un helper partagé lèverait « ... is not defined » à l'exécution,
   * sans rien signaler à la compilation.
   */
  const geo: Record<string, { lat: number; lon: number }> = {}
  document.querySelectorAll('script[type="application/ld+json"]').forEach((tag) => {
    try {
      const parsed: unknown = JSON.parse(tag.textContent || '')
      const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) {
          node.forEach(walk)
          return
        }
        const obj = node as Record<string, unknown>
        const url = typeof obj.url === 'string' ? obj.url : null
        const g = obj.geo as Record<string, unknown> | undefined
        if (url && g && typeof g.latitude === 'number' && typeof g.longitude === 'number') {
          geo[url] = { lat: g.latitude, lon: g.longitude }
        }
        for (const key in obj) walk(obj[key])
      }
      walk(parsed)
    } catch {
      /* fiche sans JSON-LD lisible : la carte sortira sans position */
    }
  })
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
    const pickRawEx = (raw: string | null | undefined): string | undefined => {
      if (!raw) return undefined
      const first = raw.split(',')[0]?.trim().split(/\s+/)[0]
      if (!first || /placeholder|blank|spacer|data:image|1x1|pixel/i.test(first)) return undefined
      return first
    }
    let img: string | undefined
    for (const imgEl of Array.from(root.querySelectorAll('img'))) {
      const el = imgEl as HTMLImageElement
      img =
        pickRawEx(el.currentSrc) ||
        pickRawEx(el.getAttribute('src')) ||
        pickRawEx(el.getAttribute('data-src')) ||
        pickRawEx(el.getAttribute('srcset'))
      if (img) break
    }
    const texte = root.textContent || ''
    const lire = (m: RegExpExecArray | null): number | undefined => {
      if (!m) return undefined
      const n = Number(m[1])
      return Number.isFinite(n) && n > 0 ? n : undefined
    }
    const pos = geo[href] || geo[href.split('?')[0]]
    out.push({
      sourceId: id,
      title,
      url: href,
      priceText,
      image: img,
      lat: pos?.lat,
      lon: pos?.lon,
      guests: lire(/(\d+)\s*(?:voyageurs?|personnes?|guests?)/i.exec(texte)),
      bedrooms: lire(/(\d+)\s*(?:chambres?|bedrooms?)/i.exec(texte))
    })
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
