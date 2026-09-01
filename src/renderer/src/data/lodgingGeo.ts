/**
 * Vraisemblance des positions de logements.
 *
 * Aucune plateforme ne publie l'adresse exacte d'un bien avant réservation :
 * les positions sont soit floutées, soit absentes. L'application place alors
 * l'annonce autour du front de neige, de façon déterministe — et c'est
 * précisément là que le mensonge commence, parce qu'une épingle posée sur une
 * carte a l'air d'une mesure.
 *
 * Ce module vérifie donc ce qu'il peut vérifier : l'altitude du point (modèle
 * d'élévation Open-Meteo), sa présence sur un plan d'eau et l'existence d'un
 * bâtiment à moins de 180 m (OpenStreetMap). Un point 400 m au-dessus de la
 * station est en pleine montagne, un point au milieu d'un lac n'est pas un
 * chalet. Les positions estimées manifestement fausses sont resserrées vers la
 * station, et ce qui reste douteux est **dit** plutôt que masqué.
 *
 * Rien ici ne prétend localiser un bien. Le but est l'inverse : empêcher la
 * carte d'affirmer une position qu'elle ne connaît pas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Lodging } from './lodgings'
import type { Domain } from './referentiel'
import { domainRadiusKm } from '@shared/geo'

/**
 * Au-delà, l'annonce n'est plus dans le périmètre du domaine.
 *
 * Dérivé de la taille du domaine et non figé : quatorze kilomètres écartaient à
 * tort des hébergements de Courchevel quand le centroïde des 3 Vallées tombe du
 * côté de Val Thorens, et laissaient passer la vallée voisine d'un téléski des
 * Vosges. C'est le **même** rayon que celui envoyé aux sources — un logement
 * accepté par la recherche ne peut plus être déclaré hors périmètre par la
 * carte. Voir `@shared/geo`.
 */
function maxKmFromDomain(d: Domain): number {
  return domainRadiusKm(d.km)
}
/** Au-dessus du front de neige de plus que ça : le point est en montagne. */
const ALT_ABOVE_MAX = 400
/** Sous le front de neige de plus que ça : fond de vallée. */
const ALT_BELOW_MAX = 450
/** Rayon de recherche d'un bâtiment cartographié, en mètres. */
const BUILDING_RADIUS = 180
/** Points d'altitude par requête Open-Meteo. */
const ELEVATION_BATCH = 100
/** Passes de resserrement des positions estimées. */
const SHRINK_PASSES = 3
/** Suspects soumis à Overpass par vérification — le service est public et lent. */
const MAX_SUSPECTS = 8
/** Politique d'usage Overpass : au moins une seconde entre deux requêtes. */
const OVERPASS_DELAY_MS = 1100

const OVERPASS_HOSTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter'
]

export type GeoLevel = 'ok' | 'warn' | 'bad' | 'wait'

export interface GeoCheck {
  /** Altitude du point, en mètres. `undefined` = pas encore demandée. */
  alt?: number | null
  water?: boolean
  bld?: boolean
}

export type GeoChecks = Record<string, GeoCheck>
/** Nombre de resserrements déjà appliqués, par bien. */
export type GeoShrink = Record<string, number>

export interface GeoStatus {
  level: GeoLevel
  txt: string
  alt: number | null
  /** Distance au centre du domaine, en km. */
  km: number
  /** Position déduite, faute de coordonnées publiées. */
  est: boolean
  /** Position estimée déjà resserrée vers la station. */
  moved: boolean
}

function shrinkKeyOf(lg: Lodging): string {
  return String(lg.dup ?? lg.id)
}

/**
 * Position d'une annonce sur la carte.
 *
 * Quand la source publie des coordonnées, elles sont utilisées telles quelles.
 * Sinon, **rien** : on ne disperse plus autour du centroïde du domaine. Une
 * épingle au village se lisait comme une mesure. Sans GPS, pas de pin, et
 * `distanceStatus = no_gps`.
 */
