/**
 * Météo détaillée d'un domaine, aux deux altitudes qui le bornent.
 *
 * La météo de la liste de résultats (`data/weather.ts`) suffit pour comparer
 * des domaines : neige au sol et chutes annoncées, sept jours, un point par
 * domaine. La fiche pose une autre question — « à quoi ressemble la semaine
 * là-haut, et où tombe la limite pluie-neige » — et demande donc l'horaire sur
 * quatorze jours, en bas des pistes **et** au point culminant. Deux mille
 * mètres d'écart valent souvent plus qu'une journée de décalage.
 *
 * Rien n'est mis en cache sur le disque : une réponse horaire sur quatorze
 * jours pèse quelques centaines de kilo-octets par domaine, et le quota de
 * `localStorage` sert mieux les préférences. Le cache mémoire évite le
 * rechargement quand on referme et rouvre la même fiche.
 */

import { useEffect, useState } from 'react'
import type { Domain } from './referentiel'

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const TTL_MS = 3 * 3600 * 1000
const FORECAST_DAYS = 14

export type SkyKind = 'sun' | 'cloud' | 'snow' | 'rain'

/** État du ciel, en codes traduits à l'affichage plutôt qu'en français figé. */
export type SkyLabel =
  | 'clear'
  | 'fair'
  | 'overcast'
  | 'fog'
  | 'rain'
  | 'snow'
  | 'storm'
  | 'variable'
  | 'unknown'

export interface DomainWeatherSlot {
  /** Heure locale demandée, « 09 » ou « 15 ». */
  hour: string
  temp: number | null
  sky: SkyLabel
}

export interface DomainWeatherDay {
  date: string
  tempMax: number | null
  tempMin: number | null
  rainMm: number
  snowCm: number
  kind: SkyKind
}

/** Une altitude du domaine : bas des pistes ou point culminant. */
export interface DomainWeatherLevel {
  altitude: number
  morning: DomainWeatherSlot
  afternoon: DomainWeatherSlot
  tempMin: number | null
  tempMax: number | null
  windMax: number | null
  rain24: number
  snow24: number
  /** Hauteur de neige au sol modélisée, en cm. */
  depth: number | null
  days: DomainWeatherDay[]
}

export interface DomainWeatherDetail {
  domainId: number
  fetchedAt: number
  low: DomainWeatherLevel
  high: DomainWeatherLevel
  /** Isotherme 0 °C à la mi-journée, en mètres. */
  freezingLevel: number | null
}

interface OpenMeteoDetail {
  hourly?: {
    time: string[]
    temperature_2m?: (number | null)[]
    precipitation?: (number | null)[]
    snowfall?: (number | null)[]
    freezing_level_height?: (number | null)[]
    weather_code?: (number | null)[]
  }
  daily?: {
    time: string[]
    temperature_2m_max?: (number | null)[]
    temperature_2m_min?: (number | null)[]
    precipitation_sum?: (number | null)[]
    snowfall_sum?: (number | null)[]
    weather_code?: (number | null)[]
    wind_speed_10m_max?: (number | null)[]
    snow_depth_max?: (number | null)[]
  }
}

/** Codes WMO regroupés en quatre familles — celles que la fiche sait dessiner. */
export function skyKindOf(code: number | null | undefined): SkyKind {
  if (code == null) return 'cloud'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow'
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 'rain'
  if ([0, 1].includes(code)) return 'sun'
  return 'cloud'
}

export function skyLabelOf(code: number | null | undefined): SkyLabel {
  if (code == null) return 'unknown'
  if (code === 0) return 'clear'
  if ([1, 2].includes(code)) return 'fair'
  if (code === 3) return 'overcast'
  if ([45, 48].includes(code)) return 'fog'
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 'rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow'
  if ([95, 96, 99].includes(code)) return 'storm'
  return 'variable'
}

function round(v: number | null | undefined): number | null {
  return v == null ? null : Math.round(v)
}

/** Index horaire du créneau `hh` sur le premier jour de la prévision. */
function slotIndex(point: OpenMeteoDetail, hour: string): number {
  const times = point.hourly?.time ?? []
  const day = point.daily?.time?.[0] ?? ''
  return times.findIndex((t) => t.startsWith(day) && t.endsWith(`T${hour}:00`))
}

