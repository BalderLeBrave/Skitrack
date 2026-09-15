/**
 * Seconde passe hors collecteur : télécharge la fiche déjà liée et y lit
 * capacité, chambres, GPS. Les collecteurs restent inchangés.
 *
 * Airbnb 429 : les fiches `rooms/` partent une à une. Un 429 ouvre le
 * coupe-circuit partagé avec le sidecar Python (`/tmp/skitrack-airbnb-429`)
 * — Relancer pendant la pause ne martèle pas.
 */

import { readFileSync, writeFileSync } from "node:fs";
import type { Listing } from "../listings.ts";
import { RELEVE_2A } from "../listings.ts";
import { gitesCodeOf, gitesWidgetUrl } from "../scrape/gitesGps.server.ts";
import { airbnbIdOf } from "./enrichir.ts";
import {
  CIRCUIT_COOLDOWN_MS,
  estHoteAirbnb,
  estStatutRalenti,
  htmlEstBloque,
  retryAfterMs,
} from "./http429.ts";
import { lectureFiche, type LectureFiche } from "./lectureFiche.ts";
import { poserReleve } from "./poserReleve.ts";

const MAX_FICHES = 160;
const WORKERS = 10;
const BUDGET_MS = 36_000;
const HIT_MS = 24 * 60 * 60 * 1000;
const MISS_MS = 30 * 60 * 1000;
const BLOCK_MS = 5 * 60 * 1000;
const CACHE_GEN = "f4";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CIRCUIT_PATH = process.env.SKITRACK_AIRBNB_CIRCUIT?.trim() || "/tmp/skitrack-airbnb-429";

type CacheEntry = { at: number; lect: LectureFiche; hit: boolean; blocked?: boolean };
const cache = new Map<string, CacheEntry>();

function plausible(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function trouee(l: Listing): boolean {
  if (l.guests == null) return true;
  if (l.bedrooms == null && (l.rooms == null || l.rooms <= 0)) return true;
  if (l.source === "Gîtes de France") return false;
  if (!plausible(l.lat, l.lon)) return true;
  return false;
}

function trousN(l: Listing): number {
  let n = 0;
  if (l.guests == null) n += 1;
  if (l.bedrooms == null && (l.rooms == null || l.rooms <= 0)) n += 1;
  if (!plausible(l.lat, l.lon)) n += 1;
  return n;
}

export function ficheUrlOf(l: Listing): string | null {
  if (l.source === "Airbnb") {
    const id = airbnbIdOf(l);
    if (id) return `https://www.airbnb.fr/rooms/${id}`;
  }
  if (l.source === "Gîtes de France") {
    const code = gitesCodeOf(l.id) || gitesCodeOf(l.url);
    if (code) return gitesWidgetUrl(code);
  }
  if (!l.url) return null;
  try {
    const u = new URL(l.url);
    if (/(^|\.)booking\.com$/i.test(u.hostname)) {
      const m = u.pathname.match(/\/hotel\/[a-z]{2}\/[^/]+/i);
      if (!m) return u.toString();
      u.hostname = "www.booking.com";
      u.pathname = m[0].replace(/\/$/, "");
      if (!/\.html$/i.test(u.pathname)) u.pathname += ".html";
      u.search = "";
      u.hash = "";
      return u.toString();
    }
    return l.url;
  } catch {
    return l.url;
  }
}

function cacheKey(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return `${CACHE_GEN}|${u.toString()}`;
  } catch {
    return `${CACHE_GEN}|${url}`;
  }
}

function lireCache(url: string): LectureFiche | null {
  const e = cache.get(cacheKey(url));
  if (!e) return null;
  const ttl = e.blocked ? BLOCK_MS : e.hit ? HIT_MS : MISS_MS;
  if (Date.now() - e.at > ttl) {
    cache.delete(cacheKey(url));
    return null;
  }
  return e.lect;
}

function utile(lect: LectureFiche): boolean {
  return (
    lect.guests != null ||
    lect.bedrooms != null ||
    lect.rooms != null ||
    plausible(lect.lat, lect.lon) ||
    Boolean(lect.street && /\d/.test(lect.street))
  );
}

export function poserLecture(row: Listing, lect: LectureFiche, tag = "fiche"): boolean {
  let changed = false;
  if (row.guests == null && lect.guests != null) {
    row.guests = lect.guests;
    changed = true;
  }
  if (row.bedrooms == null && lect.bedrooms != null) {
    row.bedrooms = lect.bedrooms;
    changed = true;
  }
  if ((row.rooms == null || row.rooms <= 0) && lect.rooms != null) {
    row.rooms = lect.rooms;
    changed = true;
  }
  if (!plausible(row.lat, row.lon) && plausible(lect.lat, lect.lon)) {
    row.lat = lect.lat;
    row.lon = lect.lon;
    changed = true;
  }
  if (!row.locality && lect.locality) {
    row.locality = lect.locality;
    changed = true;
  }
  if (changed && tag && !new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(row.proven)) {
    row.proven = `${row.proven} · ${tag}`;
  }
  return changed;
}

