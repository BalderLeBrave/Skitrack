import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { aTraduire } from "../i18n/tr.ts";

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

/** Ce que l'écran écrit pour chaque code. Rien n'est deviné : `unknown` se dit.
 *  À traduire au rendu : `tr(SKY_FR[sky])`. */
export const SKY_FR: Record<SkyLabel, string> = {
  clear: aTraduire("ciel clair"),
  fair: aTraduire("peu nuageux"),
  overcast: aTraduire("couvert"),
  fog: aTraduire("brouillard"),
  rain: aTraduire("pluie"),
  snow: aTraduire("neige"),
  storm: aTraduire("orage"),
  variable: aTraduire("variable"),
  unknown: aTraduire("ciel non précisé"),
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
  /** Isotherme 0 °C à la mi-journée du jour courant, en mètres. */
  freezingLevelM: number | null;
  /**
   * D'où viennent les chutes, la pluie et les températures.
   * `arpege` en France métropolitaine : ce modèle suit l'altitude demandée.
   * `ecmwf` ailleurs. La hauteur au sol est toujours celle du CEPMMT :
   * Arpège ne la publie pas.
   */
  sourceChutes: "arpege" | "ecmwf";
  /** Horodatage du relevé. `null` = la requête n'a pas abouti. */
  at: string | null;
};

/** Jour civil à Paris, AAAA-MM-JJ. Les prévisions françaises sont horodatées ainsi. */
export function dateParis(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** La veille d'un jour civil AAAA-MM-JJ. */
export function veille(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/**
 * Le jour courant de la série.
 *
 * Avec un jour passé en tête, `days[0]` est hier. L'écran « aujourd'hui »
 * ne doit pas l'afficher à la place du jour en cours.
 */
export function jourCourant(days: readonly ForecastDay[], auj = dateParis()): ForecastDay | undefined {
  return days.find((d) => d.date === auj) ?? days.find((d) => d.date > auj) ?? days[0];
}

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
