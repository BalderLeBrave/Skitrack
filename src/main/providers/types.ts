/**
 * Modèle pivot du comparateur multi-sources.
 *
 * Tous les connecteurs — Airbnb, Booking, Gîtes de France… — produisent ce même
 * objet. C'est ce qui permet de trier, comparer et dédupliquer des offres qui
 * n'ont ni le même vocabulaire ni la même granularité à la source.
 *
 * Deux principes structurent ce fichier :
 *
 * 1. **Tout est optionnel sauf ce qui est vérifiable.** `title`, `url`,
 *    `source`, `sourceId` et `retrievedAt` sont garantis ; le reste peut
 *    manquer. Une valeur absente reste absente — on ne comble jamais un trou
 *    par une estimation, parce qu'un prix inventé se propage ensuite dans le
 *    coût total du séjour et fausse une décision.
 * 2. **La donnée brute est conservée.** `rawProviderData` garde la charge utile
 *    du fournisseur : quand Airbnb change son format, on répare le mapper en
 *    relisant ce qui a réellement été reçu, sans relancer de recherche.
 */

/** Ce qu'on sait de la disponibilité. Apparaître dans une recherche ne prouve
 *  rien : beaucoup de sources listent des biens dont le calendrier n'est pas
 *  confirmé pour les dates demandées. */
export type AvailabilityStatus = 'available' | 'unavailable' | 'unknown'

/** Ce qu'on sait du prix. `partial` = un tarif à la nuit sans total confirmé. */
export type PriceConfidence = 'total_confirmed' | 'partial' | 'unknown'

export interface Accommodation {
  /** Identifiant du bien après déduplication, absent avant regroupement. */
  propertyId?: string
  source: string
  sourceId: string

  title: string
  url: string

  latitude?: number
  longitude?: number

  city?: string
  country?: string

  checkIn?: string
  checkOut?: string

  /**
   * Capacité **publiée par la source**, en couchages. Absente si elle se tait.
   *
   * Jamais le nombre de voyageurs demandé. Sept connecteurs y recopiaient
   * `params.adults` : une annonce qui couche six était alors rapportée « 8 pers »
   * parce qu'on avait cherché pour huit, la vignette l'affichait, et le filtre
   * de capacité la laissait passer puisqu'elle déclarait précisément la taille
   * du groupe. Un chiffre qui vaut toujours ce qu'on lui a demandé ne mesure
   * rien — il ne fait que renvoyer la question.
   */
  guests?: number
  bedrooms?: number
  beds?: number
  /**
   * Nombre de **pièces**, quand la source les compte ainsi.
   *
   * Les centrales de station publient des « 2 pièces », pas des chambres :
   * c'est la mesure française de la location de montagne. Traduire l'un en
   * l'autre serait une convention d'annonce, pas une donnée — les deux champs
   * cohabitent donc, et celui que la source n'a pas reste vide.
   */
  rooms?: number
  /** Surface habitable en m², telle que la source l'annonce. */
  areaSqm?: number

  /**
   * Meilleur tarif par occupation, quand la source publie une grille.
   *
   * Une centrale Orchestra n'affiche pas un prix mais un barème : le même
   * appartement vaut 1 161 € à deux et 2 736 € à six, et sa SERP ne montre que
   * le premier, sous un « à partir de ». Retenir ce seul montant pour un groupe
   * de six revenait à annoncer un prix qui n'existe pas pour lui.
   *
   * `totalPrice` porte donc le tarif du groupe **demandé**, et ce champ garde
   * les autres pour que l'écart soit visible plutôt que caché — ajouter une
   * personne peut doubler le séjour, et c'est une information de décision.
   *
   * Trié par occupation croissante. Absent quand la source ne publie pas de
   * grille, ce qui est le cas de tout le reste.
   */
  priceOptions?: {
    guests: number
    total: number
    /** Condition tarifaire publiée avec ce montant. */
    condition?: string
    /** Politique d'annulation : « Flexible », « Non remboursable »… */
    policy?: string
  }[]
  nightlyPrice?: number
  cleaningFee?: number
  serviceFee?: number
  taxes?: number
  totalPrice?: number
  currency?: string

  rating?: number
  /**
   * Échelle sur laquelle `rating` est exprimé, quand ce n'est pas 5.
   *
   * Booking rend ses notes **sur 10** (« 8,2 »), Airbnb sur 5. Sans cette
   * déclaration, la valeur brute était recopiée telle quelle derrière une
   * étoile sur 5, et une note Booking correcte s'affichait comme une note
   * aberrante. L'échelle se déclare **au connecteur**, seul endroit où elle est
   * connue avec certitude : la deviner en aval — « au-dessus de 5, donc sur
   * 10 » — se tromperait sur toute note basse d'une source sur 10.
   */
  ratingScale?: number
  reviewCount?: number

