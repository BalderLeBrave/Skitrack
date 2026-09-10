import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SkiinfoLive } from "./skiinfoStore";

export const getSkiinfo = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1), refresh: z.boolean().optional() }))
  .handler(async ({ data }): Promise<SkiinfoLive> => {
    const { getStoredSkiinfo, refreshSkiinfo } = await import("./skiinfoRefresh.server");
    if (data.refresh) return refreshSkiinfo(data.id, true);
    return getStoredSkiinfo(data.id);
  });

export const refreshSkiinfoBatch = createServerFn({ method: "POST" })
  .validator(z.object({ ids: z.array(z.string()).min(1).max(12), force: z.boolean().optional() }))
  .handler(async ({ data }): Promise<SkiinfoLive[]> => {
    const { refreshSkiinfoMany } = await import("./skiinfoRefresh.server");
    return refreshSkiinfoMany(data.ids, data.force ?? false);
  });
