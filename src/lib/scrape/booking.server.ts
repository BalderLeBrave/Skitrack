import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import type { Listing } from "@/lib/listings";
import { SCRAPE_UA, sleep } from "./browser.server";
import { allowsPath } from "./robots";
import type { LiveSearchInput } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));

function cliPath(): string | null {
  for (const candidate of [
    "/workspace/scrape/booking/cli.py",
    join(process.cwd(), "scrape/booking/cli.py"),
    join(HERE, "../../../../scrape/booking/cli.py"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function lastJsonObject(raw: string): unknown {
  const start = raw.lastIndexOf('{"ok"');
  const brace = start >= 0 ? start : raw.lastIndexOf("{");
  if (brace < 0) return null;
  try {
    return JSON.parse(raw.slice(brace));
  } catch {
    return null;
  }
}

function searchUrl(input: LiveSearchInput): string {
  const u = new URL("https://www.booking.com/searchresults.fr.html");
  u.searchParams.set("ss", `${input.stationName}, France`);
  u.searchParams.set("lang", "fr");
  u.searchParams.set("selected_currency", "EUR");
  u.searchParams.set("sb_price_type", "total");
  u.searchParams.set("checkin", input.checkIn);
  u.searchParams.set("checkout", input.checkOut);
  u.searchParams.set("group_adults", String(input.guests));
  u.searchParams.set("no_rooms", "1");
  u.searchParams.set("nflt", "ht_id=201;ht_id=213;ht_id=220;ht_id=222");
  return u.toString();
}

function plausible(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function fromPython(payload: unknown, input: LiveSearchInput): Listing[] {
  if (!payload || typeof payload !== "object") return [];
  const rows = (payload as { results?: unknown }).results;
  if (!Array.isArray(rows)) return [];
  const out: Listing[] = [];
  const seen = new Set<string>();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = String(row.sourceId ?? row.id ?? "");
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const total = typeof row.totalPrice === "number" ? Math.round(row.totalPrice) : null;
    if (!id || !title || total == null || seen.has(id)) continue;
    const guests = typeof row.guests === "number" && row.guests > 0 ? row.guests : null;
    const bedrooms = typeof row.bedrooms === "number" && row.bedrooms > 0 ? row.bedrooms : null;
    if (guests != null && guests < input.guests) continue;
    if (input.bedrooms > 0 && bedrooms != null && bedrooms < input.bedrooms) continue;
    seen.add(id);
    const images = Array.isArray(row.images) ? row.images : [];
    const lat = typeof row.latitude === "number" ? row.latitude : null;
    const lon = typeof row.longitude === "number" ? row.longitude : null;
    out.push({
      id: `bk-${id}`,
      stationId: input.stationId,
      title,
      source: "Booking",
      total,
      currency: "EUR",
      guests,
      bedrooms,
      available: true,
      photo: typeof images[0] === "string" ? images[0] : null,
      url: typeof row.url === "string" ? row.url : null,
      lat: plausible(lat, lon) ? lat : null,
      lon: plausible(lat, lon) ? lon : null,
      proven: `booking live ${input.checkIn}→${input.checkOut}`,
    });
  }
  return out.sort((a, b) => a.total - b.total);
}

async function spawnBooking(body: unknown, timeoutMs: number, input: LiveSearchInput): Promise<Listing[]> {
  const cli = cliPath();
  if (!cli) {
    console.warn("[booking] cli.py introuvable");
    return [];
  }
  const raw = await new Promise<{ out: string; err: string }>((resolve, reject) => {
    const child = spawn("python3", [cli], {
      env: { ...process.env, PYTHONPATH: dirname(cli), PYTHONUNBUFFERED: "1" },
      cwd: dirname(cli),
    });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("booking timeout"));
    }, timeoutMs);
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => errChunks.push(c));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve({
        out: Buffer.concat(chunks).toString("utf8").trim(),
        err: Buffer.concat(errChunks).toString("utf8").trim(),
      });
    });
    child.stdin.write(JSON.stringify(body));
    child.stdin.end();
  }).catch((err: unknown) => ({
    out: "",
    err: err instanceof Error ? err.message : String(err),
  }));
  if (!raw.out) {
    if (raw.err) console.warn("[booking] stderr", raw.err.slice(0, 400));
    return [];
  }
  const parsed = lastJsonObject(raw.out) as { ok?: boolean; error?: string } | null;
  if (!parsed || parsed.ok === false) {
    console.warn("[booking]", parsed && "error" in parsed ? parsed.error : "json illisible");
    return [];
  }
  return fromPython(parsed, input);
}

