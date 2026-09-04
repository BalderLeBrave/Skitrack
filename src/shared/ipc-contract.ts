/**
 * Contrat IPC partagé entre le main Electron et le renderer.
 *
 * Un seul endroit pour les noms de canaux et les types de charge utile : une
 * faute de frappe dans un `invoke` devient une erreur de compilation plutôt
 * qu'une promesse qui ne se résout jamais.
 */

export const IPC = {
  sidecarInfo: 'sidecar:info',
  sidecarRestart: 'sidecar:restart',
  secretsList: 'secrets:list',
  secretsSet: 'secrets:set',
  secretsDelete: 'secrets:delete',
  secretsPush: 'secrets:push',
  openExternal: 'shell:openExternal',
  appInfo: 'app:info',
  listingFetch: 'listing:fetch',
  providersSearch: 'providers:search',
  /** Événement push : une source vient de répondre (pendant `providers:search`). */
  providersOutcome: 'providers:outcome',
  providersHealth: 'providers:health',
  providersMetrics: 'providers:metrics',
  providersMetricsReset: 'providers:metrics-reset',
  osmLodgings: 'osm:lodgings',
  clipboardRead: 'clipboard:read',
  pasteToken: 'paste:token',
  /** Bulletin d'avalanche Météo-France (API DPBRA). */
  braFetch: 'bra:fetch',
  routeCost: 'route:cost',
  reportPdf: 'report:pdf',
  /** Scraping Airbnb via Puppeteer (navigateur invisible). */
  airbnbScrape: 'airbnb:scrape',
  /** Notes et votes de la sélection, rangés en base par le processus principal. */
  selectionLoad: 'selection:load',
  selectionApply: 'selection:apply'
} as const

/* ----------------------------------------------------- sélection partagée */

export type SelectionKind = 'domain' | 'lodging'

/** Une note du fil, telle que `selection_notes` la stocke. */
export interface SelectionNoteRow {
  id: number
  kind: SelectionKind
  targetId: number
  /** `Person.id` de l'auteur. `-1` quand aucun voyageur n'est renseigné. */
  authorId: number
  /** ISO 8601 en UTC. */
  createdAt: string
  body: string
}

/**
 * Un vote exprimé, tel que `selection_votes` le stocke.
 *
 * `voterId` est l'identifiant de la personne, pas son rang dans la liste des
 * voyageurs : retirer quelqu'un ne réattribue plus les votes des suivants.
 */
export interface SelectionVoteRow {
  kind: SelectionKind
  targetId: number
  voterId: number
  /** `1` pour, `-1` contre. Le `0` n'est jamais stocké : il efface la ligne. */
  value: 1 | -1
}

/** L'état complet du magasin, rendu après chargement comme après mutation. */
export interface SelectionSnapshot {
  notes: SelectionNoteRow[]
  votes: SelectionVoteRow[]
  /** La reprise depuis `localStorage` a-t-elle déjà eu lieu ? */
  legacyImported: boolean
}

/**
 * Une mutation du magasin.
 *
 * Union discriminée plutôt qu'un canal par opération : le contrat reste à deux
 * canaux, l'écriture reste ciblée, et un nouveau type de mutation s'ajoute
 * sans toucher à la table des canaux.
 */
export type SelectionMutation =
  | { type: 'note-add'; kind: SelectionKind; targetId: number; authorId: number; body: string }
  | { type: 'note-remove'; id: number }
  | { type: 'vote-set'; kind: SelectionKind; targetId: number; voterId: number; value: 1 | -1 | 0 }
  | {
      type: 'import-legacy'
      notes: Omit<SelectionNoteRow, 'id'>[]
      votes: SelectionVoteRow[]
    }

