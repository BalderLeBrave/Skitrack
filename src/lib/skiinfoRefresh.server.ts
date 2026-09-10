/** Relevé Skiinfo. robots.txt n’est pas consulté. France only. */

import { writeFile } from "node:fs/promises";
import { allowsPath } from "@/lib/scrape/robots";
import { SKIINFO, SKIINFO_PHOTOS, skiinfoPhotoAsset } from "./skiinfo.ts";
import { applyParsed, isFranceCountry, parseSkiinfoPage, stationSkiinfoUrl } from "./skiinfoParse.ts";
import {
  isStale,
  markStaleIfNeeded,
  seedLive,
  SKIINFO_TTL_MS,
  type SkiinfoLive,
} from "./skiinfoStore.ts";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const FETCH_MS = 14_000;

const memory = new Map<string, SkiinfoLive>();

export function getStoredSkiinfo(id: string): SkiinfoLive {
  const hit = memory.get(id);
  if (hit) return markStaleIfNeeded(hit);
  const seed = SKIINFO[id];
  const row = seed
    ? seedLive(seed)
    : seedLive({
        n: null,
        km: null,
        pct: { green: 0, blue: 0, red: 0, black: 0 },
        longestKm: null,
        grain: "station",
        url: "",
        at: "",
        hasMix: false,
        minM: null,
        maxM: null,
      });
  memory.set(id, row);
  return row;
}

async function fetchHtml(url: string): Promise<string> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html", referer: "https://www.skiinfo.fr/" },
      redirect: "follow",
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function savePhoto(id: string, url: string): Promise<number | null> {
  if (!url.includes("cdn.bfldr.com") || url.includes("resort_header")) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  u.searchParams.set("width", "1200");
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_MS);
  try {
    const res = await fetch(u, {
      headers: { "user-agent": UA, accept: "image/jpeg,image/*,*/*", referer: "https://www.skiinfo.fr/" },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) return null;
    await writeFile(`public/stations/${id}.jpg`, buf);
    return Date.now();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function refreshSkiinfo(id: string, force = false): Promise<SkiinfoLive> {
  const cur = getStoredSkiinfo(id);
  const seed = SKIINFO[id];
  if (!seed?.url) {
    const row: SkiinfoLive = { ...cur, status: "erreur", lastError: "Pas de fiche Skiinfo." };
    memory.set(id, row);
    return row;
  }
  if (!force && !isStale(cur)) return cur;
  const nowIso = new Date().toISOString();
  const page = stationSkiinfoUrl(seed.url);
  try {
    const origin = new URL(page).origin;
    await allowsPath(origin, new URL(page).pathname);
    const html = await fetchHtml(page);
    const parsed = parseSkiinfoPage(html);
    if (!isFranceCountry(parsed.country)) {
      const row: SkiinfoLive = { ...cur, status: "erreur", lastError: "Fiche hors France.", fetchedAt: nowIso };
      memory.set(id, row);
      return row;
    }
    if (!parsed.hasMix && parsed.minM == null && parsed.maxM == null) {
      const row: SkiinfoLive = {
        ...cur,
        status: "erreur",
        lastError: "Bloc domaine skiable absent.",
        fetchedAt: nowIso,
      };
      memory.set(id, row);
      return row;
    }
    const next = applyParsed(seed, parsed, nowIso.slice(0, 10));
    let photoRev = cur.photoRev;
    const photoUrl = parsed.photoUrl;
    const oldAsset = cur.photoUrl
      ? skiinfoPhotoAsset(cur.photoUrl)
      : SKIINFO_PHOTOS[id]
        ? skiinfoPhotoAsset(SKIINFO_PHOTOS[id]!)
        : null;
    const newAsset = photoUrl ? skiinfoPhotoAsset(photoUrl) : null;
    if (photoUrl && newAsset && newAsset !== oldAsset) {
      const rev = await savePhoto(id, photoUrl);
      if (rev) photoRev = rev;
    }
    const row: SkiinfoLive = {
      ...next,
      status: "ok",
      fetchedAt: nowIso,
      lastError: null,
      photoUrl,
      photoRev,
    };
    memory.set(id, row);
    return row;
  } catch (err) {
    const row: SkiinfoLive = {
      ...cur,
      status: "erreur",
      lastError: err instanceof Error ? err.message : String(err),
      fetchedAt: nowIso,
    };
    memory.set(id, row);
    return row;
  }
}

export async function refreshSkiinfoMany(ids: string[], force = false): Promise<SkiinfoLive[]> {
  const out: SkiinfoLive[] = [];
  for (const id of ids.slice(0, 12)) {
    out.push(await refreshSkiinfo(id, force));
  }
  return out;
}

export function skiinfoTtlMs(): number {
  return SKIINFO_TTL_MS;
}