function pythonBody(input: LiveSearchInput, extra: Record<string, unknown> = {}) {
  return {
    destination: `${input.stationName}, France`,
    city: input.stationName,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults: input.guests,
    bedrooms: input.bedrooms,
    lat: input.lat,
    lon: input.lon,
    maxPages: 3,
    ...extra,
  };
}

export async function scrapeBookingPython(input: LiveSearchInput): Promise<Listing[]> {
  await allowsPath("https://www.booking.com", "/");
  return spawnBooking(pythonBody(input), 12_000, input);
}

function harvestCoordsFromHtml(html: string): Map<string, { lat: number; lon: number }> {
  const out = new Map<string, { lat: number; lon: number }>();
  const take = (id: string, lat: number, lon: number) => {
    if (!id || !plausible(lat, lon)) return;
    out.set(id, { lat, lon });
  };
  for (const m of html.matchAll(
    /data-hotel-id="(\d+)"[^>]{0,600}data-(?:atlas-latlng|coords)="\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*"/gi,
  )) {
    take(m[1], Number(m[2]), Number(m[3]));
  }
  for (const m of html.matchAll(
    /data-(?:atlas-latlng|coords)="\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*"[^>]{0,600}data-hotel-id="(\d+)"/gi,
  )) {
    take(m[3], Number(m[1]), Number(m[2]));
  }
  for (const m of html.matchAll(
    /(?:hotel_id|hotelId|propertyId|"id")\s*"?\s*[:=]\s*"?(\d{4,})"?[\s\S]{0,280}?"latitude"\s*:\s*(-?\d+\.\d+)[\s\S]{0,80}?"longitude"\s*:\s*(-?\d+\.\d+)/gi,
  )) {
    take(m[1], Number(m[2]), Number(m[3]));
  }
  return out;
}

function coordsFromHotelHtml(html: string): { lat: number; lon: number } | null {
  const atlas = html.match(/data-atlas-latlng="\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*"/i);
  if (atlas) {
    const lat = Number(atlas[1]);
    const lon = Number(atlas[2]);
    if (plausible(lat, lon)) return { lat, lon };
  }
  const geo = html.match(
    /"geo"\s*:\s*\{[^}]{0,240}"latitude"\s*:\s*"?(-?\d+\.\d+)"?[^}]{0,80}"longitude"\s*:\s*"?(-?\d+\.\d+)"?/i,
  );
  if (geo) {
    const lat = Number(geo[1]);
    const lon = Number(geo[2]);
    if (plausible(lat, lon)) return { lat, lon };
  }
  const bmap = html.match(
    /b_map_center_latitude["'\s:=]+(-?\d+\.\d+)[\s\S]{0,160}b_map_center_longitude["'\s:=]+(-?\d+\.\d+)/i,
  );
  if (bmap) {
    const lat = Number(bmap[1]);
    const lon = Number(bmap[2]);
    if (plausible(lat, lon)) return { lat, lon };
  }
  return null;
}

function applyCoords(listings: Listing[], bag: Map<string, { lat: number; lon: number }>): void {
  for (const row of listings) {
    if (plausible(row.lat, row.lon)) continue;
    const raw = row.id.replace(/^bk-/, "");
    const hit = bag.get(raw);
    if (hit) {
      row.lat = hit.lat;
      row.lon = hit.lon;
    }
  }
}

async function fillGpsFromHotelPages(page: Page, listings: Listing[]): Promise<void> {
  const missing = listings.filter((l) => !plausible(l.lat, l.lon) && l.url);
  for (const row of missing.slice(0, 12)) {
    try {
      await page.goto(row.url!, { waitUntil: "domcontentloaded", timeout: 20_000 });
      const html = await page.content();
      const gps = coordsFromHotelHtml(html);
      if (gps) {
        row.lat = gps.lat;
        row.lon = gps.lon;
      }
    } catch {
      /* fiche bloquée : on laisse non mesurée */
    }
  }
}