/** Paramètres d'une recherche Airbnb automatisée. */
export interface AirbnbScrapeParams {
  city: string
  /**
   * Emprise de recherche, en degrés. Ajout **facultatif** : une requête qui ne
   * la porte pas se comporte exactement comme avant.
   *
   * Quand elle est là, Airbnb cherche dans le rectangle au lieu de géocoder le
   * nom. C'est la correction du cas « Arc 2000 rend Arcachon » : le rectangle
   * est celui que le filtre de zone appliquera ensuite, si bien que la question
   * posée et le contrôle exercé portent sur la même surface.
   */
  bounds?: { north: number; south: number; east: number; west: number } | null
  checkIn?: string
  checkOut?: string
  adults?: number
  children?: number
  infants?: number
  pets?: number
  minPrice?: number
  maxPrice?: number
  bedrooms?: number
  /** Scrolls / pages Airbnb (défaut SEARCH_WALK.airbnbMaxScrolls). Booking Playwright = SEARCH_WALK.maxPages (15). */
  scrollCount?: number
  /** Tentatives max avec backoff exponentiel (défaut 3). */
  maxRetries?: number
  /** Timeout Playwright par tentative (ms). */
  timeoutMs?: number
}

/** Résultat d'un scrape Airbnb (payload identique au marque-page). */
export interface AirbnbScrapeResult {
  ok: true
  /** JSON string du payload { source, checkIn, checkOut, listings }, prêt pour parseAirbnbClipboard. */
  payloadJson: string
  count: number
  url: string
  /** true si un CAPTCHA a été résolu manuellement pendant le scrape. */
  captchaSolved?: boolean
  /** true si repli visible à cause d’un soft-block reCAPTCHA v3. */
  recaptchaV3Fallback?: boolean
  /** Tentative réussie (1-based). */
  attempts?: number
  /** `omkar` = HTTP JSON (pas de navigateur). */
  via?: 'omkar' | 'playwright'
  pagesFetched?: number
  advertised?: number | null
}


export interface AirbnbScrapeError {
  ok: false
  error: string
  url?: string
  attempts?: number
}

export type AirbnbScrapeOutcome = AirbnbScrapeResult | AirbnbScrapeError

/** État du sidecar tel que vu par le shell. */
export type SidecarState =
  | { status: 'starting' }
  | { status: 'ready'; baseUrl: string; token: string; port: number; pid: number; version: string }
  | { status: 'error'; message: string; hint?: string }
  | { status: 'stopped' }

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  userDataPath: string
  platform: string
  encryptionAvailable: boolean
}

/**
 * Clés d'API gérées par le coffre. Le renderer ne voit jamais les valeurs :
 * il ne manipule que ces noms et un booléen « renseignée ».
 */
export const SECRET_KEYS = [
  'openrouteservice',
  'google_maps',
  'liteapi_key',
  'expedia_rapid_key',
  'expedia_rapid_secret',
  'booking_demand',
  'omkar_airbnb',
  'brightdata_browser',
  'meteofrance',
  'scrape_proxy',
  'scrape_proxy_mobile'
] as const

export type SecretKey = (typeof SECRET_KEYS)[number]

export interface SecretPresence {
  key: SecretKey
  present: boolean
}

/**
 * Bulletin d'estimation du risque d'avalanche, tel que le renderer le reçoit.
 *
 * `risk` est le niveau de l'échelle européenne, de 1 à 5, ou `null` : hors
 * saison le bulletin n'est pas publié et Météo-France renvoie un message
 * d'attente. Un bulletin absent n'est jamais un risque nul — d'où le `null`
 * explicite et le `message` qui l'accompagne.
 */
export interface BraBulletin {
  ok: boolean
  /** Code du massif Météo-France interrogé. */
  massifCode: number
  risk: number | null
  /** Risques par tranche d'altitude, quand le bulletin les distingue. */
  risk1: number | null
  risk2: number | null
  /** Libellés de localisation des deux tranches, tels qu'écrits au bulletin. */
  loc1: string | null
  loc2: string | null
  /** Altitude de bascule entre les deux tranches, en mètres. */
  altitude: number | null
  /** Date d'émission du bulletin, ISO. */
  issuedAt: string | null
  /** Message de la source : fin de saison, erreur, ou résumé. */
  message: string | null
  error: string | null
}

