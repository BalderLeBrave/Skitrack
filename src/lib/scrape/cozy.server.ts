import type { Page } from "playwright";
import type { Listing } from "@/lib/listings";
import { sleep } from "./browser.server";
import type { LiveSearchInput } from "./types";

function datedPlace(name: string): string {
  const n = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (n.includes("deux alpes") || /(?:^|[^a-z0-9])2[\s-]?alpes(?:$|[^a-z0-9])/.test(n)) {
    return "Les Deux Alpes station de ski, France";
  }
  return /,\s*france\s*$/i.test(name) ? name.trim() : `${name.trim()}, France`;
}

export function cozySearchUrl(input: LiveSearchInput): string {
  const rooms = Math.max(1, input.bedrooms);
  const place = encodeURIComponent(datedPlace(input.stationName));
  return `https://www.cozycozy.com/fr/search/${place}/${input.checkIn}/${input.checkOut}/${rooms}-${input.guests}-0/results`;
}

function httpUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  return null;
}

function isVrbo(blob: string): boolean {
  return /\b(abritel|vrbo|homeaway)\b/i.test(blob);
}

function isBooking(blob: string): boolean {
  return /\bbooking(?:\.com)?\b/i.test(blob);
}

function isHotelOnly(title: string): boolean {
  const t = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (/chambre d[' ]?hotes|maison d[' ]?hotes|private[ _-]?room/.test(t)) return true;
  if (/^h[oô]tel\b/.test(t) && !/appartement|chalet|maison|villa|residence|gite/.test(t)) return true;
  return false;
}

function providerHit(entry: Record<string, unknown>, kind: "abritel" | "booking"): Record<string, unknown> | null {
  const hits = Array.isArray(entry.highlightedResults) ? entry.highlightedResults : [];
  for (const raw of hits) {
    if (!raw || typeof raw !== "object") continue;
    const h = raw as Record<string, unknown>;
    const blob = `${h.providerCode ?? ""} ${h.providerName ?? ""} ${h.deeplinkUrl ?? ""}`;
    if (kind === "abritel" ? isVrbo(blob) : isBooking(blob)) return h;
  }
  if (kind === "abritel" && entry.provider && typeof entry.provider === "object") {
    const h = entry.provider as Record<string, unknown>;
    const blob = `${h.providerCode ?? ""} ${h.providerName ?? ""} ${h.deeplinkUrl ?? ""}`;
    if (isVrbo(blob)) return h;
  }
  return null;
}

function canonicalAbritel(deeplink: string, input: LiveSearchInput): string {
  const m = deeplink.match(/destination:(https:\/\/(?:www\.)?(?:abritel\.fr|vrbo\.com)[^&\s]+)/i);
  const raw = m ? decodeURIComponent(m[1]) : deeplink;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "vrbo.com" || host === "abritel.fr") u.hostname = "www.abritel.fr";
    for (const k of ["mpd", "mpe", "mpb", "mpa", "mpq", "label", "camref"]) u.searchParams.delete(k);
    u.searchParams.set("startDate", input.checkIn);
    u.searchParams.set("chkin", input.checkIn);
    u.searchParams.set("endDate", input.checkOut);
    u.searchParams.set("chkout", input.checkOut);
    u.searchParams.set("adults", String(input.guests));
    return u.toString();
  } catch {
    return raw;
  }
}

function entryCount(payloads: unknown[]): number {
  let n = 0;
  for (const p of payloads) {
    if (p && typeof p === "object" && Array.isArray((p as { entries?: unknown }).entries)) {
      n += (p as { entries: unknown[] }).entries.length;
    }
  }
  return n;
}

type CozyFilters = {
  noBounds: boolean;
  price: [number, number];
  instantBooking: boolean;
  combinedTypeCodes: unknown[];
  starRatings: unknown[];
  minRating: number;
  ratingRequired: boolean;
  amenityCodes: unknown[];
  providerCodes: string[];
  minBedRoomCount: number;
  minBathRoomCount: number;
  cityCodes: unknown[];
  areaCodes: unknown[];
  minResponseTime: null;
  updateBounds: boolean;
  breakfast: boolean;
  minCancellationCategory: number;
};

function entriesOf(json: unknown): unknown[] {
  if (!json || typeof json !== "object") return [];
  const list = (json as { entries?: unknown }).entries;
  return Array.isArray(list) ? list : [];
}

async function pullProviders(
  page: Page,
  searchId: string,
  filters: Omit<CozyFilters, "providerCodes">,
): Promise<{ abritel: unknown; booking: unknown }> {
  return page.evaluate(
    async ({ sid, base }) => {
      const once = (codes: string[]) =>
        fetch("/api/getResultList", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            searchId: sid,
            sorting: "ranking",
            offset: 0,
            count: 40,
            filters: { ...base, providerCodes: codes },
            estimateBounds: null,
            processNewResults: true,
            columnCount: 3,
            excludeAds: false,
            prefixAccommodationIds: [],
          }),
        }).then((r) => r.json());
      const [abritel, booking] = await Promise.all([once(["abritel"]), once(["booking"])]);
      return { abritel, booking };
    },
    { sid: searchId, base: filters },
  );
}