export async function scrapeBookingPlaywright(page: Page, input: LiveSearchInput): Promise<Listing[]> {
  const bag = new Map<string, { lat: number; lon: number }>();
  const onResponse = async (res: { url: () => string; headers: () => Record<string, string>; status: () => number; json: () => Promise<unknown> }) => {
    try {
      const url = res.url();
      if (!/booking\.com/.test(url)) return;
      const ct = res.headers()["content-type"] ?? "";
      if (!/json/i.test(ct) || res.status() !== 200) return;
      const data = await res.json().catch(() => null);
      const walk = (node: unknown): void => {
        if (node == null) return;
        if (Array.isArray(node)) {
          for (const x of node) walk(x);
          return;
        }
        if (typeof node !== "object") return;
        const rec = node as Record<string, unknown>;
        const loc = rec.location && typeof rec.location === "object" ? (rec.location as Record<string, unknown>) : rec;
        const lat = typeof loc.latitude === "number" ? loc.latitude : typeof rec.lat === "number" ? rec.lat : null;
        const lon =
          typeof loc.longitude === "number"
            ? loc.longitude
            : typeof rec.lng === "number"
              ? rec.lng
              : typeof rec.lon === "number"
                ? rec.lon
                : null;
        const hid = rec.id ?? rec.hotelId ?? rec.propertyId ?? rec.hotel_id;
        if (hid != null && plausible(lat, lon)) bag.set(String(hid), { lat: lat!, lon: lon! });
        for (const v of Object.values(rec)) walk(v);
      };
      walk(data);
    } catch {
      /* ignore */
    }
  };
  page.on("response", onResponse);
  try {
    await page.goto(searchUrl(input), { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page
      .locator("#onetrust-accept-btn-handler, button:has-text('Accepter'), button:has-text('Accept')")
      .first()
      .click({ timeout: 4_000 })
      .catch(() => null);
    await page.waitForSelector('[data-testid="property-card"], .sr_property_block', { timeout: 15_000 }).catch(() => null);
    const html = await page.content();
    for (const [k, v] of harvestCoordsFromHtml(html)) bag.set(k, v);
    let listings = await spawnBooking(pythonBody(input, { html }), 45_000, input);
    if (listings.length === 0) {
      listings = await cardsFromDom(page, input);
    }
    applyCoords(listings, bag);
    const still = listings.filter((l) => !plausible(l.lat, l.lon)).length;
    if (still > 0) await fillGpsFromHotelPages(page, listings);
    const gps = listings.filter((l) => plausible(l.lat, l.lon)).length;
    console.info(`[booking] playwright ${listings.length} dont ${gps} avec GPS`);
    return listings.sort((a, b) => a.total - b.total);
  } finally {
    page.off("response", onResponse);
  }
}

async function cardsFromDom(page: Page, input: LiveSearchInput): Promise<Listing[]> {
  const rows = await page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll('[data-testid="property-card"], [data-testid="property-card-container"]'),
    );
    return cards.map((card) => {
      const el = card as HTMLElement;
      const link = el.querySelector('a[href*="/hotel/"]') as HTMLAnchorElement | null;
      const title =
        (el.querySelector('[data-testid="title"], [data-testid="property-card-title"]') as HTMLElement | null)?.innerText ??
        link?.innerText ??
        "";
      const price =
        (el.querySelector('[data-testid="price-and-discounted-price"], [data-testid="price"]') as HTMLElement | null)
          ?.innerText ?? "";
      const img = el.querySelector("img") as HTMLImageElement | null;
      return {
        href: link?.href ?? "",
        title: title.trim(),
        price: price.trim(),
        photo: img?.src ?? "",
        hotelId: el.getAttribute("data-hotel-id") ?? "",
        lat: el.getAttribute("data-latitude") ?? el.getAttribute("data-lat") ?? "",
        lon: el.getAttribute("data-longitude") ?? el.getAttribute("data-lng") ?? "",
        atlas: el.getAttribute("data-atlas-latlng") ?? el.getAttribute("data-coords") ?? "",
      };
    });
  });
  const out: Listing[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const stay = row.price.match(/(\d[\d\s\u00a0.,]*)\s*€/);
    if (!stay || (/nuit/i.test(row.price) && !/total/i.test(row.price))) continue;
    const token = stay[1].replace(/[\s\u00a0\u202f.]/g, "").replace(",", ".");
    const total = Math.round(Number(token));
    if (!Number.isFinite(total) || total <= 0) continue;
    const id = row.hotelId || row.href;
    if (!id || !row.title || seen.has(id)) continue;
    seen.add(id);
    let lat = row.lat ? Number(row.lat) : null;
    let lon = row.lon ? Number(row.lon) : null;
    if ((!plausible(lat, lon)) && row.atlas.includes(",")) {
      const [a, b] = row.atlas.split(",");
      lat = Number(a);
      lon = Number(b);
    }
    out.push({
      id: `bk-${id}`,
      stationId: input.stationId,
      title: row.title,
      source: "Booking",
      total,
      currency: "EUR",
      guests: null,
      bedrooms: null,
      available: true,
      photo: row.photo || null,
      url: row.href || null,
      lat: plausible(lat, lon) ? lat : null,
      lon: plausible(lat, lon) ? lon : null,
      proven: `Booking live ${input.checkIn}→${input.checkOut}`,
    });
  }
  return out;
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