/**
 * Coût de route relevé sur ViaMichelin, pour un trajet aller.
 *
 * ## Ce que c'est, et ce que ce n'est pas
 *
 * L'application chiffrait la route avec deux constantes — 0,115 €/km de
 * carburant, 0,058 €/km de péages — appliquées à une distance elle-même
 * estimée. Deux forfaits multipliés par une estimation, présentés comme un
 * poste de budget. ViaMichelin publie, lui, un coût de péage réel section par
 * section et une consommation par véhicule.
 *
 * ViaMichelin **n'a pas d'API publique** : ces montants ne sont accessibles que
 * par sa page web. Ce relevé lit donc une page de résultat, comme le fait déjà
 * l'import d'annonce par URL. Le choix a été posé à l'utilisateur avec ses deux
 * inconvénients — il cesse de fonctionner au premier changement de leur HTML,
 * et il sort du cadre que le projet s'était fixé sur les sites tiers — et
 * retenu par lui le 2026-08-29.
 *
 * Conséquence à tenir : un relevé en échec ne produit **jamais** de repli
 * chiffré. `ok: false` et un motif ; le formulaire de saisie reste la voie
 * normale, et les constantes restent l'estimation annoncée comme telle.
 */
export interface RouteCostQuery {
  fromLat: number
  fromLon: number
  toLat: number
  toLon: number
  /** Prix du litre saisi par l'utilisateur, pour que le relevé s'y aligne. */
  fuelPricePerL?: number
  /** Éviter les péages : change l'itinéraire relevé, pas seulement son coût. */
  avoidTolls?: boolean
}

export interface RouteCostResult {
  ok: true
  /** Péages de l'aller, en euros. `null` si la page ne les publie pas. */
  tolls: number | null
  /** Carburant de l'aller, en euros. `null` si la page ne le publie pas. */
  fuel: number | null
  /** Distance de l'itinéraire relevé, en kilomètres. */
  distanceKm: number | null
  /** Durée de l'itinéraire relevé, en minutes. */
  durationMin: number | null
  /** Horodatage du relevé, pour que l'écran puisse le dater. */
  at: number
  /** URL de la page relevée, à ouvrir pour vérifier. */
  url: string
}

export interface RouteCostError {
  ok: false
  /** Motif lisible. Jamais de montant de repli : voir l'en-tête. */
  error: string
  url: string
}

export type RouteCostOutcome = RouteCostResult | RouteCostError

/**
 * Export PDF du récapitulatif de séjour.
 *
 * Le renderer bascule dans sa vue d'impression, appelle ce canal, et le
 * processus principal transforme la page en PDF avec `webContents.printToPDF` —
 * l'imprimante de Chromium, déjà embarquée. Aucune bibliothèque ajoutée, donc
 * aucun poids de paquet supplémentaire, et la mise en page est exactement celle
 * que la feuille de style d'impression décrit.
 *
 * Le chemin de sortie est choisi par l'utilisateur dans une boîte de dialogue
 * système : l'application n'écrit jamais un fichier là où personne ne l'a
 * demandé.
 */
export interface ReportPdfParams {
  /** Nom de fichier proposé, sans extension. */
  suggestedName: string
}

export interface ReportPdfResult {
  ok: boolean
  /** Chemin écrit, `null` si l'utilisateur a annulé ou si l'écriture a échoué. */
  path: string | null
  /** `true` quand l'utilisateur a fermé la boîte de dialogue. */
  cancelled: boolean
  error: string | null
}

/**
 * Résultat de la lecture d'une annonce de logement.
 *
 * Le renderer ne reçoit que ces champs : le HTML tiers est analysé côté main et
 * n'est jamais transmis, encore moins exécuté.
 */
export interface ListingExtract {
  ok: boolean
  /** Renseigné quand l'hôte interdit la lecture automatisée. */
  blockedReason: string | null
  url: string
  site: string
  title: string | null
  description: string | null
  images: string[]
  price: number | null
  currency: string | null
  lat: number | null
  lon: number | null
  rooms: number | null
  capacity: number | null
  address: string | null
  /** Champs que la page n'exposait pas et qu'il faudra saisir à la main. */
  missing: string[]
}

/**
 * Paramètres d'une recherche d'hébergements OpenStreetMap.
 *
 * L'emprise (`south`/`west`/`north`/`east`) vient de la boîte englobante du
 * domaine ; le libellé et les dates servent à pré-remplir la recherche Airbnb.
 */
export interface OsmLodgingQuery {
  south: number
  west: number
  north: number
  east: number
  destination: string
  checkIn?: string
  checkOut?: string
  adults?: number
  children?: number
}

/** Un hébergement réel, cartographié dans OSM, sans prix. */
export interface OsmLodgingResult {
  name: string
  type: string
  lat: number
  lon: number
  url: string
  website?: string
  image?: string
  stars?: number
  source: 'OpenStreetMap'
}

