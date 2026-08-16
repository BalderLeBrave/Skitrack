/**
 * Trajets en voiture.
 *
 * Deux régimes coexistent volontairement. Tant qu'aucun itinéraire n'a été
 * calculé, la durée affichée est une **estimation** dérivée de la distance à
 * vol d'oiseau, corrigée d'un facteur de sinuosité routière. Dès que
 * l'utilisateur lance le calcul, les vrais itinéraires remplacent l'estimation
 * et sont stockés — rien n'est recalculé à l'affichage, sinon chaque mouvement
 * de curseur déclencherait une rafale de requêtes sur 277 domaines.
 *
 * L'écran indique toujours lequel des deux régimes est en vigueur : une durée
 * estimée présentée comme un temps réel serait une information trompeuse au
 * moment de choisir.
 */

import type { Domain } from '@/data/referentiel'
import { hasCoords } from '@/data/referentiel'

export interface Place {
  id: number
  label: string
  addr: string
  cp: string
  city: string
  /** `null` tant que l'adresse n'a pas été géocodée. */
  lat: number | null
  lon: number | null
  /** Identifiant du départ correspondant dans la base du moteur local. */
  originId?: number
}

/** Un départ tel qu'il est présenté dans l'interface. */
export interface Origin extends Place {
  short: string
  fullLabel: string
}

export interface Route {
  dur: number
  dist: number
  at: number
}

export type RouteTable = Record<string, Route>

export const ROUTES_STORAGE_KEY = 'skitrack-v3-routes'

/** Rapport entre distance routière et distance à vol d'oiseau, en montagne. */
const DETOUR_FACTOR = 1.32
/** Vitesse moyenne porte-à-porte, autoroute et fond de vallée mêlés. */
const AVG_SPEED_KMH = 76
/** Approche finale, péages, arrêts : incompressible quel que soit le trajet. */
const FIXED_OVERHEAD_MIN = 20

export function originsOf(places: Place[]): Origin[] {
  return places.map((p) => ({
    ...p,
    short: p.label,
    fullLabel: [p.label, [p.addr, [p.cp, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')]
      .filter(Boolean)
      .join(' — ')
  }))
}

export function hasCoordinates(o: Place): boolean {
  return o.lat != null && o.lon != null
}

/** Distance orthodromique en kilomètres. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371
  const toRad = (d: number): number => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export interface Travel {
  dur: number | null
  dist: number | null
  /** `false` quand la valeur est une estimation et non un itinéraire calculé. */
  real: boolean
}

const UNKNOWN: Travel = { dur: null, dist: null, real: false }

export function travelOf(domain: Domain, origin: Origin, routes: RouteTable): Travel {
  const r = routes[`${origin.id}:${domain.id}`]
  if (r) return { dur: r.dur, dist: r.dist, real: true }
  // Sans adresse de départ géocodée, il n'y a pas de trajet à estimer — mieux
  // vaut ne rien afficher qu'un chiffre inventé.
  if (origin.lat == null || origin.lon == null) return UNKNOWN
  // Même règle pour le domaine : une partie du référentiel n'a pas de
  // coordonnées, et une distance calculée sur un `null` donnerait `NaN km`.
  if (!hasCoords(domain)) return UNKNOWN

  const crow = haversineKm(origin.lat, origin.lon, domain.lat, domain.lon)
  const dist = Math.round((crow * DETOUR_FACTOR) / 5) * 5
  return {
    dur: Math.round(((dist / AVG_SPEED_KMH) * 60 + FIXED_OVERHEAD_MIN) / 5) * 5,
    dist,
    real: false
  }
}

/**
 * Le trajet retenu pour filtrer et trier est celui du foyer le plus éloigné :
 * c'est lui qui contraint le départ du groupe. `null` si aucun foyer n'a
 * d'adresse.
 */
export function worstTravel(domain: Domain, origins: Origin[], routes: RouteTable): number | null {
  const values = origins
    .map((o) => travelOf(domain, o, routes).dur)
    .filter((v): v is number => v != null)
  return values.length ? Math.max(...values) : null
}

export function worstDistance(domain: Domain, origins: Origin[], routes: RouteTable): number | null {
  const values = origins
    .map((o) => travelOf(domain, o, routes).dist)
    .filter((v): v is number => v != null)
  return values.length ? Math.max(...values) : null
}

export function routesCoverage(
  origins: Origin[],
  domains: Domain[],
  routes: RouteTable
): { done: number; total: number } {
  // Le total ne compte que les domaines calculables : sinon la couverture
  // plafonnerait sous 100 % et l'écran réclamerait indéfiniment un calcul.
  const located = origins.filter(hasCoordinates)
  const placed = domains.filter(hasCoords)
  let done = 0
  for (const o of located) {
    for (const d of placed) if (routes[`${o.id}:${d.id}`]) done++
  }
  return { done, total: located.length * placed.length }
}

export function loadRoutes(): RouteTable {
  try {
    const raw = localStorage.getItem(ROUTES_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as RouteTable) : {}
  } catch {
    return {}
  }
}

export function saveRoutes(routes: RouteTable): void {
  try {
    localStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify(routes))
  } catch {
    /* quota dépassé : les itinéraires restent en mémoire pour la session */
  }
}

export function clearRoutes(): void {
  try {
    localStorage.removeItem(ROUTES_STORAGE_KEY)
  } catch {
    /* sans effet */
  }
}

interface OsrmTable {
  code: string
  durations: (number | null)[][]
  distances: (number | null)[][]
}

/** Le service public OSRM refuse les matrices trop larges : on découpe. */
const OSRM_BATCH = 80

/**
 * Calcul en masse via le service public OSRM : une requête « table » par lot de
 * destinations et par départ. Un lot qui échoue n'annule pas les autres — on
 * garde l'estimation pour celui-là et on le signale.
 */
export async function computeRoutes(
  origins: Origin[],
  domains: Domain[],
  previous: RouteTable,
  onProgress: (message: string) => void
): Promise<{ routes: RouteTable; failed: number }> {
  const routes: RouteTable = { ...previous }
  const located = origins.filter(hasCoordinates)
  let failed = 0

  // Comme pour la météo, un domaine sans position décalerait toute la matrice
  // OSRM : les durées seraient attribuées aux mauvais domaines.
  const placed = domains.filter(hasCoords)
  const batches: Domain[][] = []
  for (let i = 0; i < placed.length; i += OSRM_BATCH) batches.push(placed.slice(i, i + OSRM_BATCH))

  for (let i = 0; i < located.length; i++) {
    const o = located[i]
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b]
      onProgress(
        `Itinéraires depuis ${o.short} — lot ${b + 1}/${batches.length} (départ ${i + 1}/${located.length})`
      )
      try {
        const coords = batch.map((d) => `${d.lon},${d.lat}`).join(';')
        const url =
          `https://router.project-osrm.org/table/v1/driving/${o.lon},${o.lat};${coords}` +
          '?sources=0&annotations=duration,distance'
        const res = await fetch(url)
        const json = (await res.json()) as OsrmTable
        if (json.code !== 'Ok') throw new Error(json.code)
        batch.forEach((d, k) => {
          const seconds = json.durations?.[0]?.[k + 1]
          const metres = json.distances?.[0]?.[k + 1]
          if (seconds == null || metres == null) return
          routes[`${o.id}:${d.id}`] = {
            dur: Math.round(seconds / 60),
            dist: Math.round(metres / 1000),
            at: Date.now()
          }
        })
      } catch {
        failed++
      }
    }
  }

  saveRoutes(routes)
  return { routes, failed }
}
