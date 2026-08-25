/**
 * Données de l'utilisateur : favoris, séjours en préparation, alertes de prix.
 *
 * **Point de bascule.** Tout ce qui appartient à la personne — et non à la
 * session, ni au catalogue — passe par ce module et par lui seul. Aujourd'hui
 * il écrit dans `localStorage` ; le jour où l'application se webise, seule
 * l'implémentation ci-dessous change, et aucun composant n'est touché. C'est la
 * raison d'être du fichier : sans lui, une dizaine d'écrans liraient le
 * stockage en direct et la bascule deviendrait une réécriture.
 *
 * **Pourquoi asynchrone alors que `localStorage` est synchrone.** Précisément
 * pour cela. Une API synchrone se laisse appeler pendant le rendu, et le jour
 * où la lecture part sur le réseau, chaque appelant est à reprendre. Le coût
 * d'une `Promise` déjà résolue est nul ; le coût de la conversion inverse ne
 * l'est pas.
 *
 * **Pourquoi ce n'est pas dans `appState`.** Les préférences y sont réécrites
 * en bloc à chaque frappe (`useEffect` sur `state`). Un favori n'est pas un
 * réglage d'écran : il a son propre cycle de vie, sa propre clé versionnée, et
 * il doit survivre à une remise à zéro des filtres. Les mélanger ferait aussi
 * partir les séjours enregistrés dans le prochain changement de schéma des
 * préférences — cinq migrations en attestent.
 *
 * **Ce qui est relu est vérifié.** Un stockage local n'est pas de confiance :
 * une extension, une session plus ancienne ou un import de séjour peuvent y
 * écrire n'importe quoi. Chaque entrée relue est validée champ par champ, et
 * une entrée qui ne passe pas est écartée — pas réparée. Réparer une donnée
 * qu'on ne comprend pas, c'est l'inventer.
 */

import type { PriceAlert } from '@/domain/priceAlerts'

/** Contrat minimal du support de stockage, pour pouvoir le remplacer. */
interface StorageBackend {
  read(key: string): string | null
  write(key: string, value: string): void
  remove(key: string): void
}

/**
 * Repli mémoire.
 *
 * `localStorage` n'existe pas sous Node : les tests de ce module tournent dans
 * `npm run userdata:test`, hors navigateur. Plutôt qu'un faux stockage monté
 * dans chaque test, le module retombe de lui-même sur une `Map`. En production
 * la branche n'est jamais prise.
 */
function memoryBackend(): StorageBackend {
  const mem = new Map<string, string>()
  return {
    read: (key) => mem.get(key) ?? null,
    write: (key, value) => void mem.set(key, value),
    remove: (key) => void mem.delete(key)
  }
}

function localStorageBackend(): StorageBackend | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return {
      read: (key) => localStorage.getItem(key),
      write: (key, value) => localStorage.setItem(key, value),
      remove: (key) => localStorage.removeItem(key)
    }
  } catch {
    // Stockage refusé (mode privé strict, quota, politique) : on ne bloque pas
    // l'application pour autant, la session reste utilisable sans persistance.
    return null
  }
}

let backend: StorageBackend = localStorageBackend() ?? memoryBackend()

/** Remplace le support de stockage. Réservé aux tests. */
export function __setBackendForTest(next: StorageBackend | null): void {
  backend = next ?? memoryBackend()
}

const FAVORITES_KEY = 'skitrack.favorites.v1'
const TRIPS_KEY = 'skitrack.trips.v1'
const ALERTS_KEY = 'skitrack.alerts.v1'

/**
 * Clés d'une version antérieure, relues une fois puis effacées.
 *
 * Vide aujourd'hui — les trois clés ci-dessus sont les premières. La table
 * existe pour que le prochain changement de version ait un endroit évident où
 * s'écrire, plutôt qu'une migration improvisée à côté du chargement.
 */
const LEGACY_KEYS: Record<string, readonly string[]> = {
  [FAVORITES_KEY]: [],
  [TRIPS_KEY]: [],
  [ALERTS_KEY]: []
}

