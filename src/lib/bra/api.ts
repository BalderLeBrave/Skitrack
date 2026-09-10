import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { BraBulletin } from "./parse";
import { braCodeOf, braMassifOf } from "./massifs";
import { internalIndex, type InternalSnow } from "./internal";

export type BraPayload = {
  massif: string | null;
  code: number | null;
  official: BraBulletin | null;
  internal: InternalSnow;
};

export const getStationBra = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().min(1),
      massif: z.string().optional(),
      lat: z.number(),
      lon: z.number(),
      villageM: z.number().optional(),
      force: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }): Promise<BraPayload> => {
    const massif = braMassifOf(data.name, data.massif ?? null);
    const code = braCodeOf(data.name, data.massif ?? null);
    let official: BraBulletin | null = null;
    if (code != null) {
      const { fetchBra } = await import("./fetch.server");
      official = await fetchBra(code, data.force ?? false);
    }
    const { fetchArome } = await import("../meteo/arome.server");
    const snow = await fetchArome(data.lat, data.lon, data.villageM);
    const level = internalIndex(snow.snowfall24hCm, snow.windKmh);
    return {
      massif,
      code,
      official,
      internal: {
        source: "interne",
        label: "indice interne",
        note: "Indice interne (chutes AROME + vent). Ce n’est pas le BRA officiel Météo-France.",
        level,
        snowfall24hCm: snow.snowfall24hCm,
        windKmh: snow.windKmh,
        snowDepthCm: null,
      },
    };
  });