/* ——— Comparateur multi-sources (`providers:search`) ———
 *
 * Miroir réduit des types de `src/main/providers/types.ts`, limité à ce que le
 * renderer consomme réellement. La duplication est assumée : le renderer et le
 * processus principal ne partagent pas de tsconfig, et `providers/types.ts` est
 * la source de vérité — ces déclarations la suivent, elles ne la remplacent pas.
 */

export interface ProviderSearchParams {
  destination: string
  /** Recherche par cercle, préférée : un domaine skiable n'est pas une commune. */
  latitude?: number
  longitude?: number
  radiusMeters?: number
  checkIn?: string
  checkOut?: string
  adults?: number
  children?: number
  /**
   * Nombre de chambres demandé, quand l'utilisateur en pose un.
   *
   * Le critère existait à l'écran depuis toujours mais **ne quittait jamais le
   * renderer** : `runProviderSearch` ne le transmettait pas, et aucun connecteur
   * ne le recevait. Il n'était donc appliqué qu'après coup, sur ce que les
   * sources avaient bien voulu rapporter — et ni Airbnb ni Booking ne publient
   * le nombre de chambres dans leurs résultats. Conséquence mesurée le
   * 2026-08-30 : demander quatre chambres ne filtrait rien du tout, et les
   * annonces concernées ressortaient toutes « capacité non annoncée ».
   *
   * Les connecteurs qui savent filtrer là-dessus le font (`min_bedrooms` chez
   * Airbnb, qui l'accepte déjà dans `buildAirbnbSearchUrl`). Les autres
   * l'ignorent, comme ils ignorent déjà ce qu'ils ne savent pas traduire.
   */
  bedrooms?: number
  /** Centrale de réservation de la station, pour le connecteur `station-web`. */
  officialUrl?: string
}

/** Une offre au modèle pivot. Tout est optionnel sauf ce qui est vérifiable. */
export interface ProviderAccommodation {
  source: string
  sourceId: string
  title: string
  url: string
  latitude?: number
  longitude?: number
  guests?: number
  bedrooms?: number
  /**
   * Nombre de **pièces**, quand la source compte ainsi.
   *
   * Les centrales de station publient des « 2 pièces 4 personnes » et
   * n'annoncent jamais de chambres : c'est la mesure française de la location
   * de montagne. Les deux champs cohabitent donc, et celui que la source n'a
   * pas reste vide — traduire l'un en l'autre serait une convention d'annonce,
   * pas une donnée relevée.
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
  /** Gîtes : « À partir de N € /semaine », pas le séjour. */
  weeklyPrice?: number
  totalPrice?: number
  currency?: string
  rating?: number
  /**
   * Échelle de `rating`, quand ce n'est pas 5.
   *
   * Booking note **sur 10** (« 8,2 »), Airbnb sur 5. Sans cette déclaration, la
   * valeur brute traversait le contrat et s'affichait derrière une étoile sur 5.
   *
   * Optionnel et rétrocompatible : absent, il vaut 5 — ce que supposaient déjà
   * tous les relevés enregistrés avant ce champ, qui restent donc lus
   * correctement. L'échelle est déclarée par le connecteur, seul endroit où
   * elle est connue de source sûre.
   */
  ratingScale?: number
  reviewCount?: number
  images?: string[]
  /** Libellé de type publié (tuile Gîtes « Gîte » / « Gîte de groupe »). */
  propertyType?: string
  availabilityStatus: 'available' | 'unavailable' | 'unknown' | 'listing_gone'
  priceConfidence: 'total_confirmed' | 'partial' | 'unknown'
  /** Dates du séjour pour lesquelles le prix a été relevé (AAAA-MM-JJ). */
  checkIn?: string
  checkOut?: string
  searchPageIndex?: number
  searchRank?: number
}

/** Une erreur par source, jamais globale : une panne n'en vide pas d'autres. */
export interface ProviderOutcome {
  provider: string
  results: ProviderAccommodation[]
  error: string | null
  elapsedMs: number
  reasonCode?: import('./reasonCodes').ReasonCode
  pagination?: import('./reasonCodes').PaginationReport
}

export interface ProviderAggregate {
  listings: ProviderAccommodation[]
  outcomes: ProviderOutcome[]
  totalListings: number
}
