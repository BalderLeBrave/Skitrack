/**
 * Neige et météo réelles, via Open-Meteo.
 *
 * Open-Meteo est interrogeable sans clé et accepte plusieurs points par
 * requête, avec une altitude par point : on demande donc **deux** points par
 * domaine — le bas des pistes et le point culminant — puisque c'est
 * exactement l'écart que l'utilisateur regarde. Le modèle interpole sur
 * l'altitude fournie plutôt que sur celle de la maille, ce qui change tout en
 * montagne.
 *
 * Ce qui est affiché est ce que le modèle donne, y compris zéro. Un domaine
 * sans neige au bas des pistes en février est une information de premier
 * ordre ; la masquer derrière une valeur plausible reviendrait à supprimer la
 * seule chose que cette application sert à voir.
 *
 * Le risque d'avalanche n'est pas relevé : le BRA est publié par Météo-France
 * et demande une clé. L'indice affiché est dérivé des chutes récentes et du
 * vent, et présenté comme tel — il ne remplace pas un bulletin.
 */

import type { Domain } from './referentiel'
import { hasCoords } from './referentiel'

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const CACHE_KEY = 'skitrack-v3-weather'
/** Open-Meteo rafraîchit ses modèles toutes les heures ; trois heures de cache
 *  suffisent largement pour un usage de planification. */
const TTL_MS = 3 * 3600 * 1000
/** Points par requête. Deux par domaine, donc 40 domaines par appel. */
const BATCH_LOCATIONS = 80

export type SkyKind = 'sun' | 'cloud' | 'snow'

export interface WeatherDay {
  /** Date ISO du jour. */
  date: string
  label: string
  tempMax: number
  snowCm: number
  kind: SkyKind
}

export interface DomainWeather {
  /** Hauteur de neige au sol au bas des pistes, en cm. */
  snowBas: number | null
  /** Hauteur de neige au sol au point culminant, en cm. */
  snowHaut: number | null
  days: WeatherDay[]
  /** Cumul de chutes annoncé sur 7 jours, en cm, au point culminant. */
  snowfall7: number
  /** Vent maximum annoncé sur 7 jours, en km/h. */
  windMax: number
  fetchedAt: number
}

export type WeatherMap = Record<number, DomainWeather>

/** Codes WMO regroupés en trois familles, celles que la fiche sait dessiner. */
function skyOf(code: number): SkyKind {
  if (code >= 71 && code <= 77) return 'snow'
  if (code === 85 || code === 86) return 'snow'
  if (code <= 1) return 'sun'
  return 'cloud'
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
}

interface OpenMeteoPoint {
  current?: { snow_depth?: number }
  daily?: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    snowfall_sum: number[]
    wind_speed_10m_max: number[]
  }
}

function readCache(): WeatherMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as WeatherMap) : {}
  } catch {
    return {}
  }
}

function writeCache(map: WeatherMap): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map))
  } catch {
    /* quota dépassé : le cache mémoire suffit pour la session */
  }
}

function isFresh(entry: DomainWeather | undefined, now: number): entry is DomainWeather {
  return entry != null && now - entry.fetchedAt < TTL_MS
}

async function fetchBatch(batch: Domain[]): Promise<WeatherMap> {
  // Deux points par domaine : bas des pistes puis point culminant, dans cet
  // ordre, ce qui permet de recomposer les paires à la lecture.
  const lat: number[] = []
  const lon: number[] = []
  const elev: number[] = []
  for (const d of batch) {
    lat.push(d.lat, d.lat)
    lon.push(d.lon, d.lon)
    elev.push(d.min, d.max)
  }

  const params = new URLSearchParams({
    latitude: lat.join(','),
    longitude: lon.join(','),
    elevation: elev.join(','),
    current: 'snow_depth',
    daily: 'weather_code,temperature_2m_max,snowfall_sum,wind_speed_10m_max',
    forecast_days: '7',
    timezone: 'Europe/Paris'
  })

  const res = await fetch(`${ENDPOINT}?${params.toString()}`)
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
  const json: unknown = await res.json()
  // Un seul point renvoie un objet, plusieurs renvoient un tableau.
  const points = (Array.isArray(json) ? json : [json]) as OpenMeteoPoint[]

  const now = Date.now()
  const out: WeatherMap = {}
  batch.forEach((d, i) => {
    const low = points[i * 2]
    const high = points[i * 2 + 1]
    if (!low || !high) return

    const daily = high.daily
    const days: WeatherDay[] =
      daily?.time.map((iso, k) => ({
        date: iso,
        label: dayLabel(iso),
        tempMax: Math.round(daily.temperature_2m_max[k]),
        snowCm: Math.round(daily.snowfall_sum[k] ?? 0),
        kind: skyOf(daily.weather_code[k])
      })) ?? []

    const toCm = (m: number | undefined): number | null => (m == null ? null : Math.round(m * 100))

    out[d.id] = {
      snowBas: toCm(low.current?.snow_depth),
      snowHaut: toCm(high.current?.snow_depth),
      days,
      snowfall7: Math.round(days.reduce((n, x) => n + x.snowCm, 0)),
      windMax: Math.round(Math.max(0, ...(daily?.wind_speed_10m_max ?? [0]))),
      fetchedAt: now
    }
  })
  return out
}

/**
 * Résultat d'un relevé météo.
 *
 * La fonction rendait la seule carte, et avalait ses erreurs en silence. Un
 * Open-Meteo injoignable était alors indiscernable d'un cache encore frais :
 * l'écran gardait les valeurs de la veille et continuait d'afficher « relevé il
 * y a 4 min », parce que c'est la date de la *lecture du cache* qu'il lisait.
 * Une hauteur de neige périmée présentée comme fraîche est exactement le genre
 * de chiffre sur lequel on décide d'un départ.
 */
