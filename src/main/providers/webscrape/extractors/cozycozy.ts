/**
 * Extracteur CozyCozy (repli HTML Abritel, pas une source). Exécuté dans la page via page.evaluate :
 * aucune fermeture de module, helpers recopiés localement.
 */
import type { RawCard } from './types'

/** CozyCozy — SERP datée (`joli-resultitem`) ou catalogue SEO (`hoj_seo_card`). */
export function extractCozycozyCards(): RawCard[] {
  const out: RawCard[] = []
  const seen = new Set<string>()

  /*
   * Positions publiées par la page, lues dans le JSON-LD.
   *
   * Recopié plutôt que factorisé, et c'est délibéré : cette fonction est
   * sérialisée puis exécutée DANS la page par `page.evaluate`, où la portée du
   * module n'existe pas. Un helper partagé lèverait « ... is not defined » à
   * l'exécution, sans que rien ne le signale à la compilation.
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

  const photoOfNode = (node: Element): string | undefined => {
    const pick = (raw: string | null | undefined): string | undefined => {
      if (!raw) return undefined
      const first = raw.split(',')[0]?.trim().split(/\s+/)[0]
      if (!first || /placeholder|blank|spacer|data:image\/gif|1x1/i.test(first)) return undefined
      try {
        return new URL(first, location.href).href
      } catch {
        return undefined
      }
    }
    const imgEl = node.querySelector('img') as HTMLImageElement | null
    if (!imgEl) return undefined
    return (
      pick(imgEl.currentSrc) ||
      pick(imgEl.getAttribute('src')) ||
      pick(imgEl.getAttribute('data-src')) ||
      pick(imgEl.getAttribute('data-lazy-src')) ||
      pick(imgEl.getAttribute('data-srcset')) ||
      pick(imgEl.getAttribute('srcset'))
    )
  }

  /*
   * Dump 2026-09-02 (cozy-dated-cards.json) : SERP `/search/{lieu}/{dates}/{ch-ad-enf}/results`.
   * Cartes `joli-resultitem`, prix `.pricetag-stacked` « 6692 € pour 7 nuits »,
   * lien `a.fake-deeplink`. Occupancy non libellée (6 6 13) — on ne l'invente pas.
   */
  document.querySelectorAll('joli-resultitem').forEach((node) => {
    const priceNode = node.querySelector('.pricetag-stacked, .sum, span.total')
    const priceText =
      priceNode?.textContent?.match(/\d[\d\s\u00a0\u202f\u2009.,]*\s*€(?:\s*pour\s+\d+\s+nuits?)?/i)?.[0] ||
      node.textContent?.match(/\d[\d\s\u00a0\u202f\u2009.,]*\s*€\s*pour\s+\d+\s+nuits?/i)?.[0]
    if (!priceText) return
    const link = node.querySelector('a.fake-deeplink') as HTMLAnchorElement | null
    const href = link?.href
    if (!href || !href.includes('cozycozy')) return
    const sourceId = href.match(/clickId=([^&]+)/i)?.[1] || href.slice(-48)
    if (seen.has(sourceId)) return
    seen.add(sourceId)
    const raw =
      node.querySelector('.content-wrapper')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    const title = raw.replace(/Voir l['’]offre.*$/i, '').trim().slice(0, 80) || 'Offre CozyCozy'
    out.push({
      sourceId,
      title,
      url: href,
      priceText,
      image: photoOfNode(node)
    })
  })

  /*
   * Dump 2026-09-01 21:47 : catalogue SEO `article.hoj_seo_card`.
   * Pas de href sur la carte (bouton « Voir »). Prix « À partir de N €/nuit ».
   * Ancien sélecteur `/offer` = 0. `article` sans prix attrapait une FAQ.
   */
  document.querySelectorAll('article.hoj_seo_card, .hoj_seo_card').forEach((node) => {
    const title =
      node.querySelector('h3.title, h3, .title')?.textContent?.trim() || ''
    if (!title || title.length < 3) return
    const priceText =
      node.querySelector('.price')?.textContent?.match(/\d[\d\s.,]*\s*€(?:\s*\/\s*nuit)?/i)?.[0] ||
      node.textContent?.match(/\d[\d\s.,]*\s*€(?:\s*\/\s*nuit)?/i)?.[0]
    if (!priceText) return
    const sourceId = title.toLowerCase().replace(/\s+/g, '-').slice(0, 80)
    if (seen.has(sourceId)) return
    seen.add(sourceId)
    const hash = [...document.querySelectorAll('a[href*="#cp:details"]')].find((a) =>
      (a.textContent || '').includes(title.slice(0, 24))
    ) as HTMLAnchorElement | undefined
    const href = hash?.href || `${location.origin}${location.pathname}#${encodeURIComponent(sourceId)}`
    const texte = node.textContent || ''
    const lire = (m: RegExpExecArray | null): number | undefined => {
      if (!m) return undefined
      const n = Number(m[1])
      return Number.isFinite(n) && n > 0 ? n : undefined
    }
    out.push({
      sourceId,
      title,
      url: href,
      priceText,
      image: photoOfNode(node),
      guests: lire(/(\d+)\s*(?:voyageurs?|personnes?|guests?)/i.exec(texte)),
      bedrooms: lire(/(\d+)\s*(?:chambres?|bedrooms?)/i.exec(texte))
    })
  })

  document.querySelectorAll('a[href*="/offer"], a[href*="/listing"], article, [class*="Offer"], [class*="result"]').forEach((node) => {
    if ((node as HTMLElement).classList?.contains('hoj_seo_card')) return
    if (node.tagName === 'JOLI-RESULTITEM') return
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
    // Dump : « À partir de 89 €/nuit ». On garde « /nuit » pour ne pas
    // ranger ce montant en total de séjour.
    const priceText = node.textContent?.match(/\d[\d\s.,]*\s*€(?:\s*\/\s*nuit)?/i)?.[0]
    if (!priceText) return
    const texte = node.textContent || ''
    const lire = (m: RegExpExecArray | null): number | undefined => {
      if (!m) return undefined
      const n = Number(m[1])
      return Number.isFinite(n) && n > 0 ? n : undefined
    }
    const pos = geo[href] || geo[href.split('?')[0]]
    out.push({
      sourceId,
      title,
      url: href,
      priceText,
      image: photoOfNode(node),
      lat: pos?.lat,
      lon: pos?.lon,
      guests: lire(/(\d+)\s*(?:voyageurs?|personnes?|guests?)/i.exec(texte)),
      bedrooms: lire(/(\d+)\s*(?:chambres?|bedrooms?)/i.exec(texte))
    })
  })
  return out
}
