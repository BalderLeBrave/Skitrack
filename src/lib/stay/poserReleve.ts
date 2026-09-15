/**
 * Recopie capacité, chambres et GPS d'un relevé déjà lu pour la même annonce.
 * Rien n'est estimé : c'est ce que la source avait publié, ailleurs que sur
 * la tuile du moment.
 */

import { airbnbIdOf } from "./enrichir.ts";
import { occupancyOfListing } from "./occupancy.ts";

export type SujetReleve = {
  source?: string | null;
  id?: string | null;
  url?: string | null;
  platformId?: string | null;
  photo?: string | null;
  photos?: string[] | null;
  title?: string | null;
  propertyType?: string | null;
  priceLabel?: string | null;
  guests: number | null;
  bedrooms: number | null;
  rooms?: number | null;
  lat: number | null;
  lon: number | null;
  locality?: string | null;
  proven: string;
};

function gitesCodeOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{2}g\d{3,})/i);
  return m ? m[1].toUpperCase() : null;
}

function plausible(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/** Clé stable d'une même annonce. */
export function cleListing(l: SujetReleve): string | null {
  if (l.source === "Airbnb") {
    const id = airbnbIdOf(l);
    return id ? `Airbnb:${id}` : null;
  }
  if (l.source === "Gîtes de France") {
    const code = gitesCodeOf(l.id) || gitesCodeOf(l.url);
    return code ? `Gîtes:${code}` : null;
  }
  if (l.platformId && String(l.platformId).trim()) return `${l.source ?? ""}:${String(l.platformId).trim()}`;
  if (l.id && String(l.id).trim()) return `${l.source ?? ""}:${String(l.id).trim()}`;
  if (l.url) {
    try {
      const u = new URL(l.url);
      return `${l.source ?? ""}:${u.origin}${u.pathname.replace(/\/$/, "")}`;
    } catch {
      return `${l.source ?? ""}:${l.url}`;
    }
  }
  return null;
}

export function poserReleve<T extends SujetReleve, D extends SujetReleve>(rows: T[], dump: D[]): number {
  const index = new Map<string, D & { guests: number | null; bedrooms: number | null; rooms?: number | null }>();
  for (const raw of dump) {
    const occ = occupancyOfListing(raw);
    const d = { ...raw, ...occ };
    const key = cleListing(d);
    if (key && !index.has(key)) index.set(key, d);
  }
  let n = 0;
  for (const row of rows) {
    const key = cleListing(row);
    if (!key) continue;
    const d = index.get(key);
    if (!d) continue;
    let changed = false;
    if (row.guests == null && d.guests != null) {
      row.guests = d.guests;
      changed = true;
    }
    if (row.bedrooms == null && d.bedrooms != null) {
      row.bedrooms = d.bedrooms;
      changed = true;
    }
    if ((row.rooms == null || row.rooms <= 0) && d.rooms != null) {
      row.rooms = d.rooms;
      changed = true;
    }
    if (!plausible(row.lat, row.lon) && plausible(d.lat, d.lon)) {
      row.lat = d.lat;
      row.lon = d.lon;
      changed = true;
    }
    if (!row.locality && d.locality) {
      row.locality = d.locality;
      changed = true;
    }
    if (changed) {
      if (!/relevé/.test(row.proven)) row.proven = `${row.proven} · relevé`;
      n += 1;
    }
  }
  return n;
}