  amenities?: string[]

  images?: string[]

  availability?: boolean
  /** Plus précis que `availability` : distingue « indisponible » d'« inconnu ». */
  availabilityStatus: AvailabilityStatus
  priceConfidence: PriceConfidence

  /**
   * Identifiant d'offre réservable *dans* l'application, quand la source est un
   * distributeur et non un simple annuaire.
   *
   * Présent chez LiteAPI, absent partout ailleurs. Sa présence est ce qui
   * autorise l'interface à proposer « Réserver » plutôt que « Ouvrir le site » :
   * l'offre est identifiée, son prix est ferme, et la chaîne prebook → paiement
   * → book existe. Une offre sans `offerId` reste un lien, jamais un bouton de
   * réservation.
   */
  offerId?: string

  retrievedAt: string

  /** Charge utile d'origine, conservée pour réparer le mapper sans re-requête. */
  rawProviderData?: unknown
}

export interface AccommodationDetails extends Accommodation {
  description?: string
  houseRules?: string[]
  bathrooms?: number
}

export interface SearchParams {
  destination: string

  /**
   * Recherche géographique, préférée quand elle est disponible.
   *
   * C'est le point qui distingue cette application d'un comparateur ordinaire :
   * un domaine skiable n'est pas une ville. « Val Thorens » est administrativement
   * *Les Belleville*, et les logements des Menuires, de Saint-Martin ou de
   * Reberty se rattachent au même domaine sans partager de nom de commune. Une
   * recherche par chaîne de caractères en rate une partie et en ramène d'autres
   * situées à quarante minutes de route. Un cercle autour des coordonnées du
   * domaine décrit exactement ce qu'on cherche.
   *
   * Les connecteurs qui n'acceptent pas de coordonnées retombent sur
   * `destination`, et le déclarent dans leur diagnostic.
   */
  latitude?: number
  longitude?: number
  /** Rayon en mètres autour du point. Défaut du connecteur si absent. */
  radiusMeters?: number

  checkIn?: string
  checkOut?: string
  adults?: number
  children?: number
  infants?: number
  pets?: number
  minPrice?: number
  maxPrice?: number
  /** Libellé de type de bien, tel que l'entend la source. */
  propertyType?: string
  /** Curseur ou numéro de page, selon ce qu'accepte la source. */
  cursor?: string
  page?: number
  /**
   * Centrale de réservation de la station, quand l'appelant en connaît une.
   *
   * Les autres connecteurs cherchent une destination dans un catalogue mondial ;
   * celui-ci interroge *un* site, celui de la station. L'adresse ne peut donc
   * pas venir du connecteur : elle est propre au domaine choisi, et c'est le
   * renderer qui la tient (`data/stations.ts`). Voir `station/station.ts`.
   */
  officialUrl?: string
}

export interface DetailsParams {
  checkIn?: string
  checkOut?: string
  adults?: number
  children?: number
  infants?: number
  pets?: number
}

export interface AccommodationProvider {
  readonly name: string
  search(params: SearchParams): Promise<Accommodation[]>
  getDetails?(id: string, params?: DetailsParams): Promise<AccommodationDetails>
  /** Diagnostic affiché dans l'écran Sources : joignable, mal configuré, en panne. */
  health?(): Promise<ProviderHealth>
}

export interface ProviderHealth {
  name: string
  reachable: boolean
  detail: string
}

/**
 * Entrée d'agrégat sans prix : une porte vers la recherche d'une plateforme.
 *
 * Séparé d'`Accommodation` à dessein. Un `Accommodation` promet un logement
 * identifié ; une redirection ne promet qu'un lien. Les mélanger conduirait
 * tôt ou tard à trier par prix une carte qui n'en a pas, ou à l'afficher comme
 * une offre comparable — c'est exactement ce qu'on veut rendre impossible.
 */
export interface RedirectResult {
  kind: 'redirect'
  source: string
  label: string
  title: string
  url: string
  /** Pourquoi cette source n'a pas de prix. Affiché à l'utilisateur. */
  reason: string
}

/** Agrégat rendu à l'interface : les offres chiffrées d'un côté, les portes de l'autre. */
export interface AggregateResult {
  listings: Accommodation[]
  redirects: RedirectResult[]
  outcomes: ProviderOutcome[]
  totalListings: number
}

/** Résultat d'une recherche multi-sources : une erreur par source, jamais globale. */
export interface ProviderOutcome {
  provider: string
  results: Accommodation[]
  error: string | null
  elapsedMs: number
}

export function nowIso(): string {
  return new Date().toISOString()
}
