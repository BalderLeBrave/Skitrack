import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import type { Listing } from "@/lib/listings";
import { SCRAPE_UA } from "./browser.server";
import type { LiveSearchInput } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));

function isDropped(text: string): boolean {
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (/chambre d[' ]?hotes|maison d[' ]?hotes|private[ _-]?room|chambre privee/.test(t)) return true;
  if (/^h[oô]tel\b|\bh[oô]tel\s*·/.test(t)) return true;
  return false;
}

function stayTotal(label: string | undefined): number | null {
  if (!label) return null;
  if (/(?:à|a)\s+partir\s+de/i.test(label)) return null;
  const stay =
    label.match(/(\d[\d\u00a0\u202f .,]*)\s*(?:€|&euro;)?\s*au\s+total/i) ||
    label.match(/(\d[\d\u00a0\u202f .,]*)\s*(?:€|&euro;)?\s*pour\s+\d+\s+nuits?/i) ||
    label.match(/total[^0-9]{0,16}(\d[\d\u00a0\u202f .,]*)/i);
  if (!stay?.[1]) return null;
  let token = stay[1].replace(/[\u00a0\u202f ]/g, "");
  const lastComma = token.lastIndexOf(",");
  const lastDot = token.lastIndexOf(".");
  if (lastComma > lastDot) token = token.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma) token = token.replace(/,/g, "");
  const n = Number(token);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function priceLabelOf(node: unknown): string | undefined {
  const labels: string[] = [];
  const rec = (value: unknown): void => {
    if (value == null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const label = record.accessibilityLabel;
    if (typeof label === "string" && label.includes("€")) labels.push(label);
    for (const key of Object.keys(record)) rec(record[key]);
  };
  rec(node);
  return (
    labels.find((l) => /au\s+total|pour\s+\d+\s+nuits?/i.test(l)) ??
    labels.find((l) => !/(?:à|a)\s+partir/i.test(l) && !/\/\s*nuit|par\s+nuit/i.test(l))
  );
}

function occupancy(record: Record<string, unknown>): { guests: number | null; bedrooms: number | null } {
  let guests: number | null = null;
  let bedrooms: number | null = null;
  const take = (n: unknown) => (typeof n === "number" && n > 0 && n <= 50 ? n : null);
  const walk = (value: unknown, depth: number) => {
    if (depth > 6 || value == null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const x of value) walk(x, depth + 1);
      return;
    }
    const r = value as Record<string, unknown>;
    guests = guests ?? take(r.personCapacity) ?? take(r.guestCapacity);
    bedrooms = bedrooms ?? take(r.bedroomCount) ?? take(r.bedrooms);
    const line = typeof r.subtitle === "string" ? r.subtitle : "";
    const bm = /(\d+)\s*chambres?/i.exec(line);
    if (!bedrooms && bm) bedrooms = Number(bm[1]);
    for (const k of Object.keys(r)) walk(r[k], depth + 1);
  };
  walk(record, 0);
  return { guests, bedrooms };
}

function numericId(encoded: string): string {
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const colon = decoded.lastIndexOf(":");
    return colon >= 0 ? decoded.slice(colon + 1) : decoded;
  } catch {
    return "";
  }
}

