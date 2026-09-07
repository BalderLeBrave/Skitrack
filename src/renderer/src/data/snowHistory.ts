/**
 * Historique de neige, relevé par l'application elle-même.
 *
 * ## La question, et ce qu'on peut honnêtement en faire
 *
 * « Quel est l'historique de neige de cette station ? » est une des premières
 * questions d'un vacancier. SKITRACK n'a **aucune** base historique : Open-Meteo
 * rend l'instant et sept jours de prévision, pas le passé. Inventer une
 * climatologie — moyennes plausibles, « en général en février… » — est
 * exactement ce que le projet s'interdit.
 *
 * Ce module fait donc ce que fait déjà le suivi de prix : il **enregistre ce
 * que l'application relève**, un point par jour et par domaine, sur cette
 * machine. L'historique commence le jour de l'installation et l'écran le dit —
 * « relevé par SKITRACK depuis le {date} ». Rien avant, rien d'importé, rien
 * de comblé.
 *
 * ## Forme et limites
 *
 * `localStorage`, une entrée par domaine, un point par jour calendaire (le
 * premier relevé du jour gagne — c'est celui du matin qui décrit la journée de
 * ski). Plafond par domaine : une saison entière tient largement. Les hauteurs
 * sont celles d'Open-Meteo au bas et au haut des pistes, en centimètres,
 * `null` quand le service ne les rend pas — un jour sans relevé est un trou
 * assumé, pas un zéro.
 */

export interface SnowPoint {
  /** Jour calendaire, AAAA-MM-JJ. */
  day: string
  /** Hauteur au bas des pistes, en cm. `null` = non rendue ce jour-là. */
  bas: number | null
  /** Hauteur au point culminant, en cm. */
  haut: number | null
}

export interface SnowSeries {
  points: SnowPoint[]
}

const KEY = 'skitrack-v1-snow-history'
/** ~2 saisons par domaine : au-delà, les points les plus anciens partent. */
const MAX_POINTS = 400
/** Domaines suivis au maximum : ceux que l'utilisateur consulte réellement. */
const MAX_DOMAINS = 120

type Store = Record<string, SnowSeries>

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Store) : {}
  } catch {
    return {}
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* stockage plein : l'historique s'arrête, il ne casse rien */
  }
}

function today(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Enregistre les relevés du jour.
 *
 * Appelée par le fournisseur météo après chaque relevé **abouti** — jamais sur
 * un cache relu, dont les valeurs peuvent dater : `fetchedAt` fait foi, un
 * relevé plus vieux que ce matin n'écrit rien.
 */
export function recordSnow(
  readings: { domainId: number; bas: number | null; haut: number | null; fetchedAt: number }[]
): void {
  if (readings.length === 0) return
  const day = today()
  const startOfDay = new Date(`${day}T00:00:00`).getTime()
  const store = read()
  let changed = false

  for (const r of readings) {
    if (r.fetchedAt < startOfDay) continue
    if (r.bas == null && r.haut == null) continue
    const key = String(r.domainId)
    const series = store[key] ?? { points: [] }
    // Un point par jour : le premier relevé décrit la journée, les suivants
    // (tic de 30 min, retour de fenêtre) ne réécrivent pas l'histoire.
    if (series.points.some((p) => p.day === day)) continue
    series.points.push({ day, bas: r.bas, haut: r.haut })
    if (series.points.length > MAX_POINTS) series.points = series.points.slice(-MAX_POINTS)
    store[key] = series
    changed = true
  }

  // Le plafond de domaines écarte les moins suivis (les séries les plus
  // courtes) : celui qu'on consulte tous les jours reste.
  const keys = Object.keys(store)
  if (keys.length > MAX_DOMAINS) {
    keys
      .sort((a, b) => store[a].points.length - store[b].points.length)
      .slice(0, keys.length - MAX_DOMAINS)
      .forEach((k) => delete store[k])
    changed = true
  }

  if (changed) write(store)
}

/** Série d'un domaine, du plus ancien au plus récent. Vide = rien d'enregistré. */
export function snowHistoryOf(domainId: number): SnowPoint[] {
  return read()[String(domainId)]?.points ?? []
}
