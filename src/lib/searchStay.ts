import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { LiveSearchResult } from "./scrape/types";

const Input = z.object({
  stationId: z.string().min(1),
  stationName: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.number().int().min(1).max(30),
  bedrooms: z.number().int().min(0).max(20),
  part: z.enum(["airbnb", "gites", "cozy", "browser", "all"]).optional(),
});

export const searchStay = createServerFn({ method: "POST" })
  .validator(Input)
  .handler(async ({ data }): Promise<LiveSearchResult> => {
    const { runLiveSearch } = await import("./scrape/run.server");
    return runLiveSearch(data, data.part ?? "all");
  });