export function lodgingCoords(d: Domain, lg: Lodging, shrink: GeoShrink = {}): [number, number] | null {
  void d
  void shrink
  if (lg.lat != null && lg.lon != null) return [lg.lon, lg.lat]
  return null
}

export function coordKey(c: [number, number]): string {
  return `${c[0].toFixed(5)},${c[1].toFixed(5)}`
}

function kmBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

const fmt = (v: number): string => Math.round(v).toLocaleString('fr-FR')

/** Altitude de référence de la station : le front de neige, à défaut le bas. */
function resortAltitude(d: Domain): number {
  return d.village != null && d.village > 0 ? d.village : d.min
}

export function geoStatus(
  d: Domain,
  lg: Lodging,
  checks: GeoChecks,
  shrink: GeoShrink = {}
): GeoStatus {
  const est = lg.lat == null || lg.lon == null
  if (est) {
    return {
      level: 'warn',
      txt: 'sans GPS — distance non calculée, pas de pin au centroïde',
      alt: null,
      km: 0,
      est: true,
      moved: false
    }
  }
  const c = lodgingCoords(d, lg, shrink)
  if (!c) {
    return {
      level: 'warn',
      txt: 'sans GPS — distance non calculée, pas de pin au centroïde',
      alt: null,
      km: 0,
      est: true,
      moved: false
    }
  }
  const g = checks[coordKey(c)]
  const km = kmBetween(c[1], c[0], d.lat, d.lon)
  const alt = g?.alt ?? null
  const moved = est && (shrink[shrinkKeyOf(lg)] ?? 0) > 0
  const base = { alt, km, est, moved }

  // Une position publiée trop loin du domaine n'est pas un doute mais une
  // erreur de rattachement : elle est signalée avant même toute vérification.
  if (!est && km > maxKmFromDomain(d)) {
    return { ...base, level: 'bad', txt: `à ${km.toFixed(1)} km du domaine — hors périmètre` }
  }
  if (!g || g.alt === undefined) {
    return { ...base, level: 'wait', txt: 'position en cours de vérification' }
  }
  if (g.water === true) return { ...base, level: 'bad', txt: 'point situé sur un plan d’eau' }

  const vil = resortAltitude(d)
  if (alt != null && vil != null) {
    if (alt > vil + ALT_ABOVE_MAX) {
      return {
        ...base,
        level: 'bad',
        txt: `altitude ${fmt(alt)} m, soit ${fmt(alt - vil)} m au-dessus de la station — point en pleine montagne`
      }
    }
    if (alt < vil - ALT_BELOW_MAX) {
      return {
        ...base,
        level: 'warn',
        txt: `altitude ${fmt(alt)} m, bien sous la station — probablement en fond de vallée`
      }
    }
  }
  if (g.bld === false) {
    return { ...base, level: 'warn', txt: `aucun bâtiment cartographié à moins de ${BUILDING_RADIUS} m` }
  }

  const suffix = alt != null ? ` · ${fmt(alt)} m` : ''
  if (est) {
    const lead = moved ? 'position estimée, recentrée sur la station' : 'position estimée sur la station'
    return { ...base, level: 'ok', txt: `${lead}, relief plausible${suffix}` }
  }
  return { ...base, level: 'ok', txt: `position vérifiée${suffix}${g.bld ? ', bâti confirmé' : ''}` }
}

interface Point {
  k: string
  c: [number, number]
}

