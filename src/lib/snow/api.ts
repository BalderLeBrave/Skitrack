import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

export const getSnowPair = createServerFn({ method: "POST" })
  .validator(
    z.object({
      lat: z.number(),
      lon: z.number(),
      villageM: z.number(),
      summitM: z.number(),
    }),
  )
  .handler(async ({ data }): Promise<SnowPair> => {
    const { fetchSnowPair } = await import("./openMeteo.server");
    return fetchSnowPair(data.lat, data.lon, data.villageM, data.summitM);
  });

export const getListingElevation = createServerFn({ method: "POST" })
  .validator(z.object({ lat: z.number(), lon: z.number() }))
  .handler(async ({ data }): Promise<{ eleM: number | null }> => {
    const { fetchElevation } = await import("./openMeteo.server");
    return { eleM: await fetchElevation(data.lat, data.lon) };
  });

export const getListingElevations = createServerFn({ method: "POST" })
  .validator(
    z.object({
      points: z
        .array(z.object({ lat: z.number(), lon: z.number() }))
        .min(1)
        .max(80),
    }),
  )
  .handler(async ({ data }): Promise<{ eleM: number | null; lat: number; lon: number }[]> => {
    const { fetchElevations } = await import("./openMeteo.server");
    const values = await fetchElevations(data.points);
    return data.points.map((p, i) => ({ lat: p.lat, lon: p.lon, eleM: values[i] ?? null }));
  });
