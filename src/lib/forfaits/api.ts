import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { EtatSource } from "./sources";
import type { DomainForfait, ForfaitRow } from "./types";

/** Ce qu'un relevé rend par domaine : la ligne, la voie retenue, et l'issue. */
export type ResultatForfait = {
  row: ForfaitRow;
  source: EtatSource;
  issue: "maj" | "inchange" | "manuel" | "refus" | "echec" | "desactivee" | "ignore";
};

export const getForfait = createServerFn({ method: "POST" })
  .validator(z.object({ slug: z.string().min(1), refresh: z.boolean().optional() }))
  .handler(async ({ data }): Promise<ResultatForfait> => {
    const { getSource, getStored, refreshOne } = await import("./refresh.server");
    if (data.refresh) return refreshOne(data.slug, true);
    return { row: getStored(data.slug), source: getSource(data.slug), issue: "inchange" };
  });

/** Un lot de domaines. Le client le découpe lui-même pour pouvoir afficher une
 *  progression et interrompre entre deux lots. */
export const refreshForfaits = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slugs: z.array(z.string()).min(1).max(24),
      force: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }): Promise<ResultatForfait[]> => {
    const { refreshMany } = await import("./refresh.server");
    return refreshMany(data.slugs, data.force ?? false);
  });

/** Réactive une source désactivée par trois échecs, ou fermée par un refus. */
export const reactiverForfait = createServerFn({ method: "POST" })
  .validator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }): Promise<EtatSource> => {
    const { reactiverForfait: reactiver } = await import("./refresh.server");
    return reactiver(data.slug);
  });

export const listForfaits = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(
    async (): Promise<{ items: ForfaitRow[]; sources: EtatSource[]; lastSyncAt: string | null }> => {
      const { listSources, listStored, lastSyncAt } = await import("./refresh.server");
      return { items: listStored(), sources: listSources(), lastSyncAt: lastSyncAt() };
    },
  );

export const listForfaitDomains = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async (): Promise<DomainForfait[]> => {
    const { FORFAIT_CATALOG } = await import("./catalog");
    return FORFAIT_CATALOG.filter((d) => d.country === "FR");
  });
