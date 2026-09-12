import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type SkyKind = "sun" | "cloud" | "snow" | "rain";

export type ForecastDay = {
  /** Jour calendaire, AAAA-MM-JJ. */
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  /** Pluie du jour en mm. `rain_sum`, jamais `precipitation_sum` seul. */
  rainMm: number | null;
  snowCm: number | null;
  windMaxKmh: number | null;
  /** Neige au sol modélisée, en cm. */
  depthCm: number | null;
  kind: SkyKind;
};

/** Une altitude de la station : bas des pistes ou point culminant. */
export type ForecastLevel = {
  altitudeM: number;
  days: ForecastDay[];
};

export type ForecastPair = {
  low: ForecastLevel;
  high: ForecastLevel;
  /** Isotherme 0 °C à la mi-journée du premier jour, en mètres. */
  freezingLevelM: number | null;
  /** Horodatage du relevé. `null` = la requête n'a pas abouti. */
  at: string | null;
};

/** Prévision 14 jours aux deux altitudes. Le relevé se fait côté serveur. */
export const getForecastPair = createServerFn({ method: "POST" })
  .validator(
    z.object({
      lat: z.number(),
      lon: z.number(),
      villageM: z.number(),
      summitM: z.number(),
    }),
  )
  .handler(async ({ data }): Promise<ForecastPair> => {
    const { fetchForecastPair } = await import("./forecast.server");
    return fetchForecastPair(data.lat, data.lon, data.villageM, data.summitM);
  });
