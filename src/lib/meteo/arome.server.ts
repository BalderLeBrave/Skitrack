/** AROME Météo-France via l’API JSON Open-Meteo (même modèle). Portail MF = 401. */

import { EMPTY_AROME, parseArome, type AromePair, type AromeReading } from "./arome";

const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; value: AromeReading }>();

export async function fetchArome(lat: number, lon: number, elevationM?: number): Promise<AromeReading> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${elevationM ?? "dem"}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const elev = elevationM != null && Number.isFinite(elevationM) ? `&elevation=${Math.round(elevationM)}` : "";
  const url =
    `https://api.open-meteo.com/v1/meteofrance?latitude=${lat}&longitude=${lon}` +
    `${elev}&current=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation,snowfall` +
    `&hourly=temperature_2m,snowfall,precipitation,weather_code,wind_speed_10m,wind_gusts_10m` +
    `&forecast_days=2&timezone=Europe%2FParis&models=arome_france`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { ...EMPTY_AROME };
    const value = parseArome(await res.json(), elevationM);
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return { ...EMPTY_AROME };
  }
}

export async function fetchAromePair(
  lat: number,
  lon: number,
  villageM: number,
  summitM: number,
): Promise<AromePair> {
  const [village, summit] = await Promise.all([
    fetchArome(lat, lon, villageM),
    fetchArome(lat, lon, summitM),
  ]);
  return { village, summit, villageM, summitM };
}