/** Un aller CozyCozy. Abritel et Booking sont demandés à l’API, sans défiler. */
export async function collectCozyPayloads(page: Page, input: LiveSearchInput): Promise<unknown[]> {
  const payloads: unknown[] = [];
  let searchId: string | null = null;
  const onReq = (req: { url: () => string; postData: () => string | null }) => {
    if (!/\/api\/launch/.test(req.url())) return;
    try {
      const body = JSON.parse(req.postData() || "{}") as { searchId?: string };
      if (typeof body.searchId === "string") searchId = body.searchId;
    } catch {
      /* ignore */
    }
  };
  page.on("request", onReq);
  try {
    await page.goto(cozySearchUrl(input), { waitUntil: "domcontentloaded", timeout: 20_000 });
    const untilId = Date.now() + 10_000;
    while (!searchId && Date.now() < untilId) await sleep(40);
    if (!searchId) {
      console.warn("[cozy] pas de searchId");
      return payloads;
    }
    const base: Omit<CozyFilters, "providerCodes"> = {
      noBounds: true,
      price: [-0.5, 9007199254740991],
      instantBooking: true,
      combinedTypeCodes: [],
      starRatings: [],
      minRating: 0,
      ratingRequired: false,
      amenityCodes: [],
      minBedRoomCount: Math.max(0, input.bedrooms),
      minBathRoomCount: 0,
      cityCodes: [],
      areaCodes: [],
      minResponseTime: null,
      updateBounds: false,
      breakfast: false,
      minCancellationCategory: 0,
    };
    let abritel: unknown = null;
    let booking: unknown = null;
    let stagnant = 0;
    const readyUntil = Date.now() + 10_000;
    while (Date.now() < readyUntil) {
      const pair = await pullProviders(page, searchId, base);
      const aN = entriesOf(pair.abritel).length;
      const bN = entriesOf(pair.booking).length;
      if (aN > 0) abritel = pair.abritel;
      if (bN > 0) booking = pair.booking;
      if (aN > 0 && bN > 0) break;
      const processed = Math.max(
        Number((pair.abritel as { processedResultCount?: number } | null)?.processedResultCount ?? 0),
        Number((pair.booking as { processedResultCount?: number } | null)?.processedResultCount ?? 0),
      );
      if (processed > 80 && (abritel || booking)) {
        stagnant += 1;
        if (stagnant >= 2) break;
      }
      await sleep(280);
    }
    if (abritel) payloads.push(abritel);
    if (booking) payloads.push(booking);
    console.info(`[cozy] ${payloads.length} paquets · ${entryCount(payloads)} fiches`);
  } finally {
    page.off("request", onReq);
  }
  return payloads;
}

export function cozyListings(
  payloads: unknown[],
  input: LiveSearchInput,
  source: "Abritel" | "Booking",
): Listing[] {
  const kind = source === "Abritel" ? "abritel" : "booking";
  const out: Listing[] = [];
  const seen = new Set<string>();
  for (const json of payloads) {
    if (!json || typeof json !== "object") continue;
    const list = Array.isArray((json as { entries?: unknown }).entries)
      ? ((json as { entries: unknown[] }).entries)
      : [];
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw as Record<string, unknown>;
      const h = providerHit(e, kind);
      if (!h) continue;
      const priceObj = h.totalPrice as Record<string, unknown> | undefined;
      if (priceObj?.indicative === true) continue;
      const stayRaw = priceObj?.value ?? h.eurPriceValue;
      const total = typeof stayRaw === "number" && stayRaw > 0 ? Math.round(stayRaw) : 0;
      if (total <= 0) continue;
      const name = typeof e.name === "string" ? e.name.replace(/\s+/g, " ").trim() : "";
      if (!name) continue;
      if (kind === "booking" && isHotelOnly(name)) continue;
      const deeplink = typeof h.deeplinkUrl === "string" ? h.deeplinkUrl : "";
      if (!deeplink) continue;
      if (kind === "booking" && !deeplink.includes("booking.com")) continue;
      const details = (e.subTitleDetails ?? {}) as Record<string, unknown>;
      const guests =
        typeof details.guestCapacity === "number" && details.guestCapacity > 0 ? details.guestCapacity : null;
      const bedrooms =
        typeof details.bedRoomCount === "number" && details.bedRoomCount > 0
          ? details.bedRoomCount
          : typeof h.bedRoomCount === "number" && h.bedRoomCount > 0
            ? h.bedRoomCount
            : null;
      if (guests != null && guests < input.guests) continue;
      if (input.bedrooms > 0 && bedrooms != null && bedrooms < input.bedrooms) continue;
      const coords = (e.coordinates ?? {}) as Record<string, unknown>;
      const lat = typeof coords.latitude === "number" ? coords.latitude : null;
      const lon = typeof coords.longitude === "number" ? coords.longitude : null;
      const thumbs = (e.lightThumbnails ?? {}) as Record<string, unknown>;
      const first = Array.isArray(thumbs.firstUrls) ? thumbs.firstUrls : [];
      const id = String(e.accommodationId ?? h.accommodationId ?? deeplink);
      const listingId = kind === "booking" ? `bk-${id}` : `abr-${id}`;
      if (seen.has(listingId)) continue;
      seen.add(listingId);
      out.push({
        id: listingId,
        stationId: input.stationId,
        title: name,
        source,
        total,
        currency: "EUR",
        guests,
        bedrooms,
        available: true,
        photo: httpUrl(first[0]) ?? httpUrl(e.photo),
        url: kind === "abritel" ? canonicalAbritel(deeplink, input) : deeplink,
        lat,
        lon,
        proven: `CozyCozy ${source} live ${input.checkIn}→${input.checkOut}`,
      });
    }
  }
  return out.sort((a, b) => a.total - b.total);
}