export interface FavoriteStation {
  /** `Domain.id` du référentiel. */
  stationId: number
  addedAt: number
}

export interface TripDates {
  /** ISO `YYYY-MM-DD`. */
  from: string
  to: string
}

export interface TripParty {
  adults: number
  children: number
}

export interface TripBudget {
  max: number
  mode: 'total' | 'perso'
}

export interface SavedTrip {
  id: string
  label: string
  stationId: number
  dates: TripDates
  party: TripParty
  /**
   * `null` quand aucun plafond n'était posé au moment de l'enregistrement.
   * Absent veut dire absent : rouvrir le séjour ne doit pas poser un budget
   * que personne n'a choisi.
   */
  budget: TripBudget | null
  createdAt: number
  updatedAt: number
}

/** Ce qu'un appelant fournit ; l'identité et les horodatages sont posés ici. */
export type SavedTripInput = Omit<SavedTrip, 'id' | 'createdAt' | 'updatedAt'>

// --- Validation -----------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function int(v: unknown, min: number, max: number): number | null {
  const n = num(v)
  if (n == null) return null
  const i = Math.round(n)
  return i >= min && i <= max ? i : null
}

function str(v: unknown, maxLen: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length > 0 && s.length <= maxLen ? s : null
}

/** `YYYY-MM-DD` et rien d'autre — une date libre finirait dans une URL. */
function isoDate(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  // `2027-02-31` passe la regex mais pas le calendrier : `Date` le décale au
  // 3 mars. Comparer la reformulation écarte ces dates-là.
  return d.toISOString().slice(0, 10) === v ? v : null
}

function parseFavorite(raw: unknown): FavoriteStation | null {
  if (!isRecord(raw)) return null
  const stationId = int(raw.stationId, 0, Number.MAX_SAFE_INTEGER)
  if (stationId == null) return null
  const addedAt = num(raw.addedAt)
  return { stationId, addedAt: addedAt ?? 0 }
}

/**
 * Valide un séjour venu d'ailleurs.
 *
 * Exporté parce que l'import d'un séjour partagé (`.skitrip`, lien
 * `skitrack://`) passe par le même contrôle : un fichier reçu et une entrée de
 * stockage corrompue sont la même chose — une donnée qu'on n'a pas écrite.
 * Deux validateurs finiraient par diverger, et c'est le plus laxiste des deux
 * qui ferait loi.
 */