/** Altitudes du modèle Open-Meteo, par lots. Renseigne `checks` en place. */
async function fetchElevations(points: Point[], checks: GeoChecks): Promise<void> {
  for (let i = 0; i < points.length; i += ELEVATION_BATCH) {
    const batch = points.slice(i, i + ELEVATION_BATCH)
    const lat = batch.map((p) => p.c[1].toFixed(5)).join(',')
    const lon = batch.map((p) => p.c[0].toFixed(5)).join(',')
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`)
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
    const json = (await res.json()) as { elevation?: (number | null)[] }
    const values = json.elevation ?? []
    batch.forEach((p, n) => {
      checks[p.k] = { ...(checks[p.k] ?? {}), alt: values[n] != null ? Math.round(values[n] as number) : null }
    })
  }
}

/**
 * Plan d'eau et bâti, via Overpass.
 *
 * Une requête par point suspect, espacées d'une seconde, et huit au maximum :
 * Overpass est un service public gratuit, et vérifier deux cents épingles à
 * chaque ouverture d'écran serait un abus. Le premier hôte injoignable fait
 * basculer sur le second ; les deux muets arrêtent la vérification et le disent.
 */
async function fetchOsmContext(
  points: Point[],
  checks: GeoChecks,
  onProgress: () => void
): Promise<boolean> {
  let consecutiveFailures = 0
  let succeeded = 0

  for (const p of points.slice(0, MAX_SUSPECTS)) {
    const la = p.c[1].toFixed(5)
    const lo = p.c[0].toFixed(5)
    const query =
      `[out:json][timeout:20];is_in(${la},${lo})->.a;` +
      'way.a[natural=water];out tags 1;relation.a[natural=water];out tags 1;' +
      `way(around:${BUILDING_RADIUS},${la},${lo})[building];out tags 1;`

    let done = false
    for (const host of OVERPASS_HOSTS) {
      try {
        const res = await fetch(host, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
        if (!res.ok) throw new Error(String(res.status))
        const elements = ((await res.json()) as { elements?: { tags?: Record<string, string> }[] })
          .elements ?? []
        checks[p.k] = {
          ...(checks[p.k] ?? {}),
          water: elements.some((e) => e.tags?.natural === 'water'),
          bld: elements.some((e) => e.tags?.building != null)
        }
        done = true
        break
      } catch {
        /* hôte injoignable : on tente le suivant */
      }
    }
    // Overpass renvoie régulièrement un 504 passager, y compris sur les deux
    // hôtes à la suite. Abandonner au premier échec priverait tout le lot de
    // la vérification pour un incident d'une seconde ; insister indéfiniment
    // sur un service déjà en peine serait pire. Deux échecs d'affilée valent
    // panne, et on s'arrête.
    if (!done) {
      consecutiveFailures++
      if (consecutiveFailures >= 2) return succeeded > 0
      await new Promise((r) => setTimeout(r, OVERPASS_DELAY_MS))
      continue
    }
    consecutiveFailures = 0
    succeeded++
    onProgress()
    await new Promise((r) => setTimeout(r, OVERPASS_DELAY_MS))
  }
  return true
}

export interface GeoSummary {
  total: number
  bad: number
  warn: number
  /** Positions déduites faute de coordonnées publiées. */
  est: number
  waiting: number
}

export interface LodgingGeoState {
  statusOf: (lg: Lodging) => GeoStatus
  summary: GeoSummary
  busy: boolean
  /** Altimétrie indisponible : les niveaux restent en attente. */
  error: string | null
  /** Overpass injoignable : plan d'eau et bâti non vérifiés. */
  osmError: boolean
  recheck: () => void
}

/**
 * Vérifie les positions du lot affiché.
 *
 * Trois passes : on relève les altitudes, on resserre vers la station les
 * positions **estimées** que le relief dément, et on recommence — un point
 * resserré retombe ailleurs et doit être revérifié. Les positions publiées par
 * une source ne sont jamais déplacées : elles sont signalées, pas corrigées.
 */
export function useLodgingGeo(domain: Domain | null, lodgings: Lodging[]): LodgingGeoState {
  const checks = useRef<GeoChecks>({})
  const shrink = useRef<GeoShrink>({})
  const running = useRef(false)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [osmError, setOsmError] = useState(false)
  const [round, setRound] = useState(0)

  // Une clé stable du lot : recalculer à chaque rendu relancerait la
  // vérification en boucle, or elle interroge deux services publics.
  const batchKey = useMemo(
    () => (domain ? `${domain.id}:${lodgings.map((l) => l.id).join(',')}` : ''),
    [domain, lodgings]
  )

  useEffect(() => {
    if (!domain || lodgings.length === 0 || running.current) return
    let cancelled = false
    running.current = true
    setBusy(true)
    setError(null)

    const run = async (): Promise<void> => {
      if (round > 0) {
        checks.current = {}
        shrink.current = {}
      }
      const vil = resortAltitude(domain)
      try {
        for (let pass = 0; pass < SHRINK_PASSES; pass++) {
          const seen = new Set<string>()
          const todo: Point[] = []
          for (const lg of lodgings) {
            const c = lodgingCoords(domain, lg, shrink.current)
            if (!c) continue
            const k = coordKey(c)
            if (seen.has(k)) continue
            seen.add(k)
            if (checks.current[k]?.alt === undefined) todo.push({ k, c })
          }
          if (todo.length > 0) await fetchElevations(todo, checks.current)
          if (cancelled) return

          let moved = 0
          for (const lg of lodgings) {
            if (lg.lat != null && lg.lon != null) continue
            const key = shrinkKeyOf(lg)
            const level = shrink.current[key] ?? 0
            if (level >= 2) continue
            const coords = lodgingCoords(domain, lg, shrink.current)
            if (!coords) continue
            const g = checks.current[coordKey(coords)]
            const bad =
              g != null &&
              (g.water === true ||
                (g.alt != null && (g.alt > vil + ALT_ABOVE_MAX || g.alt < vil - ALT_BELOW_MAX)))
            if (bad) {
              shrink.current[key] = level + 1
              moved++
            }
          }
          if (moved === 0) break
        }
      } catch {
        if (!cancelled) setError('Altitudes non vérifiées : service d’élévation indisponible.')
      }

      if (cancelled) return
      setVersion((v) => v + 1)
      setBusy(false)

      // Second temps : plan d'eau et bâti, seulement sur ce qui reste douteux.
      const seen = new Set<string>()
      const suspects: Point[] = []
      for (const lg of lodgings) {
        const c = lodgingCoords(domain, lg, shrink.current)
        if (!c) continue
        const k = coordKey(c)
        if (seen.has(k) || checks.current[k]?.water !== undefined) continue
        seen.add(k)
        const st = geoStatus(domain, lg, checks.current, shrink.current)
        if (st.level === 'bad' || st.level === 'warn' || st.est) suspects.push({ k, c })
      }
      if (suspects.length === 0) return
      const ok = await fetchOsmContext(suspects, checks.current, () => {
        if (!cancelled) setVersion((v) => v + 1)
      })
      if (!cancelled) {
        setOsmError(!ok)
        setVersion((v) => v + 1)
      }
    }

    void run().finally(() => {
      running.current = false
      if (!cancelled) setBusy(false)
    })

    return () => {
      cancelled = true
    }
    // `version` est volontairement absent : c'est la sortie de cet effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchKey, round])

  const statusOf = useCallback(
    (lg: Lodging): GeoStatus =>
      domain
        ? geoStatus(domain, lg, checks.current, shrink.current)
        : { level: 'wait', txt: '', alt: null, km: 0, est: true, moved: false },
    // `version` force le recalcul quand les vérifications avancent : les
    // références mutables ne déclenchent pas de rendu par elles-mêmes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [domain, version]
  )

  const summary = useMemo<GeoSummary>(() => {
    const out: GeoSummary = { total: lodgings.length, bad: 0, warn: 0, est: 0, waiting: 0 }
    if (!domain) return out
    for (const lg of lodgings) {
      const st = statusOf(lg)
      if (st.est) out.est++
      if (st.level === 'bad') out.bad++
      else if (st.level === 'warn') out.warn++
      else if (st.level === 'wait') out.waiting++
    }
    return out
  }, [domain, lodgings, statusOf])

  return {
    statusOf,
    summary,
    busy,
    error,
    osmError,
    recheck: () => setRound((n) => n + 1)
  }
}
