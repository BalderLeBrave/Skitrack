import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type SkyKind = "sun" | "cloud" | "snow" | "rain";

/**
 * État du ciel d'un créneau, en code plutôt qu'en français figé.
 *
 * Le module d'origine le faisait déjà : le code se traduit à l'affichage, ce
 * qui laisse la porte ouverte à une seconde langue sans toucher au relevé.
 */
export type SkyLabel =
  | "clear"
  | "fair"
  | "overcast"
  | "fog"
  | "rain"
  | "snow"
  | "storm"
  | "variable"
  | "unknown";

/** Un créneau horaire du premier jour : « 09 » le matin, « 15 » l'après-midi. */
export type ForecastSlot = {
  hour: string;
  temp: number | null;
  sky: SkyLabel;
};

/** Ce que l'écran écrit pour chaque code. Rien n'est deviné : `unknown` se dit. */
export const SKY_FR: Record<SkyLabel, string> = {
  clear: "ciel clair",
  fair: "peu nuageux",
  overcast: "couvert",
  fog: "brouillard",
  rain: "pluie",
  snow: "neige",
  storm: "orage",
  variable: "variable",
  unknown: "non rendu",
};

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
  /** Créneau de 9 h du premier jour, à cette altitude. */
  morning: ForecastSlot;
  /** Créneau de 15 h du premier jour. */
  afternoon: ForecastSlot;
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