function extract(root: unknown, input: LiveSearchInput): Listing[] {
  const out: Listing[] = [];
  const seen = new Set<string>();
  const walk = (value: unknown): void => {
    if (value == null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const x of value) walk(x);
      return;
    }
    const record = value as Record<string, unknown>;
    if (record.__typename === "StaySearchResult") {
      const demand = (record.demandStayListing ?? {}) as Record<string, unknown>;
      const location = (demand.location ?? {}) as Record<string, unknown>;
      const coordinate = (location.coordinate ?? {}) as Record<string, unknown>;
      const id = typeof demand.id === "string" ? numericId(demand.id) : "";
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const sub = typeof record.subtitle === "string" ? record.subtitle.trim() : "";
      const name = title || sub;
      if (id && name && !isDropped(sub) && !isDropped(title) && !seen.has(id)) {
        seen.add(id);
        const total = stayTotal(priceLabelOf(record.structuredDisplayPrice));
        if (total != null) {
          const occ = occupancy(record);
          if (!(occ.guests != null && occ.guests < input.guests)) {
            if (!(input.bedrooms > 0 && occ.bedrooms != null && occ.bedrooms < input.bedrooms)) {
              const pictures = (record.contextualPictures ?? []) as Array<Record<string, unknown>>;
              const photo = pictures[0] && typeof pictures[0].picture === "string" ? pictures[0].picture : null;
              out.push({
                id: `abnb-${id}`,
                stationId: input.stationId,
                title: name,
                source: "Airbnb",
                total,
                currency: "EUR",
                guests: occ.guests,
                bedrooms: occ.bedrooms,
                available: true,
                photo,
                url: `https://www.airbnb.fr/rooms/${encodeURIComponent(id)}?check_in=${input.checkIn}&check_out=${input.checkOut}&adults=${input.guests}`,
                lat: typeof coordinate.latitude === "number" ? coordinate.latitude : null,
                lon: typeof coordinate.longitude === "number" ? coordinate.longitude : null,
                proven: `StaySearchResult live ${input.checkIn}→${input.checkOut}`,
              });
            }
          }
        }
      }
    }
    for (const k of Object.keys(record)) walk(record[k]);
  };
  walk(root);
  return out;
}

function searchUrl(input: LiveSearchInput): string {
  const dlat = 12 / 111;
  const dlng = 12 / (111 * Math.cos((input.lat * Math.PI) / 180));
  const u = new URL(
    `https://www.airbnb.fr/s/${encodeURIComponent(input.stationName.replace(/\s+/g, "-"))}/homes`,
  );
  u.searchParams.set("checkin", input.checkIn);
  u.searchParams.set("checkout", input.checkOut);
  u.searchParams.set("adults", String(input.guests));
  u.searchParams.set("ne_lat", String(input.lat + dlat));
  u.searchParams.set("ne_lng", String(input.lon + dlng));
  u.searchParams.set("sw_lat", String(input.lat - dlat));
  u.searchParams.set("sw_lng", String(input.lon - dlng));
  u.searchParams.set("search_by_map", "true");
  u.searchParams.set("room_types[]", "Entire home/apt");
  return u.toString();
}

function parseDeferred(text: string | null, input: LiveSearchInput): Listing[] {
  if (!text) return [];
  try {
    return extract(JSON.parse(text), input);
  } catch {
    return [];
  }
}

