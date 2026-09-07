/**
 * Extracteur VRBO / Abritel HTML (repli si getResultList mute). Exécuté dans la page via page.evaluate :
 * aucune fermeture de module, helpers recopiés localement.
 */
import type { RawCard } from './types'

/**
 * VRBO — cartes de résultat.
 *
 * Il n'existait aucun extracteur VRBO : `data/providers.ts` portait une entrée
 * « VRBO » avec `connectors: []`, c'est-à-dire une puce que rien ne pouvait
 * jamais allumer. Le seul code VRBO du dépôt vivait dans
 * `sidecar/skitrack/providers/vrbo.py`, dans un autre processus, derrière une
 * route sans appelant.
 *
 * VRBO appartient au groupe Expedia et sert la même structure `uitk-card` avec
 * des `data-stid` : les sélecteurs suivent donc ceux d'Expedia, avec l'URL de
 * fiche `/<id>` propre à VRBO comme discriminant.
 */
export function extractVrboCards(): RawCard[] {
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

  document
    .querySelectorAll('[data-stid="property-listing"], [data-stid*="lodging-card"], section.uitk-card, li.uitk-card')
    .forEach((root) => {
      const link = root.querySelector('a[href]') as HTMLAnchorElement | null
      const href = link?.href
      if (!href) return
      // Une carte de résultat mène à une fiche de bien ; le reste est de la
      // navigation. Sans ce test, le menu du site entrerait dans la liste —
      // c'est exactement ce qui s'était produit sur Gîtes de France.
      if (!/\/\d{4,}(?:[/?#]|$)/.test(href) && !/\/p\d+/i.test(href)) return
      const sourceId =
        href.match(/\/(\d{4,})(?:[/?#]|$)/)?.[1] ||
        href.match(/\/p(\d+)/i)?.[1] ||
        href.split('?')[0]
      if (seen.has(sourceId)) return
      seen.add(sourceId)

      const title =
        root.querySelector('h3, h2, [data-stid="content-hotel-title"]')?.textContent?.trim() ||
        link?.getAttribute('title') ||
        ''
      if (!title || title.length < 3) return

      const texte = root.textContent || ''
      const priceText =
        root.querySelector('[data-stid="price-lockup-text"], [data-stid*="price"]')?.textContent?.trim() ||
        texte.match(/\d[\d\s.,]*\s*€/)?.[0]
      // Comme pour Gîtes : une carte de résultat porte un prix, une entrée de
      // navigation jamais. C'est le discriminant qui se vérifie sur la page.
      if (!priceText) return

      const pickRawV = (raw: string | null | undefined): string | undefined => {
        if (!raw) return undefined
        const first = raw.split(',')[0]?.trim().split(/\s+/)[0]
        if (!first || /placeholder|blank|spacer|data:image|1x1|pixel/i.test(first)) return undefined
        return first
      }
      let img: string | undefined
      for (const imgEl of Array.from(root.querySelectorAll('img'))) {
        const el = imgEl as HTMLImageElement
        img =
          pickRawV(el.currentSrc) ||
          pickRawV(el.getAttribute('src')) ||
          pickRawV(el.getAttribute('data-src')) ||
          pickRawV(el.getAttribute('data-lazy-src')) ||
          pickRawV(el.getAttribute('srcset'))
        if (img) break
      }
      const lire = (m: RegExpExecArray | null): number | undefined => {
        if (!m) return undefined
        const n = Number(m[1])
        return Number.isFinite(n) && n > 0 ? n : undefined
      }
      const pos = geo[href] || geo[href.split('?')[0]]

      out.push({
        sourceId,
        title,
        url: href.split('?')[0],
        priceText,
        image: img,
        lat: pos?.lat,
        lon: pos?.lon,
        guests: lire(/(\d+)\s*(?:voyageurs?|personnes?|guests?|sleeps)/i.exec(texte)),
        bedrooms: lire(/(\d+)\s*(?:chambres?|bedrooms?)/i.exec(texte)),
        beds: lire(/(\d+)\s*(?:lits?|beds?)/i.exec(texte))
      })
    })
  return out
}
