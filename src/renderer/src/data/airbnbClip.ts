/**
 * Lecture du collage produit par le marque-page Airbnb.
 *
 * ## Le principe, et pourquoi il est propre
 *
 * SKITRACK n'interroge jamais Airbnb. C'est **vous** qui ouvrez la page de
 * recherche — déjà pré-remplie par l'application — dans votre propre navigateur,
 * connecté à votre compte, avec les vrais prix affichés. Un marque-page
 * (`bookmarklet.ts`) lit alors les données que la page a **elle-même déposées**
 * dans son code pour son propre affichage, et les copie dans votre presse-pap
 * papiers. Vous revenez ici, vous collez.
 *
 * Ce n'est pas du scraping : aucune requête automatisée, aucun parcours de
 * catalogue, aucun contournement d'anti-robot. Une page que vous avez chargée
 * légitimement, un clic humain, un copier-coller. C'est le geste que fait
 * n'importe qui en recopiant un prix à la main — simplement fiable et complet.
 *
 * ## Ce que le marque-page produit
 *
 * Un JSON `{ source, destination, checkIn, checkOut, listings: [...] }` où
 * chaque annonce porte au minimum un `id` et un `name`. Ce module valide cette
 * forme et la convertit en `RawListing`, la même structure que l'import de
 * fichier — donc tout l'aval (fusion, comparateur, suivi de prix) fonctionne
 * sans une ligne de code nouvelle.
 *
 * ## Le point délicat : le prix
 *
 * Airbnb écrit ses prix en toutes lettres localisées : « 527,50 € au total »,
 * parfois « 380 € au total. Prix initial : 437 € ». On extrait le **premier**
 * montant (le prix effectif, pas le prix barré), en gérant la virgule décimale
 * française et l'espace insécable de séparation des milliers. Un prix mal lu se
 * propagerait dans le coût total du séjour ; en cas de doute, on préfère ne pas
 * renseigner le prix plutôt qu'en inventer un.
 */

import type { RawListing } from './bulkImport'

/** Une annonce telle que le marque-page la dépose. Tout est optionnel sauf id+name. */
export interface AirbnbClipListing {
  id: string
  name: string
  subtitle?: string
  /** Libellé de prix brut, tel qu'Airbnb l'affiche (« 527,50 € au total »). */
  priceLabel?: string
  lat?: number
  lon?: number
  /** Libellé de note brut (« 4,92 sur 5 » ou « Nouveau »). */
  ratingLabel?: string
  image?: string
  /** URL directe de l'annonce, si le marque-page a pu la construire. */
  url?: string
}

export interface AirbnbClipboard {
  source: 'airbnb'
  destination?: string
  checkIn?: string
  /** Voyageurs de la recherche, lus dans l'URL de la page par le marque-page.
   *  Absent sur les collages faits avec un marque-page antérieur au champ. */
  adults?: string | number
  checkOut?: string
  listings: AirbnbClipListing[]
}

export interface AirbnbParseResult {
  listings: RawListing[]
  errors: string[]
  /** Destination et dates reprises du collage, pour information. */
  meta: { destination?: string; checkIn?: string; checkOut?: string; adults?: number; count: number }
}

/**
 * Extrait un montant d'un libellé Airbnb. Renvoie `null` si rien de fiable.
 *
 * Ne garde que le **premier** nombre : sur « 380 € au total. Prix initial :
 * 437 € », c'est le prix réellement demandé, le second étant le tarif barré.
 * Gère « 1 234,56 » (virgule décimale, espace de milliers, insécable compris).
 */
