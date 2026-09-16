import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import type { Listing } from "@/lib/listings";
import { airbnbCircuitOpen } from "@/lib/stay/airbnbCircuit.server";
import { SCRAPE_UA } from "./browser.server";
import { allowsPath } from "./robots";
import type { LiveSearchInput } from "./types";
import { annoncer, occupancyFromRecord, type Occupancy } from "@/lib/stay/occupancy";
import { assurerCles } from "../cles/store.server";

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

function priceLabels(node: unknown): string[] {
  const labels: string[] = [];
  const rec = (value: unknown): void => {
    if (value == null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const label = record.accessibilityLabel;
    if (typeof label === "string" && label.includes("€")) labels.push(label);
    for (const key of Object.keys(record)) rec(record[key]);
  };
  rec(node);
  return labels;
}

function priceLabelOf(node: unknown): string | undefined {
  const labels = priceLabels(node);
  return (
    labels.find((l) => /au\s+total|pour\s+\d+\s+nuits?/i.test(l)) ??
    labels.find((l) => !/(?:à|a)\s+partir/i.test(l) && !/\/\s*nuit|par\s+nuit/i.test(l))
  );
}

/**
 * Le libellé affiché, même quand ce n'est pas un total de séjour.
 *
 * `priceLabelOf` ne rend que ce qui peut porter un total ; une tuile qui
 * n'annonce qu'un prix par nuit ou un « à partir de » n'en a pas, et ses mots
 * disparaissaient avec l'annonce. Ils restent, à côté d'un `total` à 0.
 */
function publishedPriceLabel(node: unknown): string | undefined {
  return priceLabelOf(node) ?? priceLabels(node)[0];
}

/** Les lignes de `structuredContent` : « 6 lits », « 3 chambres ». */
function structuredLines(record: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const walk = (value: unknown, depth: number): void => {
    if (depth > 6 || value == null) return;
    if (Array.isArray(value)) {
      for (const x of value) walk(x, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    const rec = value as Record<string, unknown>;
    if (typeof rec.body === "string" && rec.body.trim()) lines.push(rec.body.trim());
    for (const v of Object.values(rec)) walk(v, depth + 1);
  };
  walk(record.structuredContent, 0);
  return lines;
}

function occupancy(record: Record<string, unknown>): Occupancy {
  const title = typeof record.title === "string" ? record.title : "";
  const sub = typeof record.subtitle === "string" ? record.subtitle : "";
  return annoncer(occupancyFromRecord(record), title, sub, ...structuredLines(record));
}

/**
 * « 6 lits » sur la tuile : un compte de lits, jamais un compte de voyageurs.
 *
 * La ligne était lue par le collecteur puis jetée, faute de champ pour la
 * recevoir ; `Listing.beds` la porte désormais, à côté de `guests`.
 */
function bedsFromText(...parts: Array<string | null | undefined>): number | null {
  const text = parts.filter((p) => p && p.trim()).join(" · ");
  const m = /(\d+)\s*-?\s*(?:lits?|beds?)\b/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 && n <= 50 ? n : null;
}

/**
 * Note et nombre d'avis, seulement quand la tuile les écrit.
 *
 * Lecture défensive, et assumée : aucune fixture du dépôt ne porte ces clés, et
 * la seule mention d'`avgRatingLocalized` vit dans `pyairbnb/standardize.py`,
 * code tiers que Skitrack n'exécute jamais — ce n'est pas une preuve. Rien de
 * publié, donc `null` : une note fabriquée serait pire qu'une note absente.
 */
function ratingOf(record: Record<string, unknown>): {
  rating: number | null;
  reviewCount: number | null;
} {
  let rating: number | null = null;
  let reviewCount: number | null = null;
  const brut = record.avgRating;
  if (typeof brut === "number" && Number.isFinite(brut) && brut > 0 && brut <= 5) {
    rating = Math.round(brut * 100) / 100;
  }
  const compte = record.reviewsCount;
  if (typeof compte === "number" && Number.isInteger(compte) && compte >= 0) reviewCount = compte;
  for (const key of ["avgRatingLocalized", "avgRatingA11yLabel"]) {
    const label = record[key];
    if (typeof label !== "string" || !label.trim()) continue;
    if (rating == null) {
      const m = /(\d(?:[.,]\d+)?)\s*(?:sur|\/|out of)\s*5\b/i.exec(label) ?? /^\s*(\d(?:[.,]\d+)?)\b/.exec(label);
      const n = m ? Number(m[1].replace(",", ".")) : NaN;
      if (Number.isFinite(n) && n > 0 && n <= 5) rating = Math.round(n * 100) / 100;
    }
    if (reviewCount == null) {
      // Pas de virgule dans un compte d'avis : l'accepter ferait lire « 525 »
      // dans « 4,92 sur 5, 25 commentaires ».
      const m =
        /(\d+(?:[\u00a0\u202f ]\d{3})*)\s*(?:commentaires?|avis|reviews?)\b/i.exec(label) ??
        /\(\s*(\d+(?:[\u00a0\u202f ]\d{3})*)\s*\)/.exec(label);
      if (m) {
        const n = Number(m[1].replace(/\D/g, ""));
        if (Number.isInteger(n) && n >= 0) reviewCount = n;
      }
    }
  }
  return { rating, reviewCount };
}

/**
 * Toutes les photos publiées par la tuile, dans l'ordre.
 *
 * `contextualPictures` en porte plusieurs et on n'en gardait qu'une. Sa
 * longueur n'est pas le nombre de photos du bien : la tuile n'en montre qu'un
 * aperçu, et ce total n'est publié nulle part ici.
 */
function photosOf(record: Record<string, unknown>): string[] {
  const pics = Array.isArray(record.contextualPictures) ? record.contextualPictures : [];
  const out: string[] = [];
  for (const pic of pics) {
    if (pic == null || typeof pic !== "object") continue;
    const url = (pic as Record<string, unknown>).picture;
    if (typeof url === "string" && url.trim() && !out.includes(url.trim())) out.push(url.trim());
  }
  return out;
}

/**
 * Le nom, même quand `title` est nul.
 *
 * L'API 2026 écrit le nom dans `nameLocalized` (fixture
 * `scrape/airbnb/test_map.py`, `test_stay_to_listing_forme_api_2026`). On ne
 * lisait que `title` puis `subtitle` : ces annonces-là sortaient sans nom,
 * donc pas du tout.
 */
function nestedName(node: unknown): string {
  if (typeof node === "string") return node.trim();
  if (node == null || typeof node !== "object") return "";
  const rec = node as Record<string, unknown>;
  for (const key of ["localizedStringWithTranslationPreference", "localizedString", "full", "name"]) {
    const value = rec[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const found = nestedName(value);
      if (found) return found;
    }
  }
  return "";
}

/**
 * Tri par prix : ce qui n'a pas de prix publié passe après ce qui en a un.
 *
 * `total: 0` veut dire « prix non publié », jamais « gratuit » : un tri
 * croissant brut rangeait ces annonces en tête, devant les moins chères
 * réellement relevées.
 */
function parPrix(a: Listing, b: Listing): number {
  const pa = a.total > 0 ? a.total : null;
  const pb = b.total > 0 ? b.total : null;
  if (pa == null && pb == null) return 0;
  if (pa == null) return 1;
  if (pb == null) return -1;
  return pa - pb;
}

/**
 * L'identifiant du bien, quelle que soit la forme publiée.
 *
 * `decode_listing_id` (scrape/airbnb/map.py) accepte déjà un entier et un
 * identifiant déjà numérique ; ici, tout ce qui n'était pas une chaîne partait
 * à la poubelle avec l'annonce, et une chaîne de chiffres était décodée en
 * base64 — ce qui rendait des octets arbitraires en guise d'identifiant.
 */
function numericId(encoded: unknown): string {
  if (typeof encoded === "number" && Number.isInteger(encoded) && encoded > 0) return String(encoded);
  if (typeof encoded !== "string" || !encoded) return "";
  if (/^\d+$/.test(encoded)) return encoded;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const colon = decoded.lastIndexOf(":");
    const tail = colon >= 0 ? decoded.slice(colon + 1) : decoded;
    return /^\d+$/.test(tail) ? tail : "";
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
      const id = numericId(demand.id) || numericId(record.propertyId);
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const sub = typeof record.subtitle === "string" ? record.subtitle.trim() : "";
      const name = title || nestedName(record.nameLocalized) || sub;
      if (id && name && !isDropped(sub) && !isDropped(title) && !seen.has(id)) {
        seen.add(id);
        const label = publishedPriceLabel(record.structuredDisplayPrice);
        // Airbnb liste sans total ce qu'il ne peut pas vendre à ces dates : on
        // supprimait ces annonces, ce qui effaçait l'information au lieu de la
        // dire. `0` est la convention « prix non publié » de `Listing.total`.
        const total = stayTotal(label) ?? 0;
        const occ = occupancy(record);
        const tropPetit = occ.guests != null && occ.guests < input.guests;
        const tropPeuDeChambres =
          input.bedrooms > 0 && occ.bedrooms != null && occ.bedrooms < input.bedrooms;
        if (!tropPetit && !tropPeuDeChambres) {
          const photos = photosOf(record);
          const { rating, reviewCount } = ratingOf(record);
          out.push({
            id: `abnb-${id}`,
            stationId: input.stationId,
            title: name,
            source: "Airbnb",
            total,
            currency: "EUR",
            guests: occ.guests,
            bedrooms: occ.bedrooms,
            rooms: occ.rooms,
            beds: bedsFromText(...structuredLines(record), name, sub),
            available: true,
            photo: photos[0] ?? null,
            photos: photos.length > 0 ? photos : null,
            priceLabel: label ?? null,
            priceIndicative: label ? /(?:à|a)\s+partir\s+de/i.test(label) : null,
            platformId: id,
            rating,
            reviewCount,
            url: `https://www.airbnb.fr/rooms/${encodeURIComponent(id)}?check_in=${input.checkIn}&check_out=${input.checkOut}&adults=${input.guests}`,
            lat: typeof coordinate.latitude === "number" ? coordinate.latitude : null,
            lon: typeof coordinate.longitude === "number" ? coordinate.longitude : null,
            proven: `StaySearchResult live ${input.checkIn}→${input.checkOut}`,
          });
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
    const sub = typeof row.subtitle === "string" ? row.subtitle : "";
    const label = typeof row.priceLabel === "string" ? row.priceLabel : "";
    // Le sidecar rend désormais les annonces qu'Airbnb liste sans prix, avec
    // `total: 0` ; les rejeter ici les aurait fait disparaître quand même.
    const total =
      typeof row.total === "number" && row.total > 0 ? Math.round(row.total) : (stayTotal(label) ?? 0);
    if (!id || !name || seen.has(id)) continue;
    if (isDropped(name) || isDropped(sub)) continue;
    const guests = typeof row.guests === "number" && row.guests > 0 ? row.guests : null;
    const bedrooms = typeof row.bedrooms === "number" && row.bedrooms >= 0 ? row.bedrooms : null;
    const rooms = typeof row.rooms === "number" && row.rooms > 0 ? row.rooms : null;
    const occ = annoncer({ guests, bedrooms, rooms }, name, sub);
    if (occ.guests != null && occ.guests < input.guests) continue;
    if (input.bedrooms > 0 && occ.bedrooms != null && occ.bedrooms < input.bedrooms) continue;
    seen.add(id);
    const photos = Array.isArray(row.photos)
      ? row.photos.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      : [];
    const image = typeof row.image === "string" ? row.image : null;
    out.push({
      id: `abnb-${id}`,
      stationId: input.stationId,
      title: name,
      source: "Airbnb",
      total,
      currency: "EUR",
      guests: occ.guests,
      bedrooms: occ.bedrooms,
      rooms: occ.rooms,
      beds: typeof row.beds === "number" && row.beds > 0 ? Math.trunc(row.beds) : bedsFromText(name, sub),
      available: true,
      photo: image ?? photos[0] ?? null,
      photos: photos.length > 0 ? photos : null,
      priceLabel: label || null,
      priceIndicative: typeof row.priceIndicative === "boolean" ? row.priceIndicative : null,
      platformId: id,
      rating: typeof row.rating === "number" && row.rating > 0 && row.rating <= 5 ? row.rating : null,
      reviewCount:
        typeof row.reviewCount === "number" && Number.isInteger(row.reviewCount) && row.reviewCount >= 0
          ? row.reviewCount
          : null,
      url:
        typeof row.url === "string"
          ? row.url
          : `https://www.airbnb.fr/rooms/${encodeURIComponent(id)}?check_in=${input.checkIn}&check_out=${input.checkOut}&adults=${input.guests}`,
      lat: typeof row.lat === "number" ? row.lat : null,
      lon: typeof row.lon === "number" ? row.lon : null,
      proven: `pyairbnb live ${input.checkIn}→${input.checkOut}`,
    });
  }
  return out.sort(parPrix);
}

async function scrapeAirbnbPyairbnb(input: LiveSearchInput): Promise<{ listings: Listing[]; rateLimited: boolean }> {
  if (airbnbCircuitOpen()) {
    console.warn("[airbnb] coupe-circuit ouvert — pas d'appel");
    return { listings: [], rateLimited: true };
  }
  const cli = cliPath();
  if (!cli) {
    console.warn("[airbnb] cli.py introuvable");
    return { listings: [], rateLimited: false };
  }
  // Les clés saisies dans Plus › Clés sont versées dans l'environnement avant
  // cette lecture : sans cet appel, le chemin renseigné n'existait que pour
  // l'écran qui l'avait reçu.
  assurerCles();
  const python = process.env.SKITRACK_PYAIRBNB_PYTHON?.trim() || "python3";
  const body = JSON.stringify({
    city: input.stationName,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults: input.guests,
    bedrooms: input.bedrooms,
    lat: input.lat,
    lon: input.lon,
    // Airbnb ne publie aucun nombre de résultats : `paginationInfo` ne porte
    // que des curseurs (voir `_search_pages` dans scrape/airbnb/stays.py).
    // Trois pages n'étaient donc pas un total atteint, seulement une coupe, et
    // une station bien pourvue perdait tout ce qui venait après. Le sidecar
    // s'arrête de lui-même quand une page n'apporte plus rien de neuf ou qu'il
    // n'y a plus de curseur : cette borne n'est qu'un garde-fou assumé.
    maxPages: 24,
    skipEnrich: true,
    maxEnrich: 0,
  });
  const raw = await new Promise<{ out: string; err: string }>((resolve, reject) => {
    const child = spawn(python, [cli], {
      env: { ...process.env, PYTHONPATH: dirname(cli), PYTHONUNBUFFERED: "1" },
      cwd: dirname(cli),
    });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    // Le sidecar borne lui-même sa pagination à `PAGE_BUDGET_S` puis enrichit
    // les fiches incomplètes (PDP). Un 429 interrompt sans tuer ce qui est lu.
    // Ce couperet reste au-dessus du budget interne.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("pyairbnb timeout"));
    }, 95_000);
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
    return { listings: [], rateLimited: /429/.test(raw.err) };
  }
  const parsed = lastJsonObject(raw.out) as {
    ok?: boolean;
    payload?: unknown;
    error?: string;
    rateLimited?: boolean;
  } | null;
  if (!parsed) {
    console.warn("[airbnb] py: json illisible");
    return { listings: [], rateLimited: false };
  }
  const rateLimited = Boolean(parsed.rateLimited) || /429|503/.test(String(parsed.error ?? ""));
  const listings = fromPyairbnbPayload(parsed.payload, input);
  if (parsed.ok === false && listings.length === 0) {
    console.warn("[airbnb] py:", parsed.error ?? "json illisible", rateLimited ? "· 429" : "");
    return { listings: [], rateLimited };
  }
  return { listings, rateLimited };
}

async function scrapeAirbnbFetch(input: LiveSearchInput): Promise<Listing[]> {
  const url = searchUrl(input);
  const res = await fetch(url, {
    headers: { "Accept-Language": "fr-FR", "User-Agent": SCRAPE_UA },
  }).catch(() => null);
  if (!res) return [];
  if (res.status === 429 || res.status === 503) {
    console.warn(`[airbnb] fetch HTTP ${res.status}`);
    return [];
  }
  const html = await res.text().catch(() => "");
  const text = html.match(/<script[^>]*id="data-deferred-state-0"[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? null;
  return parseDeferred(text, input).sort(parPrix);
}

export async function scrapeAirbnbPlaywright(page: Page, input: LiveSearchInput): Promise<Listing[]> {
  const url = searchUrl(input);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40_000 });
  await page.waitForSelector("#data-deferred-state-0", { timeout: 12_000 }).catch(() => null);
  const text = await page.locator("#data-deferred-state-0").textContent().catch(() => null);
  const listings = parseDeferred(text, input);
  if (listings.length > 0) return listings.sort(parPrix);
  return scrapeAirbnbFetch(input);
}

export type AirbnbScrape = { listings: Listing[]; rateLimited: boolean };

/**
 * Chemin principal : pyairbnb isolé. Fetch HTML puis Playwright en repli,
 * sauf après un 429 — le même refus se reproduirait.
 */
export async function scrapeAirbnbDetailed(
  input: LiveSearchInput,
  pageOrOpen?: Page | (() => Promise<Page>),
): Promise<AirbnbScrape> {
  await allowsPath("https://www.airbnb.fr", "/");
  const viaPy = await scrapeAirbnbPyairbnb(input);
  if (viaPy.listings.length > 0) {
    console.info(`[airbnb] pyairbnb ${viaPy.listings.length}${viaPy.rateLimited ? " · 429 partiel" : ""}`);
    return viaPy;
  }
  if (viaPy.rateLimited) {
    console.warn("[airbnb] 429 — pas de repli HTML");
    return { listings: [], rateLimited: true };
  }
  const viaFetch = await scrapeAirbnbFetch(input);
  if (viaFetch.length > 0) {
    console.info(`[airbnb] fetch ${viaFetch.length}`);
    return { listings: viaFetch, rateLimited: false };
  }
  let page: Page | undefined;
  if (typeof pageOrOpen === "function") page = await pageOrOpen();
  else page = pageOrOpen;
  if (page) {
    const viaPw = await scrapeAirbnbPlaywright(page, input);
    console.info(`[airbnb] playwright ${viaPw.length}`);
    return { listings: viaPw, rateLimited: false };
  }
  console.warn("[airbnb] 0 logement (py, fetch, pas de navigateur)");
  return { listings: [], rateLimited: false };
}

export async function scrapeAirbnb(
  input: LiveSearchInput,
  pageOrOpen?: Page | (() => Promise<Page>),
): Promise<Listing[]> {
  return (await scrapeAirbnbDetailed(input, pageOrOpen)).listings;
}
