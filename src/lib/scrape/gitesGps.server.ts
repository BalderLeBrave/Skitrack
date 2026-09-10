import type { Listing } from "@/lib/listings";
import { allowsPath } from "./robots";

/** GPS Gîtes de France uniquement. Ne touche ni aux prix ni au devis ITEA. */

const KEY = "FNGF-00M562O4";
const MAX_FICHES = 16;
const WORKERS = 8;
const BUDGET_MS = 8_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function plausible(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function gitesCodeOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{2}g\d{3,})/i);
  return m ? m[1].toUpperCase() : null;
}

function widgetUrl(code: string): string {
  const u = new URL(`https://widget-fngf.itea.fr/fiche-${code}.html`);
  u.searchParams.set("WIDGET", "RESAFNGF");
  u.searchParams.set("KEY", KEY);
  u.searchParams.set("LANGUE", "FR");
  u.searchParams.set("NUMGITE", code);
  return u.toString();
}

function asCoord(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** JSON-LD LodgingBusiness.location.geo du widget ITEA, sinon pin Drupal. */
export function geoFromGitesHtml(html: string): { lat: number; lon: number; locality: string | null } | null {
  const geo = html.match(
    /"geo"\s*:\s*\{[^}]{0,280}"latitude"\s*:\s*"?(-?\d+(?:\.\d+)?)"?[^}]{0,120}"longitude"\s*:\s*"?(-?\d+(?:\.\d+)?)"?/i,
  );
  const locality =
    html.match(/"addressLocality"\s*:\s*"([^"]+)"/i)?.[1] ??
    html.match(/"areaServed"\s*:\s*"([^"]+)"/i)?.[1] ??
    null;
  const place = locality && locality.trim().length > 1 ? locality.trim() : null;
  if (geo) {
    const lat = asCoord(geo[1]);
    const lon = asCoord(geo[2]);
    if (plausible(lat, lon)) return { lat: lat as number, lon: lon as number, locality: place };
  }
  const tag = html.match(/<[^>]*\bid=["']map-accommodation["'][^>]*>/i)?.[0];
  if (tag) {
    const lat = asCoord(tag.match(/data-lat=["']([^"']+)["']/i)?.[1]);
    const lon = asCoord(tag.match(/data-lng=["']([^"']+)["']/i)?.[1]);
    if (plausible(lat, lon)) return { lat: lat as number, lon: lon as number, locality: place };
  }
  return null;
}

async function fetchHtml(url: string, until: number): Promise<string | null> {
  if (Date.now() >= until) return null;
  const ctrl = new AbortController();
  const wait = setTimeout(() => ctrl.abort(), Math.max(1_000, until - Date.now()));
  try {
    const res = await fetch(url, {
      headers: { "Accept-Language": "fr-FR", "User-Agent": UA },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(wait);
  }
}

/**
 * Remplit lat/lon des fiches Gîtes encore vides, via le JSON-LD du widget ITEA
 * (le même HTML que le devis, sans relancer le calcul de prix).
 * Les totaux, titres et URLs restent ceux du relevé déjà fait.
 */
export async function fillGitesGps(listings: Listing[]): Promise<number> {
  const need = listings.filter((l) => {
    if (l.source !== "Gîtes de France") return false;
    if (plausible(l.lat, l.lon)) return false;
    return Boolean(gitesCodeOf(l.id) || gitesCodeOf(l.url));
  });
  if (need.length === 0) return 0;
  await allowsPath("https://widget-fngf.itea.fr", "/");
  const targets = need.slice(0, MAX_FICHES);
  const until = Date.now() + BUDGET_MS;
  let cursor = 0;
  let filled = 0;
  const workers = Math.min(WORKERS, targets.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        if (Date.now() >= until) return;
        const i = cursor++;
        if (i >= targets.length) return;
        const row = targets[i];
        const code = gitesCodeOf(row.id) || gitesCodeOf(row.url);
        if (!code) continue;
        try {
          const html = await fetchHtml(widgetUrl(code), until);
          const gps = html ? geoFromGitesHtml(html) : null;
          if (!gps) continue;
          row.lat = gps.lat;
          row.lon = gps.lon;
          if (gps.locality) row.locality = gps.locality;
          if (!/GPS ITEA/.test(row.proven)) {
            row.proven = `${row.proven} · GPS ITEA`;
          }
          filled += 1;
        } catch {
          /* fiche bloquée : on laisse non mesurée */
        }
      }
    }),
  );
  console.info(`[gites-gps] ${filled}/${need.length} fiches`);
  return filled;
}
