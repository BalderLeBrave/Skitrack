import type { Page } from "playwright";
import type { Listing } from "@/lib/listings";
import { RELEVE_2A } from "@/lib/listings";
import { attachAccess } from "@/lib/access";
import { stationById } from "@/lib/stations";
import { withBrowser } from "./browser.server";
import { scrapeGites } from "./gites.server";
import { scrapeAirbnb } from "./airbnb.server";
import { scrapeBookingPlaywright, scrapeBookingPython } from "./booking.server";
import { fillBookingGps } from "./bookingGps.server";
import { fillGitesGps } from "./gitesGps.server";
import { collectCozyPayloads, cozyListings } from "./cozy.server";
import { allowsPath } from "./robots";
import { chercherCentrale } from "./centrales/chercher.server";
import type { LiveSearchInput, LiveSearchResult, SourceReport } from "./types";

export type SearchPart = "airbnb" | "gites" | "cozy" | "centrales" | "browser" | "all";

function dumpFallback(input: LiveSearchInput, allow: Set<string>): Listing[] {
  if (
    input.stationId !== "les-2-alpes" ||
    input.checkIn !== "2027-02-06" ||
    input.checkOut !== "2027-02-13"
  ) {
    return [];
  }
  return RELEVE_2A.filter((l) => {
    if (!allow.has(l.source)) return false;
    if (l.guests != null && l.guests < input.guests) return false;
    if (input.bedrooms > 0 && l.bedrooms != null && l.bedrooms < input.bedrooms) return false;
    return true;
  });
}

const AIRBNB_SOURCES = ["Airbnb"] as const;
const GITES_SOURCES = ["Gîtes de France"] as const;
const COZY_SOURCES = ["Abritel", "Booking"] as const;
const BROWSER_SOURCES = ["Gîtes de France", "Abritel", "Booking"] as const;
const CENTRALE_SOURCES = ["Centrale"] as const;

function locate(input: LiveSearchInput, listings: Listing[]): Listing[] {
  const station = stationById(input.stationId);
  const located = station ? listings.map((l) => attachAccess(l, station)) : listings;
  located.sort((a, b) => a.total - b.total);
  return located;
}

function pushReport(
  reports: SourceReport[],
  listings: Listing[],
  source: SourceReport["source"],
  rows: Listing[],
  ms: number,
) {
  reports.push({ source, ok: true, count: rows.length, ms });
  listings.push(...rows);
  console.info(`[scrape] ${source} ${rows.length} en ${ms}ms`);
}

async function recordInto(
  reports: SourceReport[],
  listings: Listing[],
  source: SourceReport["source"],
  run: () => Promise<Listing[]>,
) {
  const t0 = Date.now();
  try {
    const rows = await run();
    pushReport(reports, listings, source, rows, Date.now() - t0);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    reports.push({ source, ok: false, count: 0, ms: Date.now() - t0, error });
    console.warn(`[scrape] ${source} échec: ${error}`);
  }
}

function applyDump(input: LiveSearchInput, reports: SourceReport[], listings: Listing[], allow: Set<string>) {
  const liveSources = new Set(reports.filter((r) => r.ok && r.count > 0).map((r) => r.source));
  for (const row of dumpFallback(input, allow)) {
    if (liveSources.has(row.source)) continue;
    listings.push({
      ...row,
      proven: `${row.proven} — repli relevé 3 sept. (live vide ou non branché)`,
    });
    liveSources.add(row.source);
  }
}

async function fillGitesIfNeeded(listings: Listing[]) {
  if (!listings.some((l) => l.source === "Gîtes de France" && (l.lat == null || l.lon == null))) return;
  try {
    await fillGitesGps(listings);
  } catch (err) {
    console.warn("[gites-gps]", err instanceof Error ? err.message : err);
  }
}

async function fillCozy(page: Page, input: LiveSearchInput, reports: SourceReport[], listings: Listing[]) {
  const t0 = Date.now();
  const payloads = await collectCozyPayloads(page, input);
  const collectMs = Date.now() - t0;
  const abritel = cozyListings(payloads, input, "Abritel");
  const fromCozy = cozyListings(payloads, input, "Booking");
  pushReport(reports, listings, "Abritel", abritel, collectMs);
  let booking = fromCozy;
  if (booking.length === 0) booking = await scrapeBookingPython(input);
  if (booking.length === 0) booking = await scrapeBookingPlaywright(page, input);
  if (booking.some((l) => l.lat == null || l.lon == null)) {
    await fillBookingGps(page, booking);
  }
  pushReport(reports, listings, "Booking", booking, booking === fromCozy ? collectMs : Date.now() - t0);
  const gpsA = abritel.filter((l) => l.lat != null && l.lon != null).length;
  const gpsB = booking.filter((l) => l.lat != null && l.lon != null).length;
  console.info(`[cozy] GPS Abritel ${gpsA}/${abritel.length} · Booking ${gpsB}/${booking.length}`);
}

async function runAirbnb(input: LiveSearchInput): Promise<LiveSearchResult> {
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];
  await recordInto(reports, listings, "Airbnb", () => scrapeAirbnb(input));
  applyDump(input, reports, listings, new Set(AIRBNB_SOURCES));
  return { listings: locate(input, listings), sources: reports };
}

