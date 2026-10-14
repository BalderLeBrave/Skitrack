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

export const getListingElevations = createServerFn({ method: "POST" })
  .validator(
    z.object({
      points: z
        .array(z.object({ lat: z.number(), lon: z.number() }))
        .min(1)
        .max(160),
    }),
  )
  .handler(async ({ data }): Promise<{ eleM: number | null; lat: number; lon: number }[]> => {
    const { fetchElevations } = await import("./openMeteo.server");
    const { withDeadline, estTimeout } = await import("../stay/deadline");
    try {
      const values = await withDeadline(fetchElevations(data.points), 15_000, "elevation");
      return data.points.map((p, i) => ({ lat: p.lat, lon: p.lon, eleM: values[i] ?? null }));
    } catch (err) {
      if (!estTimeout(err)) throw err;
      return data.points.map((p) => ({ lat: p.lat, lon: p.lon, eleM: null }));
    }
  });