function bookingHit(entry: Record<string, unknown>): Record<string, unknown> | null {
  const hits = Array.isArray(entry.highlightedResults) ? entry.highlightedResults : [];
  for (const raw of hits) {
    if (!raw || typeof raw !== "object") continue;
    const h = raw as Record<string, unknown>;
    const blob = `${h.providerCode ?? ""} ${h.providerName ?? ""} ${h.deeplinkUrl ?? ""}`;
    if (/\bbooking(?:\.com)?\b/i.test(blob)) return h;
  }
  return null;
}

function parseCozyBooking(json: unknown, input: LiveSearchInput): Listing[] {
  if (!json || typeof json !== "object") return [];
  const list = Array.isArray((json as { entries?: unknown }).entries)
    ? ((json as { entries: unknown[] }).entries)
    : [];
  const out: Listing[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const h = bookingHit(e);
    if (!h) continue;
    const priceObj = h.totalPrice as Record<string, unknown> | undefined;
    if (priceObj?.indicative === true) continue;
    const stayRaw = priceObj?.value ?? h.eurPriceValue;
    const total = typeof stayRaw === "number" && stayRaw > 0 ? Math.round(stayRaw) : 0;
    if (total <= 0) continue;
    const name = typeof e.name === "string" ? e.name.replace(/\s+/g, " ").trim() : "";
    if (!name || isHotelOnly(name)) continue;
    const deeplink = typeof h.deeplinkUrl === "string" ? h.deeplinkUrl : "";
    if (!deeplink.includes("booking.com")) continue;
    const details = (e.subTitleDetails ?? {}) as Record<string, unknown>;
    const guests = typeof details.guestCapacity === "number" && details.guestCapacity > 0 ? details.guestCapacity : null;
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
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id: `bk-${id}`,
      stationId: input.stationId,
      title: name,
      source: "Booking",
      total,
      currency: "EUR",
      guests,
      bedrooms,
      available: true,
      photo: typeof first[0] === "string" ? first[0] : null,
      url: deeplink,
      lat: plausible(lat, lon) ? lat : null,
      lon: plausible(lat, lon) ? lon : null,
      proven: `CozyCozy Booking live ${input.checkIn}→${input.checkOut}`,
    });
  }
  return out;
}

function cozySearchUrl(input: LiveSearchInput): string {
  const n = input.stationName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const place =
    n.includes("deux alpes") || /(?:^|[^a-z0-9])2[\s-]?alpes(?:$|[^a-z0-9])/.test(n)
      ? "Les Deux Alpes station de ski, France"
      : /,\s*france\s*$/i.test(input.stationName)
        ? input.stationName.trim()
        : `${input.stationName.trim()}, France`;
  const rooms = Math.max(1, input.bedrooms);
  return `https://www.cozycozy.com/fr/search/${encodeURIComponent(place)}/${input.checkIn}/${input.checkOut}/${rooms}-${input.guests}-0/results`;
}

async function scrapeBookingCozy(page: Page, input: LiveSearchInput): Promise<Listing[]> {
  const payloads: unknown[] = [];
  const onRes = async (res: { url: () => string; json: () => Promise<unknown> }) => {
    if (!/\/api\/(getResultList|getResults)/.test(res.url())) return;
    try {
      payloads.push(await res.json());
    } catch {
      /* ignore */
    }
  };
  page.on("response", onRes);
  try {
    await page.goto(cozySearchUrl(input), { waitUntil: "domcontentloaded", timeout: 35_000 });
    const until = Date.now() + 12_000;
    while (payloads.length === 0 && Date.now() < until) await sleep(400);
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(600);
    }
  } finally {
    page.off("response", onRes);
  }
  const listings: Listing[] = [];
  const seen = new Set<string>();
  for (const p of payloads) {
    for (const row of parseCozyBooking(p, input)) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      listings.push(row);
    }
  }
  const gps = listings.filter((l) => plausible(l.lat, l.lon)).length;
  console.info(`[booking] cozy ${listings.length} dont ${gps} avec GPS`);
  return listings.sort((a, b) => a.total - b.total);
}

type PageOpener = () => Promise<Page>;

export async function scrapeBooking(input: LiveSearchInput, pageOrOpen?: Page | PageOpener): Promise<Listing[]> {
  let page: Page | undefined;
  if (typeof pageOrOpen === "function") page = await pageOrOpen();
  else page = pageOrOpen;
  if (page) {
    const cozy = await scrapeBookingCozy(page, input);
    if (cozy.length > 0) return cozy;
  }
  return scrapeBookingPython(input);
}
