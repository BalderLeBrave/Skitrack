/**
 * Import d'annonces en lot.
 *
 * Deux entrées, pour deux situations :
 *
 * - **une liste d'URL**, que l'application lit une par une avec les mêmes
 *   garde-fous que l'import unitaire (`robots.txt`, hôtes dont les CGU
 *   interdisent l'accès automatisé, User-Agent identifiant) ;
 * - **un fichier JSON** d'annonces déjà constituées, que l'application ingère
 *   sans faire la moindre requête.
 *
 * La seconde entrée est le point important. Elle permet d'alimenter SKITRACK
 * depuis n'importe quel outil extérieur — un export de comparateur, un tableur,
 * un agent — sans que l'application n'aille elle-même parcourir un site. Ce que
 * l'outil extérieur a le droit de faire relève de cet outil et de vous ;
 * l'application, elle, ne consomme qu'un fichier que vous lui fournissez.
 */

import type { Lodging } from './lodgings'

/** Forme attendue dans le fichier JSON. Seuls `name` et `total` sont requis. */
export interface RawListing {
  name: string
  /** Prix total du séjour, tout compris, en euros. */
  total: number
  rooms?: number
  capacity?: number
  /** Distance aux pistes à pied, en mètres. */
  dist?: number
  type?: string
  source?: string
  url?: string
  image?: string
  note?: string
  reviews?: number
  cancellable?: boolean
  /** Altitude du logement, en mètres. */
  alt?: number
  /** Coordonnées, quand la source les fournit (bloc de données Airbnb, LiteAPI). */
  lat?: number
  lon?: number
  /** 'exact' ou 'approximate' : précision de la position. */
  locPrecision?: 'exact' | 'approximate'
}

export interface BulkResult {
  lodgings: Lodging[]
  errors: string[]
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^\d.,-]/g, '').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export interface BulkContext {
  /** Premier identifiant libre, pour ne pas écraser les imports précédents. */
  firstId: number
  nights: number
  /** Altitude de repli quand l'annonce ne la donne pas. */
  fallbackAlt: number
}

/**
 * Convertit une entrée brute en offre exploitable. Les champs absents prennent
 * une valeur neutre plutôt qu'une valeur plausible : une note inventée ou une
 * distance aux pistes devinée fausserait le tri et le comparateur.
 */
export function toLodging(raw: RawListing, index: number, ctx: BulkContext): Lodging | string {
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const total = asNumber(raw.total)
  if (!name) return `Ligne ${index + 1} : champ « name » manquant.`
  if (total == null || total <= 0) return `« ${name} » : champ « total » manquant ou invalide.`

  const capacity = Math.max(1, Math.round(asNumber(raw.capacity) ?? 1))
  const dist = Math.max(0, Math.round(asNumber(raw.dist) ?? 0))

  return {
    id: ctx.firstId + index,
    name,
    type: typeof raw.type === 'string' && raw.type.trim() ? raw.type.trim() : 'Import',
    pers: capacity,
    ch: Math.max(1, Math.round(asNumber(raw.rooms) ?? 1)),
    m2: null,
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : '—',
    avis: Math.max(0, Math.round(asNumber(raw.reviews) ?? 0)),
    dist,
    walk: Math.max(1, Math.round(dist / 80)),
    den: 0,
    skiIn: dist > 0 && dist <= 100,
    src: `Import manuel · ${raw.source ?? 'fichier'}`,
    pp: Math.round((total / (capacity * ctx.nights)) * 2) / 2,
    total: Math.round(total),
    annul: raw.cancellable === true,
    lift: 'non renseigné',
    liftDist: dist,
    alt: Math.round(asNumber(raw.alt) ?? ctx.fallbackAlt),
    stock: 1,
    url: typeof raw.url === 'string' ? raw.url : undefined,
    image: typeof raw.image === 'string' ? raw.image : null,
    photo: name
  }
}

/** Analyse un fichier JSON d'annonces. Accepte un tableau ou `{ "lodgings": [] }`. */
export function parseListingsJson(text: string, ctx: BulkContext): BulkResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { lodgings: [], errors: [`JSON illisible : ${err instanceof Error ? err.message : String(err)}`] }
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { lodgings?: unknown })?.lodgings)
      ? ((parsed as { lodgings: unknown[] }).lodgings)
      : null

  if (!rows) {
    return { lodgings: [], errors: ['Le fichier doit contenir un tableau d’annonces, ou un objet { "lodgings": [ … ] }.'] }
  }

  const lodgings: Lodging[] = []
  const errors: string[] = []
  rows.forEach((row, i) => {
    const result = toLodging(row as RawListing, lodgings.length, ctx)
    if (typeof result === 'string') errors.push(result.replace(`Ligne ${lodgings.length + 1}`, `Ligne ${i + 1}`))
    else lodgings.push(result)
  })
  return { lodgings, errors }
}

/** Découpe un collage d'URL : une par ligne, lignes vides et doublons ignorés. */
export function parseUrlList(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const url = line.trim()
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

/** Exemple affiché dans l'interface, qui sert aussi de documentation du format. */
export const JSON_EXAMPLE = `[
  {
    "name": "Chalet des Cimes",
    "total": 4480,
    "rooms": 4,
    "capacity": 8,
    "dist": 320,
    "type": "Chalet",
    "source": "Airbnb",
    "url": "https://www.airbnb.fr/rooms/48213977",
    "image": "https://…/photo.jpg",
    "note": "4,8",
    "reviews": 57,
    "cancellable": true
  }
]`
