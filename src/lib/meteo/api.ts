import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AromePair } from "./arome";

export const getAromePair = createServerFn({ method: "POST" })
  .validator(
    z.object({
      lat: z.number(),
      lon: z.number(),
      villageM: z.number(),
      summitM: z.number(),
    }),
  )
  .handler(async ({ data }): Promise<AromePair> => {
    const { fetchAromePair } = await import("./arome.server");
    return fetchAromePair(data.lat, data.lon, data.villageM, data.summitM);
  });
