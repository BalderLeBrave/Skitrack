import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ForfaitRow } from "./types";
import type { DomainForfait } from "./types";

export const getForfait = createServerFn({ method: "POST" })
  .validator(z.object({ slug: z.string().min(1), refresh: z.boolean().optional() }))
  .handler(async ({ data }): Promise<ForfaitRow> => {
    const { getStored, refreshOne } = await import("./refresh.server");
    if (data.refresh) return refreshOne(data.slug, true);
    return getStored(data.slug);
  });

export const refreshForfaits = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slugs: z.array(z.string()).min(1).max(24),
      force: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }): Promise<ForfaitRow[]> => {
    const { refreshMany } = await import("./refresh.server");
    return refreshMany(data.slugs, data.force ?? false);
  });

export const listForfaits = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async (): Promise<{ items: ForfaitRow[]; lastSyncAt: string | null; ttlMs: number }> => {
    const { listStored, lastSyncAt, forfaitTtlMs } = await import("./refresh.server");
    return { items: listStored(), lastSyncAt: lastSyncAt(), ttlMs: forfaitTtlMs() };
  });

export const listForfaitDomains = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async (): Promise<DomainForfait[]> => {
    const { FORFAIT_CATALOG } = await import("./catalog");
    return FORFAIT_CATALOG.filter((d) => d.country === "FR");
  });