export function parseAirbnbPrice(label: string | undefined): number | null {
  if (!label) return null
  // Premier groupe de chiffres, avec séparateurs de milliers et décimale.
  const match = label.match(/\d[\d\u00a0\u202f .,]*\d|\d/)
  if (!match) return null

  let token = match[0].replace(/[\u00a0\u202f ]/g, '')
  const lastComma = token.lastIndexOf(',')
  const lastDot = token.lastIndexOf('.')
  if (lastComma > lastDot) {
    token = token.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    token = token.replace(/,/g, '')
  }

  const value = Number(token)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

/** Extrait une note sur 5 d'un libellé (« 4,92 sur 5 »). `null` si « Nouveau ». */
export function parseAirbnbRating(label: string | undefined): string | null {
  if (!label) return null
  const match = label.match(/(\d[.,]\d{1,2})/)
  return match ? match[1].replace('.', ',') : null
}

/** Construit l'URL d'annonce à partir de l'id numérique, dates et voyageurs. */
export function airbnbRoomUrl(
  id: string,
  clip: Pick<AirbnbClipboard, 'checkIn' | 'checkOut'>
): string {
  const query = new URLSearchParams()
  if (clip.checkIn) query.set('check_in', clip.checkIn)
  if (clip.checkOut) query.set('check_out', clip.checkOut)
  const suffix = query.toString()
  return `https://www.airbnb.fr/rooms/${encodeURIComponent(id)}${suffix ? `?${suffix}` : ''}`
}

/**
 * Valide et convertit un collage Airbnb en `RawListing[]`.
 *
 * Accepte le JSON du marque-page, ou directement le tableau `listings`. Une
 * entrée sans `id` ou sans `name` est signalée et écartée : le comparateur
 * garantit ces deux champs, et laisser passer une annonce anonyme casserait la
 * déduplication et l'ouverture du lien.
 */
/**
 * Chambres et lits annoncés par la carte Airbnb.
 *
 * ## Ce que l'application affirmait
 *
 * `airbnbMerge.ts` portait ce commentaire : « la carte de résultat Airbnb ne
 * publie pas la capacité exacte du bien ». Vérifié le 2026-08-30 sur une page
 * de résultats réelle, le texte d'une carte est :
 *
 *     Appartement en résidence ⋅ Modane
 *     Spacieux appartement cœur de station avec garage
 *     2 chambres · 6 lits · 1 salle de bain et 1 toilette
 *     1 754 € au total
 *
 * Les chambres et les lits y sont, en toutes lettres. Ce qui manque est la
 * **capacité en personnes**, et elle seule — la carte ne l'écrit nulle part.
 * Le commentaire généralisait une absence vraie à des données présentes, et
 * l'écran en concluait « le relevé n'a rien rapporté » pour 144 annonces.
 *
 * ## Ce qui est lu, et ce qui ne l'est pas
 *
 * Les nombres écrits sur la carte, rien d'autre. Les lits ne sont pas traduits
 * en capacité : « 6 lits » ne dit pas combien de personnes le bien accepte, et
 * six lits simples ne valent pas six couchages dans une chambre double. Les
 * salles de bain sont ignorées : aucun critère ne les demande.
 *
 * La lecture porte sur le sous-titre **et** le nom : selon la version du
 * marque-page, la ligne de taille tombe dans l'un ou dans l'autre. Une
 * absence reste une absence — la fonction rend `undefined`, jamais zéro.
 */
export function tailleAnnoncee(item: {
  name?: unknown
  subtitle?: unknown
}): { chambres?: number; lits?: number } {
  const morceaux = [item.subtitle, item.name]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' · ')
  if (!morceaux) return {}

  const lire = (m: RegExpExecArray | null): number | undefined => {
    if (!m) return undefined
    const n = Number(m[1])
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  return {
    // « 2 chambres », « 1 chambre ». « Studio » n'est pas traduit en 0 chambre :
    // c'est une convention d'annonce, pas un décompte publié.
    chambres: lire(/(\d+)\s*chambres?\b/i.exec(morceaux)),
    lits: lire(/(\d+)\s*lits?\b/i.exec(morceaux))
  }
}

export function parseAirbnbClipboard(text: string): AirbnbParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return {
      listings: [],
      errors: [
        `Collage illisible : ${error instanceof Error ? error.message : String(error)}. ` +
          'Vérifiez que vous avez bien cliqué le marque-page sur la page de résultats Airbnb, puis collé ici.'
      ],
      meta: { count: 0 }
    }
  }

  const clip = (
    Array.isArray(parsed) ? { source: 'airbnb', listings: parsed } : parsed
  ) as Partial<AirbnbClipboard>

  if (!Array.isArray(clip.listings)) {
    return {
      listings: [],
      errors: ['Le collage ne contient pas de liste d’annonces. Recommencez depuis la page Airbnb.'],
      meta: { count: 0 }
    }
  }

  const listings: RawListing[] = []
  const errors: string[] = []
  const seen = new Set<string>()

  clip.listings.forEach((entry, index) => {
    const item = (entry ?? {}) as AirbnbClipListing
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const id = item.id != null ? String(item.id) : ''

    if (!id || !name) {
      errors.push(`Annonce ${index + 1} : identifiant ou nom manquant, ignorée.`)
      return
    }
    if (seen.has(id)) return
    seen.add(id)

    const total = parseAirbnbPrice(item.priceLabel)
    const rating = parseAirbnbRating(item.ratingLabel)
    const taille = tailleAnnoncee(item)

    listings.push({
      name,
      // Prix absent = 0 : la carte s'affichera « Prix sur Airbnb » et redirigera,
      // au lieu d'afficher un montant deviné. Voir LodgingCard.
      total: total ?? 0,
      source: 'Airbnb',
      url: item.url ?? airbnbRoomUrl(id, clip),
      image: typeof item.image === 'string' ? item.image : undefined,
      note: rating ?? undefined,
      // Le type précis d'Airbnb (« Appartement ⋅ Les Belleville ») n'est pas
      // fiable ; on laisse « Import » et on garde le détail dans le nom.
      type: undefined,
      // Chambres et lits, lus dans le libellé de la carte. Voir
      // `tailleAnnoncee` : Airbnb les écrit, l'application les jetait.
      rooms: taille.chambres,
      beds: taille.lits,
      // Coordonnées lues dans le bloc de données de la page. Airbnb ne publie
      // qu'une position approximative avant réservation : on le déclare, pour
      // que le calcul d'accès arrondisse au lieu de feindre la précision.
      lat: typeof item.lat === 'number' ? item.lat : undefined,
      lon: typeof item.lon === 'number' ? item.lon : undefined,
      locPrecision: 'approximate'
    })
  })

  return {
    listings,
    errors,
    meta: {
      destination: clip.destination,
      checkIn: clip.checkIn,
      checkOut: clip.checkOut,
      // Le marque-page lit `adults` dans l'URL de la page de résultats, comme
      // il lit déjà les dates : c'est le groupe pour lequel Airbnb a filtré ce
      // qui s'affichait. Un collage fait avec un marque-page antérieur au champ
      // n'en a pas — `undefined`, jamais une valeur de l'application.
      adults: (() => {
        const n = Number(clip.adults)
        return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
      })(),
      count: listings.length
    }
  }
}
