import type { Page } from "playwright";
import type { Listing } from "@/lib/listings";
import { collectCozyPayloads, cozyListings } from "./cozy.server";
import type { LiveSearchInput } from "./types";

export async function scrapeAbritel(page: Page, input: LiveSearchInput): Promise<Listing[]> {
  const payloads = await collectCozyPayloads(page, input);
  return cozyListings(payloads, input, "Abritel");
}
