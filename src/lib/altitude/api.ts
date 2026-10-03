import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Altitude } from "./altitude";

/** Les altitudes d'au plus 400 points (`altitude.server.ts`). */
export const lireAltitudes = createServerFn({ method: "POST" })
  .validator(
    z.object({
      points: z
        .array(z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }))
        .min(1)
        .max(400),
    }),
  )
  .handler(async ({ data }): Promise<(Altitude | null)[]> => {
    const { altitudes } = await import("./altitude.server");
    const { withDeadline, estTimeout } = await import("../stay/deadline");
    try {
      return await withDeadline(altitudes(data.points), 25_000, "altitudes");
    } catch (err) {
      if (!estTimeout(err)) throw err;
      return data.points.map(() => null);
    }
  });
