/**
 * Marque-page « Copier pour SKITRACK », version lisible.
 *
 * DEPUIS LA VERSION « envoi direct » : le marque-page tente d'abord de déposer
 * son relevé dans SKITRACK (POST sur 127.0.0.1, jeton d'appairage dans l'URL,
 * requête « simple » text/plain donc sans pré-vérification CORS, réponse
 * opaque). Si l'application est fermée, il retombe sur le presse-papiers et
 * l'import se fera au retour. Voir `main/pasteBridge.ts` pour le récepteur.
 *
 * Ce fichier n'est PAS importé par l'application. Il est la source, commentée et
 * relisible, du code qui sera minifié en une URL `javascript:` dans
 * `bookmarklet.ts`. On garde les deux séparés pour une raison de confiance :
 * un marque-page est du code que l'utilisateur installe dans son navigateur et
 * exécute sur une page tierce. Il doit pouvoir lire *exactement* ce qu'il fait,
 * en clair, avant de l'installer. La version minifiée reste dérivable de
 * celle-ci à l'identique.
 *
 * ## Ce qu'il fait, et ce qu'il ne fait pas
 *
 * * Il lit le bloc JSON `data-deferred-state-0` **qu'Airbnb a lui-même déposé
 *   dans la page** pour son propre affichage. Aucune requête réseau n'est émise,
 *   aucune donnée n'est envoyée nulle part : tout reste dans la page, puis dans
 *   le presse-papiers, sur votre machine.
 * * Il ne clique rien, ne fait défiler rien, ne charge aucune page suivante. Il
 *   ne prend que ce qui est déjà à l'écran au moment du clic.
 * * S'il ne trouve pas le bloc (Airbnb a changé sa page), il le dit clairement
 *   au lieu d'échouer en silence.
 *
 * ## Pourquoi lire le JSON et pas le HTML affiché
 *
 * Le HTML des cartes change de classes CSS à chaque déploiement d'Airbnb. Le
 * bloc de données, lui, est structuré et stable : identifiant, nom, prix exact,
 * coordonnées, note, image. Le lire donne un résultat propre et durable, là où
 * gratter le DOM affiché casserait à la première refonte.
 */

interface DeferredListing {
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

declare const document: {
  getElementById(id: string): { textContent: string | null } | null
  location: { href: string; search: string }
} & Record<string, unknown>
declare const navigator: { clipboard?: { writeText(text: string): Promise<void> } }
declare function alert(message: string): void

export function collectAirbnb(): void {
  const node = document.getElementById('data-deferred-state-0')
  if (!node || !node.textContent) {
    alert(
      'SKITRACK : je n’ai pas trouvé les données Airbnb sur cette page.\n\n' +
        'Assurez-vous d’être sur une page de RÉSULTATS de recherche Airbnb ' +
        '(l’adresse contient « /s/…/homes »), puis recliquez le marque-page.'
    )
    return
  }

  let root: unknown
  try {
    root = JSON.parse(node.textContent)
  } catch {
    alert('SKITRACK : les données Airbnb sont présentes mais illisibles. Réessayez après un rechargement complet de la page.')
    return
  }

  const results: DeferredListing[] = []

  /** Récupère le premier libellé contenant « € » sous un objet de prix. */
  const priceLabelOf = (node: unknown): string | undefined => {
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

  /** Parcourt l'arbre à la recherche des `StaySearchResult`. */
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

      // L'identifiant numérique se cache dans un id base64 « DemandStayListing:N ».
      let numericId = ''
      const encoded = typeof demand.id === 'string' ? demand.id : ''
      if (encoded) {
        try {
          const decoded = atob(encoded)
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

  if (results.length === 0) {
    alert('SKITRACK : aucune annonce trouvée dans les données de la page. Faites d’abord défiler les résultats, puis recliquez.')
    return
  }

  // Dédoublonnage par identifiant.
  const seen: Record<string, boolean> = {}
  const unique = results.filter((item) => {
    if (seen[item.id]) return false
    seen[item.id] = true
    return true
  })

  const params = new URLSearchParams(document.location.search)
  const payload = JSON.stringify({
    source: 'airbnb',
    destination: undefined,
    checkIn: params.get('checkin') ?? params.get('check_in') ?? undefined,
    checkOut: params.get('checkout') ?? params.get('check_out') ?? undefined,
    listings: unique
  })

  const done = (): void =>
    alert(`SKITRACK : ${unique.length} annonce(s) copiée(s).\n\nRetournez dans SKITRACK et collez (Ctrl+V) dans « Coller depuis Airbnb ».`)

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(payload).then(done, () => {
      // Presse-papiers refusé (permission) : on retombe sur une invite copiable.
      window.prompt('Copiez ce texte (Ctrl+C), puis collez-le dans SKITRACK :', payload)
    })
  } else {
    window.prompt('Copiez ce texte (Ctrl+C), puis collez-le dans SKITRACK :', payload)
  }
}

declare const window: { prompt(message: string, value: string): string | null }
