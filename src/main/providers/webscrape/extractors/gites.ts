/**
 * Extracteur Gîtes de France. Exécuté dans la page via page.evaluate :
 * aucune fermeture de module, helpers recopiés localement.
 */
import type { RawCard } from './types'

/** Gîtes de France */
export function extractGitesCards(): RawCard[] {
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

  const tiles = document.querySelectorAll('.js-search-tile')
  const nodes = tiles.length > 0 ? tiles : document.querySelectorAll('.g2f-accommodationTile')
  nodes.forEach((node) => {
    const link =
      (node.querySelector('a.g2f-accommodationTile-link') as HTMLAnchorElement | null) ||
      (node.querySelector('a.g2f-accommodationTile-image') as HTMLAnchorElement | null) ||
      (Array.from(node.querySelectorAll('a[href]')).find((el) =>
        /\d{2}g\d{3,}/i.test((el as HTMLAnchorElement).href)
      ) as HTMLAnchorElement | null) ||
      (node.tagName === 'A'
        ? (node as HTMLAnchorElement)
        : (node.querySelector('a[href*="gites-de-france"]') as HTMLAnchorElement | null))
    const href = link?.href
    if (!href || !/gites-de-france|\/fr\/.+?\d{2}g\d{3,}/i.test(href)) return
    if (!/\/fr\/.+/.test(href)) return
    if (/gite[-_]de[-_]groupe|gite[-_]de[-_]sejour|chambre[-_]d[-_]hotes/i.test(href)) return
    const sourceId = href.replace(/\/$/, '').split('/').pop()?.split('?')[0] || href
    if (seen.has(sourceId)) return
    seen.add(sourceId)
    const title =
      node.querySelector('h2, h3, a.g2f-accommodationTile-link, .title, .card-title')?.textContent?.trim() ||
      link?.getAttribute('title')?.trim() ||
      link?.textContent?.trim() ||
      ''
    if (!title || title.length < 3) return
    /*
     * Dump `gites_towns_50301.html` : facet type:36172 = Gîte.
     * Chambre d'hôtes (36174) et Gîte de groupe (36171) sont exclus.
     * La tuile porte `.g2f-accommodationTile-text-type` (« Gîte »).
     */
    const typeLabel =
      node.querySelector('.g2f-accommodationTile-text-type')?.textContent?.replace(/\s+/g, ' ').trim() ||
      ''
    const typeFold = typeLabel
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    // Preuve = champ typologie, pas le mot « gîte » dans le titre.
    // Type vide → on garde (facet type:36172 + classifyGitesTypology plus loin).
    // Exiger `\bgites?\b` droppait les chalets (20/33 live D2A).
    if (/chambre d[' ]?hotes|bed[- ]and[- ]breakfast|maison d[' ]?hotes/.test(typeFold)) return
    if (/\bgite(?:s)?\s+de\s+(?:groupe|sejour)\b/.test(typeFold) || /\bgroupe\b/.test(typeFold)) return
    if (/\bcamping\b/.test(typeFold)) return
    const priceBox = node.querySelector('.g2f-accommodationTile-text-price')
    const priceText =
      priceBox?.textContent?.replace(/\s+/g, ' ').trim() ||
      node.querySelector('.g2f-accommodationTile-text-price-new')?.textContent?.replace(/\s+/g, ' ').trim() ||
      node.textContent?.match(/(?:À|A)\s+partir\s+de\s+\d[\d\s.,]*\s*€[^.]{0,20}/i)?.[0] ||
      node.textContent?.match(/\d[\d\s.,]*\s*€/)?.[0]
    /*
     * Un résultat sans prix n'est pas un résultat.
     *
     * Dump 2026-09-01 21:47 (`gites_towns_50301`) : les cartes sont
     * `.js-search-tile` / `.g2f-accommodationTile`, pas `.gite-card`.
     * Le prix est sur la tuile (`g2f-accommodationTile-text-price`) :
     * « À partir de 800 € par semaine » — cache teaser, pas le séjour.
     * On garde « À partir de » / « par semaine » pour ne pas ranger 800 €
     * en total de séjour.
     */
    if (!priceText) return
    const pickRaw = (raw: string | null | undefined): string | undefined => {
      if (!raw) return undefined
      const first = raw.split(',')[0]?.trim().split(/\s+/)[0]?.replace(/&/gi, '&')
      if (
        !first ||
        /placeholder|blank|spacer|data:image|1x1|pixel|\.svg(?:$|\?)|\/themes\/|pictos|favicon|ajax-loader|sprite|\.html?(?:$|\?)|\/search[/?]/i.test(
          first
        )
      ) {
        return undefined
      }
      return first
    }
    const candidates: string[] = []
    const push = (raw: string | null | undefined): void => {
      const hit = pickRaw(raw)
      if (hit) candidates.push(hit)
    }
    const mediaRoot =
      node.querySelector('.g2f-accommodationTile-image, .g2f-accommodationTile-swiper') || node
    for (const imgEl of Array.from(mediaRoot.querySelectorAll('img, source'))) {
      const el = imgEl as HTMLImageElement
      push(el.currentSrc)
      push(el.getAttribute('src'))
      push(el.getAttribute('data-src'))
      push(el.getAttribute('data-lazy-src'))
      push(el.getAttribute('data-original'))
      push(el.getAttribute('data-srcset'))
      push(el.getAttribute('srcset'))
    }
    const styled = mediaRoot.querySelector('[style*="background"]') as HTMLElement | null
    const bg = styled?.style?.backgroundImage || styled?.getAttribute('style')
    push(bg?.match(/url\(["']?([^"')]+)["']?\)/)?.[1])
    /*
     * Swiper lazy : tant que la slide n'est pas initialisée, `src` est vide
     * et seule `innerHTML` porte `/sites/default/files/…jpg?itok=`. Recopié
     * ici plutôt que d'appeler `gitesPhotoFromTileHtml` : cette fonction est
     * sérialisée dans `page.evaluate`.
     */
    const html = (mediaRoot as HTMLElement).innerHTML || (node as HTMLElement).innerHTML || ''
    const fileRe = /\/sites\/default\/files\/[^"'\s>]+\.(?:jpe?g|png|webp)(?:\?[^"'\s>]*)?/gi
    let fileHit: RegExpExecArray | null
    while ((fileHit = fileRe.exec(html)) !== null) candidates.push(fileHit[0].replace(/&/gi, '&'))
    const iteaRe = /https?:\/\/widget-fngf\.itea\.fr\/photos\/[^"'\s>]+\.(?:jpe?g|png|webp)/gi
    while ((fileHit = iteaRe.exec(html)) !== null) candidates.push(fileHit[0])
    const img =
      candidates.find((u) => /\/sites\/default\/files|itea\.fr\/photos|\.(?:jpe?g|png|webp)(?:$|\?)/i.test(u)) ||
      candidates[0]
    const texte = node.textContent || ''
    const lire = (m: RegExpExecArray | null): number | undefined => {
      if (!m) return undefined
      const n = Number(m[1])
      return Number.isFinite(n) && n > 0 ? n : undefined
    }
    const capText =
      node.querySelector('.g2f-accommodationTile-text-capacity')?.textContent?.replace(/\s+/g, ' ').trim() ||
      texte
    const pos = geo[href] || geo[href.split('?')[0]]
    out.push({
      sourceId,
      title,
      url: href,
      priceText,
      image: img,
      propertyType: typeLabel,
      lat: pos?.lat,
      lon: pos?.lon,
      // « 6 personnes », « Capacité : 4 personnes » — Gîtes de France affiche la
      // capacité sur ses cartes de résultat. Rien n'est déduit des lits.
      guests: lire(/(\d+)\s*(?:personnes?|voyageurs?)/i.exec(capText)),
      bedrooms: lire(/(\d+)\s*chambres?/i.exec(capText))
    })
  })
  const head = (document.body?.innerText || '').slice(0, 1600).replace(/\u00a0/g, ' ')
  const adv = head.match(/([\d][\d\s.,]{0,10})\s*(?:r[ée]sultats?|logements?|h[ée]bergements?)/i)
  if (adv && out[0]) {
    const n = Number(adv[1].replace(/[\s.,]/g, ''))
    if (Number.isFinite(n) && n > 0 && n <= 50_000) out[0].advertisedTotal = n
  }
  return out
}