function slotAt(point: OpenMeteoDetail, hour: string): DomainWeatherSlot {
  const i = slotIndex(point, hour)
  if (i < 0) return { hour, temp: null, sky: 'unknown' }
  return {
    hour,
    temp: round(point.hourly?.temperature_2m?.[i]),
    sky: skyLabelOf(point.hourly?.weather_code?.[i])
  }
}

function levelOf(point: OpenMeteoDetail, altitude: number): DomainWeatherLevel {
  const d = point.daily
  const days: DomainWeatherDay[] =
    d?.time.map((iso, k) => ({
      date: iso,
      tempMax: round(d.temperature_2m_max?.[k]),
      tempMin: round(d.temperature_2m_min?.[k]),
      rainMm: Math.round(d.precipitation_sum?.[k] ?? 0),
      snowCm: Math.round(d.snowfall_sum?.[k] ?? 0),
      kind: skyKindOf(d.weather_code?.[k])
    })) ?? []

  return {
    altitude,
    morning: slotAt(point, '09'),
    afternoon: slotAt(point, '15'),
    tempMin: days[0]?.tempMin ?? null,
    tempMax: days[0]?.tempMax ?? null,
    windMax: round(d?.wind_speed_10m_max?.[0]),
    rain24: days[0]?.rainMm ?? 0,
    snow24: days[0]?.snowCm ?? 0,
    // `snow_depth_max` est en mètres, comme tout ce qu'Open-Meteo exprime en
    // hauteur de manteau.
    depth: d?.snow_depth_max?.[0] == null ? null : Math.round((d.snow_depth_max[0] as number) * 100),
    days
  }
}

function urlFor(domain: Domain, elevation: number): string {
  const params = new URLSearchParams({
    latitude: String(domain.lat),
    longitude: String(domain.lon),
    elevation: String(Math.round(elevation)),
    hourly: 'temperature_2m,precipitation,snowfall,freezing_level_height,weather_code',
    daily:
      'temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,weather_code,wind_speed_10m_max,snow_depth_max',
    forecast_days: String(FORECAST_DAYS),
    timezone: 'Europe/Paris'
  })
  return `${ENDPOINT}?${params.toString()}`
}

const cache = new Map<number, DomainWeatherDetail>()

export async function fetchDomainWeather(domain: Domain): Promise<DomainWeatherDetail> {
  const known = cache.get(domain.id)
  if (known && Date.now() - known.fetchedAt < TTL_MS) return known

  const low = Math.round(domain.village || domain.min)
  const high = Math.round(domain.max)

  const [rl, rh] = await Promise.all([
    fetch(urlFor(domain, low)).then((r) => r.json() as Promise<OpenMeteoDetail>),
    fetch(urlFor(domain, high)).then((r) => r.json() as Promise<OpenMeteoDetail>)
  ])

  // L'isotherme est une propriété de la colonne d'air, pas du sol : la lire au
  // point culminant ou en bas donne la même valeur, on prend le relevé de
  // mi-journée du bas des pistes.
  const noon = slotIndex(rl, '12')
  const freezing = noon < 0 ? null : round(rl.hourly?.freezing_level_height?.[noon])

  const detail: DomainWeatherDetail = {
    domainId: domain.id,
    fetchedAt: Date.now(),
    low: levelOf(rl, low),
    high: levelOf(rh, high),
    freezingLevel: freezing
  }
  cache.set(domain.id, detail)
  return detail
}

export interface DomainWeatherState {
  detail: DomainWeatherDetail | null
  loading: boolean
  error: string | null
}

/**
 * Météo détaillée du domaine ouvert.
 *
 * Le domaine peut changer pendant la requête — on ferme une fiche pour en
 * ouvrir une autre : la réponse d'une requête périmée est jetée plutôt
 * qu'affichée sous le mauvais nom.
 */
export function useDomainWeather(domain: Domain | null): DomainWeatherState {
  const [state, setState] = useState<DomainWeatherState>({ detail: null, loading: false, error: null })

  useEffect(() => {
    if (!domain || domain.lat == null || domain.lon == null) {
      setState({ detail: null, loading: false, error: null })
      return
    }
    let cancelled = false
    setState({ detail: cache.get(domain.id) ?? null, loading: true, error: null })
    void fetchDomainWeather(domain)
      .then((detail) => {
        if (!cancelled) setState({ detail, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ detail: null, loading: false, error: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [domain])

  return state
}
