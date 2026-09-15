import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import type { Listing } from "@/lib/listings";
import { sleep } from "./browser.server.ts";
import { cozyListings, cozySearchUrl, rangPrix } from "./cozy.server.ts";
import { allowsPath } from "./robots.ts";
import type { LiveSearchInput } from "./types";
import { annoncer } from "../stay/occupancy.ts";

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

/**
 * Ce qui, dans le bloc d'offres d'une tuile, annonce le bien et non une chambre.
 *
 * Booking y écrit « Appartement entier · 3 chambres · 8 personnes » pour une
 * location, et « Chambre Double (2 personnes) » pour une offre de chambre. Le
 * mot « entier » est ce qui distingue les deux ; sans lui, on ne lit pas de
 * capacité là-dedans. Même règle que `ENTIRE_UNIT` dans `scrape/booking/map.py`.
 */
const LOGEMENT_ENTIER =
  /\b(?:logement|appartement|chalet|maison|villa|g[iî]te|studio|duplex|bungalow|cottage)\b[^•·|]{0,30}?\benti[eè]re?s?\b|\bentire\s+(?:home|house|apartment|apt|place|villa|chalet|bungalow|cottage|unit)\b/i;

function plausible(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/** Un décompte publié par `map.py`, ou `null`. Jamais un zéro de remplacement. */
function compte(v: unknown, min = 0): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  return n >= min && n <= 50 ? n : null;
}

/**
 * Les fiches rendues par `scrape/booking/map.py`.
 *
 * On n'y trie plus ni sur le prix ni sur la capacité : une tuile sans total de
 * séjour ressort à `total: 0`, c'est-à-dire « prix non publié », et une tuile
 * qui ne dit pas combien elle couche ressort à `null`. C'est le filtre de
 * l'écran qui décide, et qui compte ce qu'il masque.
 */
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
    if (!id || !title || seen.has(id)) continue;
    // `0` veut dire « total de séjour non publié », jamais « gratuit » : c'est
    // ce que `map.py` rend pour un « à partir de », un prix à la nuit ou une
    // tuile sans tarif, et ce que lit `availabilityOf`.
    const total =
      typeof row.totalPrice === "number" && Number.isFinite(row.totalPrice) && row.totalPrice > 0
        ? Math.round(row.totalPrice)
        : 0;
    const occ = annoncer(
      { guests: compte(row.guests, 1), bedrooms: compte(row.bedrooms), rooms: compte(row.rooms, 1) },
      title,
    );
    seen.add(id);
    // `map.py` ne rend qu'une vignette par tuile aujourd'hui, mais il en rend
    // un tableau : on le porte entier plutôt que d'en garder la première.
    const images = (Array.isArray(row.images) ? row.images : []).filter(
      (u): u is string => typeof u === "string" && /^https?:\/\//i.test(u),
    );
    const lat = typeof row.latitude === "number" ? row.latitude : null;
    const lon = typeof row.longitude === "number" ? row.longitude : null;
    out.push({
      id: `bk-${id}`,
      stationId: input.stationId,
      title,
      source: "Booking",
      total,
      currency: typeof row.currency === "string" && row.currency.trim() ? row.currency.trim() : "EUR",
      guests: occ.guests,
      bedrooms: occ.bedrooms,
      rooms: occ.rooms,
      // Type publié par Booking (index Apollo), relevé depuis toujours et
      // jamais porté sur l'annonce.
      propertyType: typeof row.propertyType === "string" ? row.propertyType.trim() || null : null,
      available: true,
      photo: images[0] ?? null,
      photos: images.length > 0 ? images : null,
      priceLabel: typeof row.priceLabel === "string" ? row.priceLabel.trim() || null : null,
      priceIndicative: row.priceIndicative === true ? true : null,
      url: typeof row.url === "string" ? row.url : null,
      lat: plausible(lat, lon) ? lat : null,
      lon: plausible(lat, lon) ? lon : null,
      proven: `booking live ${input.checkIn}→${input.checkOut}`,
    });
  }
  return out.sort((a, b) => rangPrix(a) - rangPrix(b));
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
    return listings.sort((a, b) => rangPrix(a) - rangPrix(b));
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
      const units =
        (el.querySelector('[data-testid="recommended-units"]') as HTMLElement | null)?.innerText ?? "";
      return {
        href: link?.href ?? "",
        title: title.trim(),
        price: price.trim(),
        photo: img?.src ?? "",
        hotelId: el.getAttribute("data-hotel-id") ?? "",
        lat: el.getAttribute("data-latitude") ?? el.getAttribute("data-lat") ?? "",
        lon: el.getAttribute("data-longitude") ?? el.getAttribute("data-lng") ?? "",
        atlas: el.getAttribute("data-atlas-latlng") ?? el.getAttribute("data-coords") ?? "",
        units: units.trim(),
      };
    });
  });
  const out: Listing[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const stay = row.price.match(/(\d[\d\s\u00a0.,]*)\s*€/);
    // Un prix à la nuit ou un « à partir de » n'est pas un total de séjour.
    // L'annonce sort quand même, à zéro — « prix non publié » au sens de
    // `Listing.total` — avec le libellé de la source et le drapeau qui le dit ;
    // elle disparaissait jusqu'ici sans laisser de trace.
    const nuitee = /nuit/i.test(row.price) && !/total/i.test(row.price);
    const aPartirDe = /(?:\u00e0|a)\s+partir\s+de/i.test(row.price);
    const token = stay ? stay[1].replace(/[\s\u00a0\u202f.]/g, "").replace(",", ".") : "";
    const montant = Math.round(Number(token));
    const ferme = !nuitee && !aPartirDe && Boolean(stay) && Number.isFinite(montant) && montant > 0;
    const total = ferme ? montant : 0;
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
    // Le bloc d'offres de la tuile annonce une chambre à vendre aussi souvent
    // qu'un logement : sa capacité n'est celle du bien que lorsqu'il dit
    // « entier ». Le texte entier de la tuile, lui, n'engage rien du tout, et
    // c'est pourtant lui qu'on lisait — un « Chambre Double (2 personnes) »
    // suffisait à écarter l'annonce d'une recherche à huit.
    const occu = annoncer(
      { guests: null, bedrooms: null },
      row.title,
      LOGEMENT_ENTIER.test(row.units) ? row.units : "",
    );
    out.push({
      id: `bk-${id}`,
      stationId: input.stationId,
      title: row.title,
      source: "Booking",
      total,
      currency: "EUR",
      guests: occu.guests,
      bedrooms: occu.bedrooms,
      rooms: occu.rooms,
      available: true,
      photo: row.photo || null,
      priceLabel: row.price || null,
      priceIndicative: !ferme && (nuitee || aPartirDe) ? true : null,
      url: row.href || null,
      lat: plausible(lat, lon) ? lat : null,
      lon: plausible(lat, lon) ? lon : null,
      proven: `Booking live ${input.checkIn}→${input.checkOut}`,
    });
  }
  return out.sort((a, b) => rangPrix(a) - rangPrix(b));
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
  // Le parseur de la porte CozyCozy, celui d'Abritel : cette fonction en tenait
  // une copie mot pour mot, avec les mêmes écarts — prix indicatif, prix
  // absent, capacité trop petite — et rien ne garantissait qu'on les corrige
  // des deux côtés. Une même charge ne se lit qu'une fois.
  const listings = cozyListings(payloads, input, "Booking");
  const gps = listings.filter((l) => plausible(l.lat, l.lon)).length;
  console.info(`[booking] cozy ${listings.length} dont ${gps} avec GPS`);
  return listings;
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
