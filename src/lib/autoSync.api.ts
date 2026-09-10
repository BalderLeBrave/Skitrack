import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SyncTick } from "./autoSync.server";

export const tickAutoSync = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async (): Promise<SyncTick> => {
    const { tickAutoSync: tick } = await import("./autoSync.server");
    return tick();
  });
