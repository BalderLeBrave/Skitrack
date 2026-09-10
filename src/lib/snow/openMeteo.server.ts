/** Neige Open-Meteo, sans clé. Valeurs du modèle, zéro compris. */

export type SnowReading = {
  snowfall24hCm: number | null;
  windKmh: number | null;
  snowDepthCm: number | null;
  at: string | null;
  elevationM: number | null;
};

export type SnowPair = {
  village: SnowReading;
  summit: SnowReading;
  villageM: number;
  summitM: number;
};

const cache = new Map<string, { at: number; value: SnowReading }>();
const eleCache = new Map<string, { at: number; value: number | null }>();
const TTL_MS = 30 * 60 * 1000;
const ELE_TTL_MS = 24 * 60 * 60 * 1000;

const EMPTY: SnowReading = {
  snowfall24hCm: null,
  windKmh: null,
  snowDepthCm: null,
  at: null,
  elevationM: null,
};

export async function fetchSnow(lat: number, lon: number, elevationM?: number): Promise<SnowReading> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${elevationM ?? "dem"}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const elev = elevationM != null && Number.isFinite(elevationM) ? `&elevation=${Math.round(elevationM)}` : "";
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `${elev}&current=wind_speed_10m,snowfall,snow_depth&hourly=snowfall,snow_depth,wind_speed_10m&forecast_days=2&timezone=Europe%2FParis`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as {
      elevation?: number;
      current?: { wind_speed_10m?: number; snowfall?: number; snow_depth?: number; time?: string };
      hourly?: { snowfall?: number[]; snow_depth?: number[]; wind_speed_10m?: number[] };
    };
    const hourlySnow = data.hourly?.snowfall ?? [];
    const snow24 = hourlySnow.slice(0, 24).reduce((a, b) => a + (Number(b) || 0), 0);
    const modelEle = data.elevation != null && Number.isFinite(data.elevation) ? Math.round(data.elevation) : null;
    const value: SnowReading = {
      snowfall24hCm: Number.isFinite(snow24) ? Math.round(snow24 * 10) / 10 : null,
      windKmh: data.current?.wind_speed_10m ?? null,
      snowDepthCm:
        data.current?.snow_depth != null ? Math.round(data.current.snow_depth * 100) : null,
      at: data.current?.time ?? null,
      elevationM: elevationM != null ? Math.round(elevationM) : modelEle,
    };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return EMPTY;
  }
}

export async function fetchSnowPair(
  lat: number,
  lon: number,
  villageM: number,
  summitM: number,
): Promise<SnowPair> {
  const [village, summit] = await Promise.all([
    fetchSnow(lat, lon, villageM),
    fetchSnow(lat, lon, summitM),
  ]);
  return { village, summit, villageM, summitM };
}

/** Altitude modèle Copernicus / Open-Meteo. Jamais inventée. */
export async function fetchElevation(lat: number, lon: number): Promise<number | null> {
  const rows = await fetchElevations([{ lat, lon }]);
  return rows[0] ?? null;
}

export async function fetchElevations(
  pts: readonly { lat: number; lon: number }[],
): Promise<(number | null)[]> {
  if (pts.length === 0) return [];
  const out: (number | null)[] = new Array(pts.length).fill(null);
  const pending: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const key = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
    const hit = eleCache.get(key);
    if (hit && Date.now() - hit.at < ELE_TTL_MS) out[i] = hit.value;
    else pending.push(i);
  }
  const chunk = 40;
  for (let c = 0; c < pending.length; c += chunk) {
    const slice = pending.slice(c, c + chunk);
    const lats = slice.map((i) => pts[i].lat.toFixed(5)).join(",");
    const lons = slice.map((i) => pts[i].lon.toFixed(5)).join(",");
    try {
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { elevation?: number[] };
      const els = data.elevation ?? [];
      slice.forEach((i, k) => {
        const n = els[k];
        const value = n != null && Number.isFinite(n) ? Math.round(n) : null;
        const p = pts[i];
        eleCache.set(`${p.lat.toFixed(4)},${p.lon.toFixed(4)}`, { at: Date.now(), value });
        out[i] = value;
      });
    } catch {
      /* leave null */
    }
  }
  return out;
}

