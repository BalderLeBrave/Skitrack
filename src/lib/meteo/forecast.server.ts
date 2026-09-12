/**
 * Prévision à quatorze jours, aux deux altitudes qui bornent la station.
 *
 * La météo de la liste de résultats suffit pour comparer des stations : neige
 * au sol et chutes annoncées, un point par station. La fiche pose une autre
 * question, « à quoi ressemble la semaine là-haut, et où tombe la limite
 * pluie-neige », et demande donc quatorze jours en bas des pistes **et** au
 * point culminant. Deux mille mètres d'écart valent souvent plus qu'une
 * journée de décalage.
 *
 * Repris de `src/renderer/src/data/domainWeather.ts` (commit 2d960d5). Deux
 * décisions de ce module sont conservées telles quelles, parce que les oublier
 * fausse les chiffres sans rien casser :
 *
 * 1. `snow_depth_max` est rendu en **mètres**, comme toutes les hauteurs de
 *    manteau d'Open-Meteo. Il faut multiplier par 100 pour l'afficher en cm.
 * 2. `precipitation_sum` additionne la pluie **et** l'équivalent en eau de la
 *    neige. En altitude, cela gonfle les millimètres de pluie d'une journée où
 *    il n'est tombé que de la neige. C'est `rain_sum` qui répond à la question
 *    posée, et `precipitation_sum` ne sert plus que de secours quand le modèle
 *    ne rend pas `rain_sum`.
 *
 * Rien n'est mis en cache sur le disque : le cache mémoire, trois heures, évite
 * le rechargement quand on referme et rouvre la même fiche. Aucune exception ne
 * remonte : en échec, les niveaux sont vides et `at` vaut `null`, ce que
 * l'écran sait dire.
 */

import type {
  ForecastDay,
  ForecastLevel,
  ForecastPair,
  ForecastSlot,
  SkyKind,
  SkyLabel,
} from "./forecast.ts";

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const TTL_MS = 3 * 3600 * 1000;
const FORECAST_DAYS = 14;

type OpenMeteoForecast = {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    weather_code?: (number | null)[];
    freezing_level_height?: (number | null)[];
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_sum?: (number | null)[];
    rain_sum?: (number | null)[];
    snowfall_sum?: (number | null)[];
    weather_code?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
    snow_depth_max?: (number | null)[];
  };
};

/** Codes WMO regroupés en quatre familles : celles que la fiche sait dessiner. */
export function skyKindOf(code: number | null | undefined): SkyKind {
  if (code == null) return "cloud";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if ([0, 1].includes(code)) return "sun";
  return "cloud";
}

function round(v: number | null | undefined): number | null {
  return v == null || !Number.isFinite(v) ? null : Math.round(v);
}

function round1(v: number | null | undefined): number | null {
  return v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
}

const EMPTY_SLOT = (hour: string): ForecastSlot => ({ hour, temp: null, sky: "unknown" });

function emptyLevel(altitudeM: number): ForecastLevel {
  return { altitudeM, morning: EMPTY_SLOT("09"), afternoon: EMPTY_SLOT("15"), days: [] };
}

/** Codes WMO en états de ciel nommés. Plus fin que `skyKindOf`, qui n'a que
 *  quatre familles parce qu'il sert à choisir un dessin. */
export function skyLabelOf(code: number | null | undefined): SkyLabel {
  if (code == null) return "unknown";
  if (code === 0) return "clear";
  if ([1, 2].includes(code)) return "fair";
  if (code === 3) return "overcast";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return "variable";
}

function slotAt(point: OpenMeteoForecast, hour: string): ForecastSlot {
  const i = slotIndex(point, hour);
  if (i < 0) return EMPTY_SLOT(hour);
  return {
    hour,
    temp: round(point.hourly?.temperature_2m?.[i]),
    sky: skyLabelOf(point.hourly?.weather_code?.[i]),
  };
}

function levelOf(point: OpenMeteoForecast, altitudeM: number): ForecastLevel {
  const d = point.daily;
  const time = d?.time ?? [];
  const days: ForecastDay[] = time.map((iso, k) => ({
    date: iso,
    tempMax: round(d?.temperature_2m_max?.[k]),
    tempMin: round(d?.temperature_2m_min?.[k]),
    // `rain_sum` d'abord : `precipitation_sum` compte aussi l'équivalent en eau
    // de la neige, et gonflerait les millimètres en altitude.
    rainMm: round1(d?.rain_sum?.[k] ?? d?.precipitation_sum?.[k]),
    snowCm: round1(d?.snowfall_sum?.[k]),
    windMaxKmh: round(d?.wind_speed_10m_max?.[k]),
    // `snow_depth_max` est en mètres, comme toutes les hauteurs de manteau.
    depthCm: (() => {
      const m = d?.snow_depth_max?.[k];
      return m == null || !Number.isFinite(m) ? null : Math.round(m * 100);
    })(),
    kind: skyKindOf(d?.weather_code?.[k]),
  }));
  return { altitudeM, morning: slotAt(point, "09"), afternoon: slotAt(point, "15"), days };
}

/** Index horaire du créneau `hh` sur le premier jour de la prévision. */
function slotIndex(point: OpenMeteoForecast, hour: string): number {
  const times = point.hourly?.time ?? [];
  const day = point.daily?.time?.[0] ?? "";
  return times.findIndex((t) => t.startsWith(day) && t.endsWith(`T${hour}:00`));
}

function urlFor(lat: number, lon: number, elevationM: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    elevation: String(Math.round(elevationM)),
    // Les créneaux de 9 h et 15 h demandent la température et le code de ciel
    // horaires. C'est ce que l'écran montre au-dessus des quatorze jours :
    // « à quoi ressemble la journée, en haut et en bas ».
    hourly: "temperature_2m,weather_code,freezing_level_height",
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "rain_sum",
      "snowfall_sum",
      "weather_code",
      "wind_speed_10m_max",
      "snow_depth_max",
    ].join(","),
    forecast_days: String(FORECAST_DAYS),
    timezone: "Europe/Paris",
  });
  return `${ENDPOINT}?${params.toString()}`;
}

const cache = new Map<string, { at: number; value: ForecastPair }>();

async function load(url: string): Promise<OpenMeteoForecast | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  return (await res.json()) as OpenMeteoForecast;
}

export async function fetchForecastPair(
  lat: number,
  lon: number,
  villageM: number,
  summitM: number,
): Promise<ForecastPair> {
  const low = Math.round(villageM);
  const high = Math.round(summitM);
  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${low},${high}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const empty: ForecastPair = {
    low: emptyLevel(low),
    high: emptyLevel(high),
    freezingLevelM: null,
    at: null,
  };

  try {
    const [rl, rh] = await Promise.all([load(urlFor(lat, lon, low)), load(urlFor(lat, lon, high))]);
    if (!rl || !rh) return empty;

    // L'isotherme est une propriété de la colonne d'air, pas du sol : la lire au
    // point culminant ou en bas donne la même valeur. On prend le relevé de
    // mi-journée du bas des pistes.
    const noon = slotIndex(rl, "12");
    const value: ForecastPair = {
      low: levelOf(rl, low),
      high: levelOf(rh, high),
      freezingLevelM: noon < 0 ? null : round(rl.hourly?.freezing_level_height?.[noon]),
      at: new Date().toISOString(),
    };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return empty;
  }
}