function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function clusterGps(listings: Listing[]): { lat: number; lon: number } | null {
  const pts = listings.filter((l) => plausible(l.lat, l.lon)) as Array<Listing & { lat: number; lon: number }>;
  if (pts.length < 3) return null;
  return {
    lat: pts.reduce((s, l) => s + l.lat, 0) / pts.length,
    lon: pts.reduce((s, l) => s + l.lon, 0) / pts.length,
  };
}

const geoCache = new Map<string, { at: number; lat: number | null; lon: number | null }>();

/** « LES 2 ALPES » n'est pas un toponyme OSM ; « Les Deux Alpes, 38860 » l'est. */
function lieuPourAdresse(locality: string | null): string {
  const t = (locality ?? "").trim();
  if (/les\s*2\s*alpes/i.test(t) || /les\s*deux[\s-]*alpes/i.test(t)) return "Les Deux Alpes, 38860, France";
  if (t) return `${t}, France`;
  return "France";
}

/**
 * Localise une rue numérotée déjà publiée, jamais une commune.
 * Le point OSM n'est retenu que s'il tombe près des autres GPS du relevé.
 */
async function geocodeRue(street: string, locality: string | null): Promise<{ lat: number; lon: number } | null> {
  if (!/\d/.test(street)) return null;
  const q = [street.replace(/,\s*$/, "").trim(), lieuPourAdresse(locality)].join(", ");
  const hit = geoCache.get(q);
  if (hit && Date.now() - hit.at < HIT_MS) {
    return plausible(hit.lat, hit.lon) ? { lat: hit.lat as number, lon: hit.lon as number } : null;
  }
  try {
    const u = new URL("https://nominatim.openstreetmap.org/search");
    u.searchParams.set("format", "json");
    u.searchParams.set("limit", "1");
    u.searchParams.set("q", q);
    const res = await fetch(u, {
      headers: { Accept: "application/json", "User-Agent": "Skitrack/1.0 (+https://skitrack.local)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ lat?: string; lon?: string; class?: string; type?: string }>;
    const row = rows[0];
    const kind = `${row?.class ?? ""}:${row?.type ?? ""}`;
    if (/place:(city|town|village|municipality|hamlet)|boundary:administrative/i.test(kind)) {
      geoCache.set(q, { at: Date.now(), lat: null, lon: null });
      return null;
    }
    const lat = Number(row?.lat);
    const lon = Number(row?.lon);
    if (!plausible(lat, lon)) {
      geoCache.set(q, { at: Date.now(), lat: null, lon: null });
      return null;
    }
    geoCache.set(q, { at: Date.now(), lat, lon });
    return { lat, lon };
  } catch {
    return null;
  }
}

async function fillAdresses(listings: Listing[], until: number): Promise<number> {
  const cluster = clusterGps(listings);
  if (!cluster) return 0;
  let n = 0;
  for (const row of listings) {
    if (Date.now() >= until) break;
    if (plausible(row.lat, row.lon)) continue;
    const url = ficheUrlOf(row);
    if (!url) continue;
    const lect = lireCache(url);
    const street = lect?.street;
    if (!street || !/\d/.test(street)) continue;
    const geo = await geocodeRue(street, lect?.locality ?? row.locality ?? null);
    if (!geo) continue;
    if (kmBetween(geo, cluster) > 15) continue;
    row.lat = geo.lat;
    row.lon = geo.lon;
    if (!/adresse/.test(row.proven)) row.proven = `${row.proven} · adresse`;
    n += 1;
    await new Promise((r) => setTimeout(r, 1100));
  }
  if (n) console.info(`[fiche] ${n} GPS d'adresse`);
  return n;
}

function circuitOpen(): boolean {
  try {
    const t = Number(readFileSync(CIRCUIT_PATH, "utf8").trim());
    return Number.isFinite(t) && Date.now() / 1000 < t;
  } catch {
    return false;
  }
}

function tripCircuit(waitMs: number): void {
  const hold = Math.max(CIRCUIT_COOLDOWN_MS, waitMs) / 1000;
  try {
    writeFileSync(CIRCUIT_PATH, String(Date.now() / 1000 + hold));
  } catch {
    /* tmp plein : le coupe-circuit reste en mémoire via le cache blocked */
  }
}

type FetchOutcome =
  | { kind: "html"; html: string }
  | { kind: "limited"; status: number; retryAfterMs: number }
  | { kind: "empty" };

async function fetchHtml(url: string, until: number): Promise<FetchOutcome> {
  if (Date.now() >= until) return { kind: "empty" };
  const ctrl = new AbortController();
  const wait = setTimeout(() => ctrl.abort(), Math.max(1_000, until - Date.now()));
  try {
    const res = await fetch(url, {
      headers: { "Accept-Language": "fr-FR,fr;q=0.9", Accept: "text/html", "User-Agent": UA },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (estStatutRalenti(res.status)) {
      return { kind: "limited", status: res.status, retryAfterMs: retryAfterMs(res.headers) };
    }
    if (!res.ok) return { kind: "empty" };
    const html = await res.text();
    if (html.length < 400) return { kind: "empty" };
    if (htmlEstBloque(html)) return { kind: "limited", status: 429, retryAfterMs: retryAfterMs(res.headers) };
    return { kind: "html", html };
  } catch {
    return { kind: "empty" };
  } finally {
    clearTimeout(wait);
  }
}

const VIDE: LectureFiche = {
  guests: null,
  bedrooms: null,
  rooms: null,
  lat: null,
  lon: null,
  locality: null,
  street: null,
};

async function fillPool(targets: Listing[], until: number, workers: number): Promise<number> {
  let filled = 0;
  let cursor = 0;
  const n = Math.min(workers, targets.length);
  if (n <= 0) return 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (;;) {
        if (Date.now() >= until) return;
        const i = cursor++;
        if (i >= targets.length) return;
        const row = targets[i];
        const url = ficheUrlOf(row);
        if (!url) continue;
        try {
          const got = await fetchHtml(url, until);
          if (got.kind !== "html") continue;
          const lect = lectureFiche(got.html);
          cache.set(cacheKey(url), { at: Date.now(), lect, hit: utile(lect) });
          if (poserLecture(row, lect)) filled += 1;
        } catch {
          /* fiche bloquée : les trous restent nommés */
        }
      }
    }),
  );
  return filled;
}

async function fillAirbnbSeq(targets: Listing[], until: number): Promise<number> {
  let filled = 0;
  let consecutive = 0;
  for (let i = 0; i < targets.length; i++) {
    if (Date.now() >= until) break;
    if (circuitOpen()) {
      console.warn(`[fiche] Airbnb 429 — pause, ${targets.length - i} fiches non lues`);
      break;
    }
    const row = targets[i];
    const url = ficheUrlOf(row);
    if (!url) continue;
    let got = await fetchHtml(url, until);
    if (got.kind === "limited") {
      const waitMs = got.retryAfterMs;
      const status = got.status;
      tripCircuit(waitMs);
      const rest = until - Date.now();
      if (rest > 800 && waitMs < rest && consecutive < 1) {
        await new Promise((r) => setTimeout(r, waitMs));
        got = await fetchHtml(url, until);
      }
      if (got.kind === "limited") {
        consecutive += 1;
        cache.set(cacheKey(url), { at: Date.now(), lect: VIDE, hit: false, blocked: true });
        tripCircuit(got.retryAfterMs);
        console.warn(`[fiche] Airbnb HTTP ${status} — coupe-circuit ${Math.round(waitMs / 1000)}s`);
        break;
      }
    }
    consecutive = 0;
    if (got.kind !== "html") continue;
    const lect = lectureFiche(got.html);
    cache.set(cacheKey(url), { at: Date.now(), lect, hit: utile(lect) });
    if (poserLecture(row, lect)) filled += 1;
    await new Promise((r) => setTimeout(r, 700));
  }
  return filled;
}

/**
 * Remplit capacité, chambres et GPS encore vides, via la page de fiche que
 * l'annonce porte déjà. Les totaux et titres restent ceux du relevé.
 *
 * `budgetMs` borne le réseau : un délai épuisé n'efface pas ce que le relevé
 * ou le cache ont déjà posé.
 */
export async function fillFiches(listings: Listing[], budgetMs = BUDGET_MS): Promise<number> {
  let filled = poserReleve(listings, RELEVE_2A);
  const until = Date.now() + Math.max(0, budgetMs);
  const need = listings
    .filter((l) => trouee(l) && ficheUrlOf(l))
    .sort((a, b) => trousN(b) - trousN(a));
  if (need.length === 0) {
    if (filled) console.info(`[fiche] ${filled} du relevé`);
    filled += await fillAdresses(listings, until);
    return filled;
  }

  let cached = 0;
  const todo: Listing[] = [];
  for (const row of need) {
    const url = ficheUrlOf(row);
    if (!url) continue;
    const hit = lireCache(url);
    if (hit) {
      if (poserLecture(row, hit)) filled += 1;
      cached += 1;
      continue;
    }
    todo.push(row);
  }
  if (todo.length > 0 && Date.now() < until) {
    const targets = todo.slice(0, MAX_FICHES);
    const airbnb = targets.filter((l) => l.source === "Airbnb" || estHoteAirbnb(ficheUrlOf(l) ?? ""));
    const autres = targets.filter((l) => !(l.source === "Airbnb" || estHoteAirbnb(ficheUrlOf(l) ?? "")));
    filled += await fillPool(autres, until, WORKERS);
    if (airbnb.length && !circuitOpen()) {
      filled += await fillAirbnbSeq(airbnb, until);
    } else if (airbnb.length && circuitOpen()) {
      console.warn(`[fiche] Airbnb 429 — ${airbnb.length} fiches reportées`);
    }
    console.info(`[fiche] ${filled}/${need.length} fiches · ${cached} cache · ${targets.length} lues`);
  } else {
    console.info(`[fiche] ${filled}/${need.length} · ${cached} cache`);
  }
  filled += await fillAdresses(listings, until);
  return filled;
}
