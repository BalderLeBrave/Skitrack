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
  /**
   * Ce que la page de résultats publie sur la taille du bien.
   *
   * Booking décrit l'unité recommandée en toutes lettres sous la carte —
   * « Appartement entier • 3 chambres • 2 salles de bains • 1 cuisine • 49 m² »,
   * « 6 lits (4 lits simples, 2 grands lits doubles) ». L'extracteur jetait
   * cette phrase, et les 203 annonces Booking du profil réel ressortaient sans
   * chambres ni surface : l'écran répondait « le relevé n'a rapporté ni
   * capacité ni nombre de pièces », alors que la page l'affichait.
   *
   * Rien n'est déduit ici : chaque champ vient d'un nombre écrit sur la page.
   * Les lits ne sont **pas** traduits en capacité — « 6 lits » ne dit pas
   * combien de personnes le bien accepte, et l'inventer serait pire que le
   * silence.
   */
  bedrooms?: number
  beds?: number
  areaSqm?: number
  /**
   * Capacité en **personnes**, telle que la page l'écrit.
   *
   * Le champ manquait au type, et c'est tout ce qui manquait : `Accommodation`
   * le porte (`providers/types.ts`), `baseAccommodation` le relaie
   * (`webscrape/shared.ts`) et `runProviderSearch` le lit (`pers`). Personne
   * ne l'écrivait jamais, si bien que toute annonce relevée arrivait sans
   * capacité et tombait en « non annoncé » dans `partyVerdict`.
   *
   * Elle n'est **jamais** déduite des lits : « 6 lits » ne dit pas combien de
   * personnes le bien accepte, et six lits simples ne valent pas six couchages
   * dans une chambre double.
   */
  guests?: number
  /** Page 0-based dans la SERP, posée par `collectPages`, pas par l'extracteur. */
  pageIndex?: number
  searchRank?: number
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
    const bedrooms = lire(/(\d+)\s*chambres?/i.exec(unites))
    const beds = lire(/(\d+)\s*lits?/i.exec(unites))
    // « 4 voyageurs », « Pour 4 personnes » — la capacité, quand la carte
    // l'écrit. Les hôtels ne l'écrivent pas ; l'absence est alors la réponse.
    const guests = lire(/(\d+)\s*(?:voyageurs?|personnes?)/i.exec(unites))
    // Surface habitable, quand la page la publie : « 49 m² » ou « 49 m2 ».
    const areaSqm = lire(/(\d+)\s*m(?:²|2)(?![0-9])/i.exec(unites))

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
    })
  })
  return out
}

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
    const img = (root.querySelector('img') as HTMLImageElement | null)?.src
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

  document.querySelectorAll(
    '.js-search-tile, .g2f-accommodationTile, a[href*="/fr/"], article, .search-result, .gite-card, .card'
  ).forEach((node) => {
    const link =
      (node.querySelector('a.g2f-accommodationTile-link') as HTMLAnchorElement | null) ||
      (node.tagName === 'A'
        ? (node as HTMLAnchorElement)
        : (node.querySelector('a[href*="gites-de-france"], a[href*="/fr/"]') as HTMLAnchorElement | null))
    const href = link?.href
    if (!href || !href.includes('gites-de-france')) return
    if (!/\/fr\/.+/.test(href)) return
    const sourceId = href.replace(/\/$/, '').split('/').pop()?.split('?')[0] || href
    if (seen.has(sourceId)) return
    seen.add(sourceId)
    const title =
      node.querySelector('h2, h3, a.g2f-accommodationTile-link, .title, .card-title')?.textContent?.trim() ||
      link?.getAttribute('title')?.trim() ||
      link?.textContent?.trim() ||
      ''
    if (!title || title.length < 3) return
    const priceText =
      node.querySelector('.g2f-accommodationTile-text-price-new')?.textContent?.match(/\d[\d\s.,]*\s*€/)?.[0] ||
      node.textContent?.match(/\d[\d\s.,]*\s*€/)?.[0]
    /*
     * Un résultat sans prix n'est pas un résultat.
     *
     * Dump 2026-09-01 21:47 (`gites_towns_50301`) : les cartes sont
     * `.js-search-tile` / `.g2f-accommodationTile`, pas `.gite-card`.
     * Le prix est sur la tuile (`g2f-accommodationTile-text-price-new`).
     * L’ancien sélecteur `a[href*="/fr/"]` prenait le menu et l’image, sans
     * prix → 0 carte sur une SERP de 33.
     */
    if (!priceText) return
    const img = (node.querySelector('img') as HTMLImageElement | null)?.src
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
      image: img,
      lat: pos?.lat,
      lon: pos?.lon,
      // « 6 personnes », « Capacité : 4 personnes » — Gîtes de France affiche la
      // capacité sur ses cartes de résultat. Rien n'est déduit des lits.
      guests: lire(/(\d+)\s*(?:personnes?|voyageurs?)/i.exec(texte)),
      bedrooms: lire(/(\d+)\s*chambres?/i.exec(texte))
    })
  })
  return out
}

/** CozyCozy — méta-résultats */
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
      node.querySelector('.price')?.textContent?.match(/\d[\d\s.,]*\s*€/)?.[0] ||
      node.textContent?.match(/\d[\d\s.,]*\s*€/)?.[0]
    if (!priceText) return
    const sourceId = title.toLowerCase().replace(/\s+/g, '-').slice(0, 80)
    if (seen.has(sourceId)) return
    seen.add(sourceId)
    const hash = [...document.querySelectorAll('a[href*="#cp:details"]')].find((a) =>
      (a.textContent || '').includes(title.slice(0, 24))
    ) as HTMLAnchorElement | undefined
    const href = hash?.href || `${location.origin}${location.pathname}#${encodeURIComponent(sourceId)}`
    const img = (node.querySelector('img') as HTMLImageElement | null)?.src
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
      image: img,
      guests: lire(/(\d+)\s*(?:voyageurs?|personnes?|guests?)/i.exec(texte)),
      bedrooms: lire(/(\d+)\s*(?:chambres?|bedrooms?)/i.exec(texte))
    })
  })

  document.querySelectorAll('a[href*="/offer"], a[href*="/listing"], article, [class*="Offer"], [class*="result"]').forEach((node) => {
    if ((node as HTMLElement).classList?.contains('hoj_seo_card')) return
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
    if (!priceText) return
    const img = (node.querySelector('img') as HTMLImageElement | null)?.src
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
      image: img,
      lat: pos?.lat,
      lon: pos?.lon,
      guests: lire(/(\d+)\s*(?:voyageurs?|personnes?|guests?)/i.exec(texte)),
      bedrooms: lire(/(\d+)\s*(?:chambres?|bedrooms?)/i.exec(texte))
    })
  })
  return out
}

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

      const img = (root.querySelector('img') as HTMLImageElement | null)?.src
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