export function parseSavedTrip(raw: unknown): SavedTrip | null {
  if (!isRecord(raw)) return null

  const stationId = int(raw.stationId, 0, Number.MAX_SAFE_INTEGER)
  if (stationId == null) return null

  const label = str(raw.label, 120)
  if (label == null) return null

  if (!isRecord(raw.dates)) return null
  const from = isoDate(raw.dates.from)
  const to = isoDate(raw.dates.to)
  if (from == null || to == null || from > to) return null

  if (!isRecord(raw.party)) return null
  // Bornes larges mais finies : elles ne jugent pas du groupe, elles empêchent
  // un `adults: 1e9` de traverser jusqu'aux calculs de coût.
  const adults = int(raw.party.adults, 1, 99)
  const children = int(raw.party.children, 0, 99)
  if (adults == null || children == null) return null

  let budget: TripBudget | null = null
  if (isRecord(raw.budget)) {
    const max = int(raw.budget.max, 1, 10_000_000)
    const mode = raw.budget.mode === 'perso' ? 'perso' : raw.budget.mode === 'total' ? 'total' : null
    // Un budget à moitié lisible est écarté en entier : la moitié retenue
    // poserait un plafond dans la mauvaise unité.
    if (max != null && mode != null) budget = { max, mode }
  }

  const id = str(raw.id, 64) ?? newId()
  const createdAt = num(raw.createdAt) ?? 0
  const updatedAt = num(raw.updatedAt) ?? createdAt

  return { id, label, stationId, dates: { from, to }, party: { adults, children }, budget, createdAt, updatedAt }
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    /* pas de source d'aléa cryptographique : repli ci-dessous */
  }
  return `trip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// --- Lecture / écriture ---------------------------------------------------

/** Relit une clé versionnée, en reprenant une clé antérieure si besoin. */
function readList(key: string): unknown[] {
  const candidates = [key, ...(LEGACY_KEYS[key] ?? [])]
  for (const candidate of candidates) {
    let raw: string | null
    try {
      raw = backend.read(candidate)
    } catch {
      return []
    }
    if (raw == null) continue
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) continue
      // Une clé antérieure est recopiée sous la clé courante puis effacée : la
      // migration ne doit se payer qu'une fois.
      if (candidate !== key) {
        writeList(key, parsed)
        try {
          backend.remove(candidate)
        } catch {
          /* la clé restera, sans conséquence : la clé courante fait foi */
        }
      }
      return parsed
    } catch {
      // JSON illisible : on n'écrase pas, on ignore. Écraser ferait perdre
      // une donnée qu'un correctif ultérieur saurait peut-être relire.
      continue
    }
  }
  return []
}

function writeList(key: string, value: unknown[]): void {
  try {
    backend.write(key, JSON.stringify(value))
  } catch {
    /* quota dépassé : la session reste utilisable, la reprise est perdue */
  }
}

// --- Favoris --------------------------------------------------------------

export async function getFavorites(): Promise<FavoriteStation[]> {
  const out: FavoriteStation[] = []
  const seen = new Set<number>()
  for (const raw of readList(FAVORITES_KEY)) {
    const fav = parseFavorite(raw)
    if (!fav || seen.has(fav.stationId)) continue
    seen.add(fav.stationId)
    out.push(fav)
  }
  // Le plus récent d'abord : c'est l'ordre dans lequel on relit une liste
  // qu'on vient d'alimenter.
  return out.sort((a, b) => b.addedAt - a.addedAt)
}

/** Ajoute une station. Idempotent : réétoiler ne redate pas l'entrée. */
export async function addFavorite(stationId: number): Promise<FavoriteStation[]> {
  const current = await getFavorites()
  if (current.some((f) => f.stationId === stationId)) return current
  const next = [{ stationId, addedAt: Date.now() }, ...current]
  writeList(FAVORITES_KEY, next)
  return next
}

export async function removeFavorite(stationId: number): Promise<FavoriteStation[]> {
  const current = await getFavorites()
  const next = current.filter((f) => f.stationId !== stationId)
  if (next.length !== current.length) writeList(FAVORITES_KEY, next)
  return next
}

export async function toggleFavorite(stationId: number): Promise<FavoriteStation[]> {
  const current = await getFavorites()
  return current.some((f) => f.stationId === stationId) ? removeFavorite(stationId) : addFavorite(stationId)
}

// --- Séjours --------------------------------------------------------------

export async function getTrips(): Promise<SavedTrip[]> {
  const out: SavedTrip[] = []
  const seen = new Set<string>()
  for (const raw of readList(TRIPS_KEY)) {
    const trip = parseSavedTrip(raw)
    if (!trip || seen.has(trip.id)) continue
    seen.add(trip.id)
    out.push(trip)
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Enregistre un séjour.
 *
 * Deux séjours sur la même station aux mêmes dates sont le même séjour : le
 * second remplace le premier plutôt que de doubler la liste. C'est le geste
 * attendu quand on réenregistre après avoir changé le budget.
 */
export async function saveTrip(input: SavedTripInput): Promise<SavedTrip[]> {
  const validated = parseSavedTrip({ ...input, id: newId(), createdAt: Date.now(), updatedAt: Date.now() })
  if (!validated) return getTrips()

  const current = await getTrips()
  const twin = current.find(
    (t) =>
      t.stationId === validated.stationId &&
      t.dates.from === validated.dates.from &&
      t.dates.to === validated.dates.to
  )
  const merged: SavedTrip = twin
    ? { ...validated, id: twin.id, createdAt: twin.createdAt, updatedAt: Date.now() }
    : validated
  const next = [merged, ...current.filter((t) => t.id !== merged.id)]
  writeList(TRIPS_KEY, next)
  return next
}

/** Réinsère un séjour déjà constitué — import d'un fichier ou d'un lien. */
export async function importTrip(trip: SavedTrip): Promise<SavedTrip[]> {
  const current = await getTrips()
  const next = [{ ...trip, updatedAt: Date.now() }, ...current.filter((t) => t.id !== trip.id)]
  writeList(TRIPS_KEY, next)
  return next
}

export async function removeTrip(id: string): Promise<SavedTrip[]> {
  const current = await getTrips()
  const next = current.filter((t) => t.id !== id)
  if (next.length !== current.length) writeList(TRIPS_KEY, next)
  return next
}

// --- Alertes de prix ------------------------------------------------------

/**
 * Valide une alerte relue.
 *
 * `armed` est délibérément **repris tel quel** et non recalculé : c'est un cran
 * d'hystérésis, il porte l'histoire du prix depuis la dernière notification.
 * Le remettre à une valeur « raisonnable » au chargement ferait renotifier au
 * premier relevé suivant chaque redémarrage — précisément le spam que le cran
 * existe pour éviter. Absent d'une entrée ancienne, il retombe sur `false`,
 * qui est le choix silencieux.
 */
function parseAlert(raw: unknown): PriceAlert | null {
  if (!isRecord(raw)) return null
  const trackedKey = str(raw.trackedKey, 400)
  if (trackedKey == null) return null
  const threshold = int(raw.threshold, 1, 10_000_000)
  if (threshold == null) return null
  const mode = raw.mode === 'pp' ? 'pp' : raw.mode === 'total' ? 'total' : null
  if (mode == null) return null
  return {
    trackedKey,
    mode,
    threshold,
    active: raw.active !== false,
    armed: raw.armed === true,
    lastNotifiedAt: num(raw.lastNotifiedAt)
  }
}

export async function getAlerts(): Promise<PriceAlert[]> {
  const out: PriceAlert[] = []
  const seen = new Set<string>()
  for (const raw of readList(ALERTS_KEY)) {
    const alert = parseAlert(raw)
    if (!alert || seen.has(alert.trackedKey)) continue
    seen.add(alert.trackedKey)
    out.push(alert)
  }
  return out
}

/** Pose ou remplace l'alerte d'un élément suivi — une seule par élément. */
export async function putAlert(alert: PriceAlert): Promise<PriceAlert[]> {
  const current = await getAlerts()
  const next = [alert, ...current.filter((a) => a.trackedKey !== alert.trackedKey)]
  writeList(ALERTS_KEY, next)
  return next
}

/** Écrit un lot d'alertes d'un coup — sortie d'un tour d'évaluation. */
export async function putAlerts(alerts: readonly PriceAlert[]): Promise<PriceAlert[]> {
  const next = [...alerts]
  writeList(ALERTS_KEY, next)
  return next
}

export async function removeAlert(trackedKey: string): Promise<PriceAlert[]> {
  const current = await getAlerts()
  const next = current.filter((a) => a.trackedKey !== trackedKey)
  if (next.length !== current.length) writeList(ALERTS_KEY, next)
  return next
}

/**
 * Efface tout.
 *
 * Appelé par « purger les données locales » des mentions légales. Les clés
 * sont nommées ici plutôt que devinées par préfixe depuis l'écran : c'est ce
 * module qui sait ce qu'il a écrit.
 */
export async function clearUserData(): Promise<void> {
  for (const key of [FAVORITES_KEY, TRIPS_KEY, ALERTS_KEY]) {
    try {
      backend.remove(key)
    } catch {
      /* rien à purger */
    }
  }
}

/** Les clés possédées par ce module, pour les écrans qui purgent le stockage. */
export const USER_DATA_KEYS = [FAVORITES_KEY, TRIPS_KEY, ALERTS_KEY] as const
