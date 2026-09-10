import type { Page } from "playwright";
import type { Listing } from "@/lib/listings";
import { allowsPath } from "./robots";

/** GPS Booking.com uniquement. Ne touche ni aux prix ni au relevé des fiches. */

const MAX_FICHES = 12;
const WORKERS = 4;
const BUDGET_MS = 14_000;

function plausible(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function hotelPageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (!/(^|\.)booking\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/hotel\/[a-z]{2}\/[^/]+/i);
    if (!m) return null;
    u.hostname = "www.booking.com";
    u.pathname = m[0].replace(/\/$/, "");
    if (!/\.html$/i.test(u.pathname)) u.pathname += ".html";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

export function atlasFromHtml(html: string): { lat: number; lon: number } | null {
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

async function gpsOnPage(page: Page, url: string, until: number): Promise<{ lat: number; lon: number } | null> {
  if (Date.now() >= until) return null;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: Math.max(3_000, until - Date.now()) });
  const left = Math.max(1_000, until - Date.now());
  const atlas = await page
    .locator("[data-atlas-latlng]")
    .first()
    .getAttribute("data-atlas-latlng", { timeout: Math.min(8_000, left) })
    .catch(() => null);
  if (atlas && atlas.includes(",")) {
    const [a, b] = atlas.split(",");
    const lat = Number(a);
    const lon = Number(b);
    if (plausible(lat, lon)) return { lat, lon };
  }
  return atlasFromHtml(await page.content());
}

/**
 * Remplit lat/lon des fiches Booking encore vides, via la carte de la fiche Booking.com.
 * Les totaux, titres et URLs restent ceux du relevé déjà fait.
 */
export async function fillBookingGps(host: Page, listings: Listing[]): Promise<number> {
  const need = listings.filter(
    (l) => l.source === "Booking" && !plausible(l.lat, l.lon) && hotelPageUrl(l.url),
  );
  if (need.length === 0) return 0;
  await allowsPath("https://www.booking.com", "/");
  const targets = need.slice(0, MAX_FICHES);
  const until = Date.now() + BUDGET_MS;
  const ctx = host.context();
  const pages: Page[] = [];
  const workers = Math.min(WORKERS, targets.length);
  try {
    for (let i = 0; i < workers; i += 1) {
      const p = await ctx.newPage();
      p.setDefaultTimeout(10_000);
      pages.push(p);
    }
    let cursor = 0;
    let filled = 0;
    await Promise.all(
      pages.map(async (p) => {
        for (;;) {
          if (Date.now() >= until) return;
          const i = cursor++;
          if (i >= targets.length) return;
          const row = targets[i];
          const url = hotelPageUrl(row.url);
          if (!url) continue;
          try {
            const gps = await gpsOnPage(p, url, until);
            if (!gps) continue;
            row.lat = gps.lat;
            row.lon = gps.lon;
            if (!/GPS Booking/.test(row.proven)) {
              row.proven = `${row.proven} · GPS Booking`;
            }
            filled += 1;
          } catch {
            /* fiche bloquée : on laisse non mesurée */
          }
        }
      }),
    );
    console.info(`[booking-gps] ${filled}/${need.length} fiches`);
    return filled;
  } finally {
    await Promise.all(pages.map((p) => p.close().catch(() => undefined)));
  }
}