function cliPath(): string | null {
  for (const candidate of [
    "/workspace/scrape/airbnb/cli.py",
    join(process.cwd(), "scrape/airbnb/cli.py"),
    join(HERE, "../../../../scrape/airbnb/cli.py"),
    join(HERE, "../../../../../scrape/airbnb/cli.py"),
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

function fromPyairbnbPayload(payload: unknown, input: LiveSearchInput): Listing[] {
  if (!payload || typeof payload !== "object") return [];
  const listings = (payload as { listings?: unknown }).listings;
  if (!Array.isArray(listings)) return [];
  const out: Listing[] = [];
  const seen = new Set<string>();
  for (const raw of listings) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "string" || typeof row.id === "number" ? String(row.id) : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const label = typeof row.priceLabel === "string" ? row.priceLabel : "";
    const total =
      typeof row.total === "number" && row.total > 0 ? Math.round(row.total) : stayTotal(label);
    if (!id || !name || total == null || seen.has(id)) continue;
    if (isDropped(name) || isDropped(typeof row.subtitle === "string" ? row.subtitle : "")) continue;
    const guests = typeof row.guests === "number" && row.guests > 0 ? row.guests : null;
    const bedrooms = typeof row.bedrooms === "number" && row.bedrooms > 0 ? row.bedrooms : null;
    if (guests != null && guests < input.guests) continue;
    if (input.bedrooms > 0 && bedrooms != null && bedrooms < input.bedrooms) continue;
    seen.add(id);
    out.push({
      id: `abnb-${id}`,
      stationId: input.stationId,
      title: name,
      source: "Airbnb",
      total,
      currency: "EUR",
      guests,
      bedrooms,
      available: true,
      photo: typeof row.image === "string" ? row.image : null,
      url:
        typeof row.url === "string"
          ? row.url
          : `https://www.airbnb.fr/rooms/${encodeURIComponent(id)}?check_in=${input.checkIn}&check_out=${input.checkOut}&adults=${input.guests}`,
      lat: typeof row.lat === "number" ? row.lat : null,
      lon: typeof row.lon === "number" ? row.lon : null,
      proven: `pyairbnb live ${input.checkIn}→${input.checkOut}`,
    });
  }
  return out.sort((a, b) => a.total - b.total);
}

async function scrapeAirbnbPyairbnb(input: LiveSearchInput): Promise<Listing[]> {
  const cli = cliPath();
  if (!cli) {
    console.warn("[airbnb] cli.py introuvable");
    return [];
  }
  const python = process.env.SKITRACK_PYAIRBNB_PYTHON?.trim() || "python3";
  const body = JSON.stringify({
    city: input.stationName,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults: input.guests,
    bedrooms: input.bedrooms,
    lat: input.lat,
    lon: input.lon,
    maxPages: 3,
    skipEnrich: true,
  });
  const raw = await new Promise<{ out: string; err: string }>((resolve, reject) => {
    const child = spawn(python, [cli], {
      env: { ...process.env, PYTHONPATH: dirname(cli), PYTHONUNBUFFERED: "1" },
      cwd: dirname(cli),
    });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("pyairbnb timeout"));
    }, 45_000);
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
    child.stdin.write(body);
    child.stdin.end();
  }).catch((err: unknown) => {
    console.warn("[airbnb] spawn", err instanceof Error ? err.message : err);
    return { out: "", err: err instanceof Error ? err.message : String(err) };
  });
  if (!raw.out) {
    if (raw.err) console.warn("[airbnb] stderr", raw.err.slice(0, 500));
    return [];
  }
  const parsed = lastJsonObject(raw.out) as { ok?: boolean; payload?: unknown; error?: string } | null;
  if (!parsed || parsed.ok === false) {
    console.warn("[airbnb] py:", parsed && "error" in parsed ? parsed.error : "json illisible");
    return [];
  }
  return fromPyairbnbPayload(parsed.payload, input);
}

async function scrapeAirbnbFetch(input: LiveSearchInput): Promise<Listing[]> {
  const url = searchUrl(input);
  const html = await fetch(url, {
    headers: { "Accept-Language": "fr-FR", "User-Agent": SCRAPE_UA },
  })
    .then((r) => r.text())
    .catch(() => "");
  const text = html.match(/<script[^>]*id="data-deferred-state-0"[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? null;
  return parseDeferred(text, input).sort((a, b) => a.total - b.total);
}

export async function scrapeAirbnbPlaywright(page: Page, input: LiveSearchInput): Promise<Listing[]> {
  const url = searchUrl(input);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40_000 });
  await page.waitForSelector("#data-deferred-state-0", { timeout: 12_000 }).catch(() => null);
  const text = await page.locator("#data-deferred-state-0").textContent().catch(() => null);
  const listings = parseDeferred(text, input);
  if (listings.length > 0) return listings.sort((a, b) => a.total - b.total);
  return scrapeAirbnbFetch(input);
}

/** Chemin principal : pyairbnb isolé. Fetch HTML puis Playwright en repli. */
export async function scrapeAirbnb(
  input: LiveSearchInput,
  pageOrOpen?: Page | (() => Promise<Page>),
): Promise<Listing[]> {
  const viaPy = await scrapeAirbnbPyairbnb(input);
  if (viaPy.length > 0) {
    console.info(`[airbnb] pyairbnb ${viaPy.length}`);
    return viaPy;
  }
  const viaFetch = await scrapeAirbnbFetch(input);
  if (viaFetch.length > 0) {
    console.info(`[airbnb] fetch ${viaFetch.length}`);
    return viaFetch;
  }
  let page: Page | undefined;
  if (typeof pageOrOpen === "function") page = await pageOrOpen();
  else page = pageOrOpen;
  if (page) {
    const viaPw = await scrapeAirbnbPlaywright(page, input);
    console.info(`[airbnb] playwright ${viaPw.length}`);
    return viaPw;
  }
  console.warn("[airbnb] 0 logement (py, fetch, pas de navigateur)");
  return [];
}
