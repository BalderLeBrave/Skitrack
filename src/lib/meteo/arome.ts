/** Lecture AROME Météo-France. Rien n’est interpolé ni inventé. */

export type AromeReading = {
  model: "arome_france";
  tempC: number | null;
  weatherCode: number | null;
  weatherFr: string | null;
  windKmh: number | null;
  gustKmh: number | null;
  precip24hMm: number | null;
  snowfall24hCm: number | null;
  at: string | null;
  elevationM: number | null;
};

export type AromePair = {
  village: AromeReading;
  summit: AromeReading;
  villageM: number;
  summitM: number;
};

export const EMPTY_AROME: AromeReading = {
  model: "arome_france",
  tempC: null,
  weatherCode: null,
  weatherFr: null,
  windKmh: null,
  gustKmh: null,
  precip24hMm: null,
  snowfall24hCm: null,
  at: null,
  elevationM: null,
};

/** WMO 0–99, libellés courts. Codes hors table = null. */
export function wmoFr(code: number | null): string | null {
  if (code == null || !Number.isFinite(code)) return null;
  const n = Math.round(code);
  if (n === 0) return "ciel clair";
  if (n <= 3) return "nuageux";
  if (n === 45 || n === 48) return "brouillard";
  if (n >= 51 && n <= 67) return "pluie";
  if (n >= 71 && n <= 77) return "neige";
  if (n >= 80 && n <= 82) return "averses";
  if (n === 85 || n === 86) return "averses de neige";
  if (n >= 95 && n <= 99) return "orage";
  return null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function sum24(xs: unknown, scale = 1): number | null {
  if (!Array.isArray(xs)) return null;
  const slice = xs.slice(0, 24);
  if (slice.every((x) => x == null)) return null;
  let s = 0;
  for (const x of slice) s += typeof x === "number" && Number.isFinite(x) ? x : 0;
  return Math.round(s * scale * 10) / 10;
}

type AromeJson = {
  elevation?: number;
  current?: {
    time?: string;
    temperature_2m?: number | null;
    weather_code?: number | null;
    wind_speed_10m?: number | null;
    wind_gusts_10m?: number | null;
    precipitation?: number | null;
    snowfall?: number | null;
  };
  hourly?: {
    temperature_2m?: Array<number | null>;
    snowfall?: Array<number | null>;
    precipitation?: Array<number | null>;
    weather_code?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
    wind_gusts_10m?: Array<number | null>;
  };
};

export function parseArome(raw: unknown, elevationM?: number): AromeReading {
  if (!raw || typeof raw !== "object") return { ...EMPTY_AROME };
  const d = raw as AromeJson;
  const cur = d.current ?? {};
  const hourly = d.hourly ?? {};
  const weatherCode = num(cur.weather_code) ?? num(hourly.weather_code?.[0]);
  const snow = sum24(hourly.snowfall);
  const rain = sum24(hourly.precipitation);
  const asked = elevationM != null && Number.isFinite(elevationM) ? Math.round(elevationM) : null;
  const modelEle = num(d.elevation);
  return {
    model: "arome_france",
    tempC: num(cur.temperature_2m) ?? num(hourly.temperature_2m?.[0]),
    weatherCode,
    weatherFr: wmoFr(weatherCode),
    windKmh: num(cur.wind_speed_10m) ?? num(hourly.wind_speed_10m?.[0]),
    gustKmh: num(cur.wind_gusts_10m) ?? num(hourly.wind_gusts_10m?.[0]),
    precip24hMm: rain,
    snowfall24hCm: snow,
    at: typeof cur.time === "string" ? cur.time : null,
    elevationM: asked ?? (modelEle != null ? Math.round(modelEle) : null),
  };
}

/** Gel au sommet et positif au village — pas d’altitude d’isotherme inventée. */
export function freezeSplit(village: AromeReading, summit: AromeReading): string | null {
  if (village.tempC == null || summit.tempC == null) return null;
  if (village.tempC > 0 && summit.tempC < 0) return "positif au village, gel au sommet";
  if (village.tempC < 0 && summit.tempC < 0) return "gel village et sommet";
  if (village.tempC > 0 && summit.tempC > 0) return "positif village et sommet";
  return null;
}