export interface WeatherFetch {
  map: WeatherMap
  /** Domaines qu'il a fallu demander (les autres étaient encore frais). */
  requested: number
  /** Domaines dont le lot a échoué : ils gardent leur relevé précédent, ou rien. */
  failed: number
  /** Message de la dernière erreur, `null` si tout a abouti. */
  error: string | null
  /** Fin du relevé, si **au moins un** lot a abouti. `null` sinon. */
  succeededAt: number | null
}

/**
 * Complète la carte météo pour les domaines demandés. Les entrées encore
 * fraîches ne sont pas redemandées ; un lot en échec laisse simplement ces
 * domaines sans météo, sans faire tomber les autres — mais il est désormais
 * **compté et rendu**, au lieu d'être avalé par le `catch`.
 */
export async function fetchWeather(
  allDomains: Domain[],
  known: WeatherMap,
  force = false
): Promise<WeatherFetch> {
  // Un domaine sans coordonnées insérerait un trou dans les listes
  // `latitude=`/`longitude=` de la requête groupée et décalerait toutes les
  // réponses suivantes : la météo de Chamrousse finirait sur Avoriaz.
  const domains = allDomains.filter(hasCoords)
  const now = Date.now()
  const cached = { ...readCache(), ...known }
  // `force` : demande explicite de l'utilisateur (bouton « actualiser »). Le
  // cache n'est pas vidé, il est seulement ignoré pour ce lot — les domaines
  // hors écran gardent leur relevé.
  const missing = force ? domains : domains.filter((d) => !isFresh(cached[d.id], now))
  // Rien à demander : tout est encore frais. Ce n'est ni un succès ni un échec
  // de relevé — `succeededAt` reste nul et l'écran garde la date qu'il affiche
  // déjà, plutôt que de la remettre à zéro sur un appel qui n'a rien demandé.
  if (missing.length === 0) {
    return { map: cached, requested: 0, failed: 0, error: null, succeededAt: null }
  }

  const perRequest = Math.floor(BATCH_LOCATIONS / 2)
  const batches: Domain[][] = []
  for (let i = 0; i < missing.length; i += perRequest) batches.push(missing.slice(i, i + perRequest))

  let merged = cached
  let failed = 0
  let ok = 0
  let error: string | null = null
  for (const batch of batches) {
    try {
      merged = { ...merged, ...(await fetchBatch(batch)) }
      ok += batch.length
    } catch (err) {
      // Le lot est perdu, les autres continuent — c'est l'invariant « un échec
      // de source reste local ». Ce qui change : on retient combien de domaines
      // sont concernés et pourquoi, pour que l'écran puisse le dire.
      failed += batch.length
      error = err instanceof Error ? err.message : String(err)
    }
  }
  writeCache(merged)
  return {
    map: merged,
    requested: missing.length,
    failed,
    error,
    succeededAt: ok > 0 ? Date.now() : null
  }
}

/**
 * Indice de risque d'avalanche, de 1 à 5, dérivé des chutes récentes et du
 * vent. Ce n'est **pas** un BRA : le bulletin officiel intègre la stratigraphie
 * du manteau, que personne ne peut déduire d'une prévision.
 */
export function avalancheIndex(w: DomainWeather | undefined): number | null {
  if (!w || w.snowHaut == null || w.snowHaut === 0) return null
  let index = 1
  if (w.snowfall7 >= 10) index++
  if (w.snowfall7 >= 30) index++
  if (w.windMax >= 40) index++
  return Math.min(5, index)
}

/** Couleur de l'indice de risque : neutre quand il n'est pas évaluable. */
export function riskColor(index: number | null): string {
  if (index == null) return 'var(--muted)'
  return index >= 3 ? 'var(--warn)' : 'var(--ok)'
}

/** Résumé des chutes annoncées, pour la ligne « neige » des vignettes. */
export function snowfallText(w: DomainWeather | undefined): string {
  if (!w || w.days.length === 0) return 'prévisions indisponibles'
  const best = w.days.reduce((a, b) => (b.snowCm > a.snowCm ? b : a))
  if (best.snowCm <= 0) return 'pas de chute annoncée sur 7 j'
  return `${best.snowCm} cm attendus ${best.label}`
}

export interface SnowDepths {
  bas: number | null
  haut: number | null
  /** `true` quand le modèle a répondu — y compris s'il répond zéro. */
  releve: boolean
}

/**
 * Hauteurs de neige à afficher.
 *
 * **Uniquement le modèle, jamais une valeur de repli.** Le référentiel porte un
 * champ `neige`, mais c'est un jeu de démonstration : il annonce 95 cm au pied
 * des pistes à la mi-août, ne compte que huit libellés de chutes distincts pour
 * cent soixante-treize domaines, et se réclame de bulletins Météo-France qui
 * n'existent pas hors saison. L'afficher revenait à inventer de la neige.
 *
 * Tant que le modèle n'a pas répondu, on ne montre rien. Quand il répond zéro,
 * on montre zéro : un domaine sans neige au bas des pistes est exactement ce
 * que cette application sert à voir.
 */
export function snowDepths(w: DomainWeather | undefined): SnowDepths {
  if (!w) return { bas: null, haut: null, releve: false }
  return { bas: w.snowBas, haut: w.snowHaut, releve: true }
}
