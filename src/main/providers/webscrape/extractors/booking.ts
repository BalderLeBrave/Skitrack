/**
 * Extracteur Booking.com. Exécuté dans la page via page.evaluate :
 * aucune fermeture de module, helpers recopiés localement.
 */
import type { RawCard } from './types'

/** Booking.com — cartes [data-testid="property-card"] ou liens /hotel/ */
export function extractBookingCards(): RawCard[] {
  const out: RawCard[] = []
  const seen = new Set<string>()

  const cardPhoto = (node: Element): string | undefined => {
    const pick = (raw: string | null | undefined): string | undefined => {
      if (!raw) return undefined
      const first = raw.split(',')[0]?.trim().split(/\s+/)[0]
      if (!first || /placeholder|blank|spacer|data:image|1x1|pixel/i.test(first)) return undefined
      try {
        return new URL(first, location.href).href
      } catch {
        return undefined
      }
    }
    for (const img of Array.from(node.querySelectorAll('img'))) {
      const el = img as HTMLImageElement
      const hit =
        pick(el.currentSrc) ||
        pick(el.getAttribute('src')) ||
        pick(el.getAttribute('data-src')) ||
        pick(el.getAttribute('data-lazy-src')) ||
        pick(el.getAttribute('data-srcset')) ||
        pick(el.getAttribute('srcset'))
      if (hit) return hit
    }
    const styled = node.querySelector('[style*="background"]') as HTMLElement | null
    const bg = styled?.style?.backgroundImage || styled?.getAttribute('style')
    const m = bg?.match(/url\(["']?([^"')]+)["']?\)/)
    return pick(m?.[1])
  }

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
  const occupancy: Record<string, { guests?: number; bedrooms?: number; type?: string }> = {}
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
        if (typeof pageName === 'string') {
          if (
            loc &&
            typeof loc.latitude === 'number' &&
            typeof loc.longitude === 'number' &&
            (loc.latitude !== 0 || loc.longitude !== 0)
          ) {
            positions[pageName] = { lat: loc.latitude, lon: loc.longitude }
          }
          const slot = occupancy[pageName] ?? {}
          const occu = obj.occupancy as Record<string, unknown> | undefined
          const maxP = occu?.maxPersons ?? occu?.maxGuests ?? obj.maxPersons ?? obj.numberOfGuests
          if (typeof maxP === 'number' && maxP > 0) slot.guests = maxP
          const br = obj.numberOfBedrooms ?? obj.bedroomCount ?? obj.bedrooms
          if (typeof br === 'number' && br > 0) slot.bedrooms = br
          for (const key of ['accommodationTypeName', 'propertyType', 'accType'] as const) {
            const t = obj[key]
            if (typeof t === 'string' && t.trim().length > 1) slot.type = t.trim()
          }
          occupancy[pageName] = slot
        }
        for (const key in obj) walk(obj[key])
      }
      walk(JSON.parse(store.textContent))
    }
  } catch {
    /* magasin illisible : les cartes sortiront sans position ni occupancy Apollo */
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
    const img = cardPhoto(root)
    // Position du bien : jointure avec le magasin Apollo par le slug de l'URL.
    const slug = href.match(/\/hotel\/[a-z]{2}\/([^./?#]+)/i)?.[1]
    const pos = slug ? positions[slug] : undefined
    const extra = slug ? occupancy[slug] : undefined

    /*
     * Taille du bien, lue dans la description de l'unité recommandée.
     *
     * Le bloc `recommended-units` porte une phrase du genre « Appartement
     * entier • 3 chambres • 1 salon • 2 salles de bains • 1 cuisine • 49 m² ».
     * On lit les nombres qui y sont écrits, et rien d'autre : « salles de
     * bains » et « cuisine » sont volontairement ignorés — ils n'entrent dans
     * aucun critère — et « lits » n'est jamais converti en capacité.
     *
     * Le repli sur le texte entier de la carte sert les mises en page où le
     * bloc porte un autre `data-testid` : la phrase, elle, reste la même.
     */
    const unites =
      root.querySelector('[data-testid="recommended-units"]')?.textContent ||
      root.textContent ||
      ''
    /*
     * Les trois nombres écrits sur la carte.
     *
     * Une première version de ces expressions se terminait par `` et ne
     * trouvait jamais rien, alors que la même expression retapée à côté
     * marchait. La cause n'était pas le code mais **un octet** : le `` avait
     * été écrit dans le fichier comme le caractère de contrôle « retour
     * arrière » (0x08) au lieu des deux caractères antislash-b. L'expression
     * exigeait donc un retour arrière après « lits », ce qu'aucune page ne
     * contient. Rien ne le montrait à la lecture — seul `cat -A` le révélait.
     *
     * D'où la règle qu'on s'applique ici : pas de `` en fin de motif quand
     * un caractère suffit à distinguer, et une vérification des octets plutôt
     * que de l'apparence quand une expression « correcte » ne trouve rien.
     */
    const lire = (m: RegExpExecArray | null): number | undefined => {
      if (!m) return undefined
      const n = Number(m[1])
      return Number.isFinite(n) && n > 0 ? n : undefined
    }
    // « 3 chambres », « 1 chambre ». Les hôtels n'en publient pas : ils listent
    // des types de chambre, et l'absence est alors la bonne réponse.
    const bedrooms = lire(/(\d+)\s*chambres?/i.exec(unites)) ?? extra?.bedrooms
    const beds = lire(/(\d+)\s*lits?/i.exec(unites))
    const guests = lire(/(\d+)\s*(?:voyageurs?|personnes?)/i.exec(unites)) ?? extra?.guests
    const areaSqm = lire(/(\d+)\s*m(?:²|2)(?![0-9])/i.exec(unites))
    const typeHint = unites.split(/[•·|]/)[0]?.trim()
    const propertyType =
      extra?.type ||
      (typeHint && typeHint.length >= 2 && typeHint.length < 48 && !/^\d/.test(typeHint)
        ? typeHint
        : undefined)

    out.push({
      sourceId,
      title,
      url: href.split('?')[0],
      priceText,
      ratingText,
      image: img,
      lat: pos?.lat,
      lon: pos?.lon,
      bedrooms,
      beds,
      areaSqm,
      guests,
      propertyType,
    })
  })
  const header =
    document.querySelector('[data-testid="property-list-header"]')?.textContent ||
    document.querySelector('h1')?.textContent ||
    document.body?.innerText?.slice(0, 400) ||
    ''
  const t = header.replace(/\u00a0/g, ' ')
  const sur = t.match(/sur\s+([\d][\d\s.,]{0,10})/i)
  const plain = t.match(
    /([\d][\d\s.,]{0,10})\s*(?:établissements?|logements?|hébergements?|r[ée]sultats?|properties|results)/i
  )
  const advertisedRaw = sur?.[1] ?? plain?.[1]
  if (advertisedRaw && out[0]) {
    const n = Number(advertisedRaw.replace(/[\s.,]/g, ''))
    if (Number.isFinite(n) && n > 0 && n <= 50_000) out[0].advertisedTotal = n
  }
  return out
}
