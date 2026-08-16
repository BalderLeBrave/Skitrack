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
  providersHealth: 'providers:health',
  osmLodgings: 'osm:lodgings',
  clipboardRead: 'clipboard:read',
  pasteToken: 'paste:token',
  /** Bulletin d'avalanche Météo-France (API DPBRA). */
  braFetch: 'bra:fetch',
  /** Scraping Airbnb via Puppeteer (navigateur invisible). */
  airbnbScrape: 'airbnb:scrape'
} as const

/** Paramètres d'une recherche Airbnb automatisée. */
export interface AirbnbScrapeParams {
  city: string
  checkIn?: string
  checkOut?: string
  adults?: number
  children?: number
  infants?: number
  pets?: number
  minPrice?: number
  maxPrice?: number
  bedrooms?: number
  /** Nombre de scrolls pour charger plus de résultats (défaut 2). */
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
  nightlyPrice?: number
  totalPrice?: number
  currency?: string
  rating?: number
  reviewCount?: number
  images?: string[]
  availabilityStatus: 'available' | 'unavailable' | 'unknown'
  priceConfidence: 'total_confirmed' | 'partial' | 'unknown'
}

/** Une erreur par source, jamais globale : une panne n'en vide pas d'autres. */
export interface ProviderOutcome {
  provider: string
  results: ProviderAccommodation[]
  error: string | null
  elapsedMs: number
}

export interface ProviderAggregate {
  listings: ProviderAccommodation[]
  outcomes: ProviderOutcome[]
  totalListings: number
}