async function runGites(input: LiveSearchInput): Promise<LiveSearchResult> {
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];
  try {
    await withBrowser(async (open) => {
      await recordInto(reports, listings, "Gîtes de France", async () => scrapeGites(await open(), input));
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!reports.some((r) => r.source === "Gîtes de France")) {
      reports.push({ source: "Gîtes de France", ok: false, count: 0, ms: 0, error: msg });
    }
  }
  applyDump(input, reports, listings, new Set(GITES_SOURCES));
  await fillGitesIfNeeded(listings);
  return { listings: locate(input, listings), sources: reports };
}

async function runCozy(input: LiveSearchInput): Promise<LiveSearchResult> {
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];
  try {
    await withBrowser(async (open) => {
      await fillCozy(await open(), input, reports, listings);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    for (const source of COZY_SOURCES) {
      if (!reports.some((r) => r.source === source)) {
        reports.push({ source, ok: false, count: 0, ms: 0, error: msg });
      }
    }
  }
  applyDump(input, reports, listings, new Set(COZY_SOURCES));
  return { listings: locate(input, listings), sources: reports };
}

/**
 * La centrale officielle de la station.
 *
 * Une station, une centrale, et une seule requête : ce n'est pas une plateforme
 * qu'on interroge partout, c'est l'office de tourisme de l'endroit.
 * `chercherCentrale` dit lui-même s'il a pu appeler, et pourquoi quand il n'a
 * pas pu ; cette raison devient le champ `error` du rapport de source, que
 * l'écran écrit au lieu d'un vide.
 *
 * `ok` sépare les deux zéros : vrai quand la centrale a répondu sans rien avoir
 * de libre, faux quand elle n'a pas été appelée du tout. Le repli sur le relevé
 * figé se déclenche sur le second, ce qui est voulu — une station dont la
 * centrale n'est pas branchée garde ce qu'on avait relevé d'elle à la main.
 */
async function runCentrales(input: LiveSearchInput): Promise<LiveSearchResult> {
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];
  const t0 = Date.now();
  try {
    const res = await chercherCentrale(input);
    reports.push({
      source: "Centrale",
      ok: res.interrogee,
      count: res.listings.length,
      ms: Date.now() - t0,
      ...(res.raison ? { error: res.raison } : {}),
    });
    listings.push(...res.listings);
    console.info(`[centrale] ${res.nom ?? "aucune"} ${res.listings.length} en ${Date.now() - t0}ms`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    reports.push({ source: "Centrale", ok: false, count: 0, ms: Date.now() - t0, error });
    console.warn(`[centrale] échec: ${error}`);
  }
  applyDump(input, reports, listings, new Set(CENTRALE_SOURCES));
  return { listings: locate(input, listings), sources: reports };
}

async function runBrowser(input: LiveSearchInput): Promise<LiveSearchResult> {
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];
  try {
    await withBrowser(async (open) => {
      await Promise.all([
        recordInto(reports, listings, "Gîtes de France", async () => scrapeGites(await open(), input)),
        fillCozy(await open(), input, reports, listings),
      ]);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    for (const source of BROWSER_SOURCES) {
      if (!reports.some((r) => r.source === source)) {
        reports.push({ source, ok: false, count: 0, ms: 0, error: msg });
      }
    }
  }
  applyDump(input, reports, listings, new Set(BROWSER_SOURCES));
  await fillGitesIfNeeded(listings);
  return { listings: locate(input, listings), sources: reports };
}

async function actuallyRun(input: LiveSearchInput, part: SearchPart): Promise<LiveSearchResult> {
  if (part === "airbnb") return runAirbnb(input);
  if (part === "gites") return runGites(input);
  if (part === "cozy") return runCozy(input);
  if (part === "centrales") return runCentrales(input);
  if (part === "browser") return runBrowser(input);
  const [airbnb, gites, cozy, centrales] = await Promise.all([
    runAirbnb(input),
    runGites(input),
    runCozy(input),
    runCentrales(input),
  ]);
  const listings = locate(input, [
    ...airbnb.listings,
    ...gites.listings,
    ...cozy.listings,
    ...centrales.listings,
  ]);
  return {
    listings,
    sources: [...airbnb.sources, ...gites.sources, ...cozy.sources, ...centrales.sources],
  };
}

const CACHE_MS = 90_000;
const CACHE_GEN = "c7";
const cache = new Map<string, { at: number; result: LiveSearchResult }>();
const inflight = new Map<string, Promise<LiveSearchResult>>();

function cacheKey(input: LiveSearchInput, part: SearchPart): string {
  return [CACHE_GEN, part, input.stationId, input.checkIn, input.checkOut, input.guests, input.bedrooms].join("|");
}

export async function runLiveSearch(input: LiveSearchInput, part: SearchPart = "all"): Promise<LiveSearchResult> {
  await allowsPath("https://skitrack.local", "/");
  const key = cacheKey(input, part);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = actuallyRun(input, part)
    .then((result) => {
      cache.set(key, { at: Date.now(), result });
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}
