/**
 * Ce qu'une page de fiche publie : capacité, chambres, GPS.
 *
 * Lecture seule d'un HTML déjà téléchargé. Rien n'est estimé : un
 * `occupancy.value` qui dit 5 quand `personCapacity` dit 8 n'est pas une
 * capacité — c'est souvent le nombre de lits. On prend les champs qui
 * nomment des voyageurs, des chambres, des coordonnées.
 */

import { occupancyFromText, mergeOccupancy, type Occupancy } from "./occupancy.ts";
import { taxeSejourSomme } from "./tarif.ts";
import { titrePublie } from "./titre.ts";

export type LectureFiche = Occupancy & {
  lat: number | null;
  lon: number | null;
  locality: string | null;
  /** Rue publiée (JSON-LD `streetAddress`), pour un GPS encore vide. */
  street: string | null;
  /** Nom de l'annonce tel que la fiche le publie (`h1`, og:title). */
  title: string | null;
  /** Taxe de séjour publiée en une somme, pas un tarif à la nuit. */
  taxeSejour: number | null;
};

const VIDE: LectureFiche = {
  guests: null,
  bedrooms: null,
  rooms: null,
  lat: null,
  lon: null,
  locality: null,
  street: null,
  title: null,
  taxeSejour: null,
};

const MAX = 50;

function plausible(lat: number | null, lon: number | null): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function takeGuests(n: unknown): number | null {
  const v = typeof n === "number" ? n : typeof n === "string" && /^\d+$/.test(n.trim()) ? Number(n.trim()) : NaN;
  return Number.isInteger(v) && v > 0 && v <= MAX ? v : null;
}

function takeBeds(n: unknown): number | null {
  const v = typeof n === "number" ? n : typeof n === "string" && /^\d+$/.test(n.trim()) ? Number(n.trim()) : NaN;
  return Number.isInteger(v) && v >= 0 && v <= MAX ? v : null;
}

function asCoord(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1].replace(/^\s*\/\/<!\[CDATA\[/, "").replace(/\/\/\]\]>\s*$/, "").trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      /* bloc illisible : on passe */
    }
  }
  return out;
}

function mergeLecture(a: LectureFiche, b: LectureFiche): LectureFiche {
  const occ = mergeOccupancy(a, b);
  const gps = plausible(a.lat, a.lon) ? { lat: a.lat, lon: a.lon } : { lat: b.lat, lon: b.lon };
  return {
    ...occ,
    lat: gps.lat,
    lon: gps.lon,
    locality: a.locality ?? b.locality,
    street: a.street ?? b.street,
    title: titrePublie(a.title) ?? titrePublie(b.title),
    taxeSejour: a.taxeSejour ?? b.taxeSejour,
  };
}

function fromOccupancyNode(o: Record<string, unknown>): Occupancy {
  return {
    guests: takeGuests(o.maxValue) ?? takeGuests(o.maxPersons) ?? takeGuests(o.maxGuests),
    bedrooms: null,
    rooms: null,
  };
}

function fromRecord(o: Record<string, unknown>): LectureFiche {
  let out: LectureFiche = { ...VIDE };
  const guests =
    takeGuests(o.personCapacity) ??
    takeGuests(o.numberOfGuests) ??
    takeGuests(o.guestCapacity) ??
    takeGuests(o.maxPersons) ??
    takeGuests(o.accommodates) ??
    takeGuests(o.sleeps);
  const bedrooms = takeBeds(o.numberOfBedrooms) ?? takeBeds(o.bedroomCount) ?? takeBeds(o.bedrooms);
  const rooms = takeBeds(o.numberOfRooms) ?? takeBeds(o.roomCount);
  if (guests != null || bedrooms != null || rooms != null) {
    out = { ...out, guests, bedrooms, rooms };
  }
  const occ = o.occupancy;
  if (occ && typeof occ === "object" && !Array.isArray(occ)) {
    out = { ...out, ...mergeOccupancy(out, fromOccupancyNode(occ as Record<string, unknown>)) };
  }
  const geo = o.geo;
  if (geo && typeof geo === "object" && !Array.isArray(geo)) {
    const g = geo as Record<string, unknown>;
    const lat = asCoord(g.latitude);
    const lon = asCoord(g.longitude);
    if (plausible(lat, lon)) {
      out = { ...out, lat, lon };
    }
  }
  const lat = asCoord(o.latitude) ?? asCoord(o.listingLat);
  const lon = asCoord(o.longitude) ?? asCoord(o.listingLng) ?? asCoord(o.lng);
  if (plausible(lat, lon)) out = { ...out, lat, lon };
  const loc =
    (typeof o.addressLocality === "string" && o.addressLocality.trim()) ||
    (o.address && typeof o.address === "object" && !Array.isArray(o.address)
      ? typeof (o.address as Record<string, unknown>).addressLocality === "string"
        ? String((o.address as Record<string, unknown>).addressLocality).trim()
        : ""
      : "");
  if (loc) out = { ...out, locality: loc };
  const streetRaw =
    (typeof o.streetAddress === "string" && o.streetAddress.trim()) ||
    (o.address && typeof o.address === "object" && !Array.isArray(o.address)
      ? typeof (o.address as Record<string, unknown>).streetAddress === "string"
        ? String((o.address as Record<string, unknown>).streetAddress).trim()
        : ""
      : "");
  if (streetRaw) out = { ...out, street: streetRaw.replace(/,\s*$/, "").trim() };
  const name = typeof o.name === "string" ? o.name : null;
  const kind = String(o["@type"] ?? "");
  const lodging = /VacationRental|LodgingBusiness|Accommodation|Hotel|Apartment|House|Residence/i.test(kind);
  if (name) {
    if (lodging) {
      const titre = titrePublie(name);
      if (titre) out = { ...out, title: out.title ?? titre };
    }
    out = { ...out, ...mergeOccupancy(out, occupancyFromText(name)) };
  }
  return out;
}

function walk(node: unknown, acc: LectureFiche, depth: number): LectureFiche {
  if (depth > 12 || node == null) return acc;
  if (Array.isArray(node)) {
    for (const x of node) acc = walk(x, acc, depth + 1);
    return acc;
  }
  if (typeof node !== "object") return acc;
  const o = node as Record<string, unknown>;
  acc = mergeLecture(acc, fromRecord(o));
  if (Array.isArray(o["@graph"])) acc = walk(o["@graph"], acc, depth + 1);
  if (o.containsPlace) acc = walk(o.containsPlace, acc, depth + 1);
  if (o.location) acc = walk(o.location, acc, depth + 1);
  if (o.address && typeof o.address === "object") acc = walk(o.address, acc, depth + 1);
  if (o.itemListElement) acc = walk(o.itemListElement, acc, depth + 1);
  return acc;
}

function fromRegex(html: string): LectureFiche {
  let out: LectureFiche = { ...VIDE };
  const pc = html.match(/"personCapacity"\s*:\s*(\d+)/);
  if (pc) out = { ...out, guests: takeGuests(pc[1]) };
  const guestsJson =
    html.match(/"numberOfGuests"\s*:\s*"?(\d+)/i)?.[1] ??
    html.match(/"guestCapacity"\s*:\s*"?(\d+)/i)?.[1] ??
    html.match(/"accommodates"\s*:\s*"?(\d+)/i)?.[1] ??
    html.match(/"maxOccupancy"\s*:\s*"?(\d+)/i)?.[1] ??
    html.match(/"sleeps"\s*:\s*"?(\d+)/i)?.[1];
  if (out.guests == null && guestsJson) out = { ...out, guests: takeGuests(guestsJson) };
  const bedsJson =
    html.match(/"numberOfBedrooms"\s*:\s*"?(\d+)/i)?.[1] ??
    html.match(/"bedroomCount"\s*:\s*"?(\d+)/i)?.[1];
  if (bedsJson) out = { ...out, bedrooms: takeBeds(bedsJson) };
  const roomsJson = html.match(/"numberOfRooms"\s*:\s*"?(\d+)/i)?.[1];
  if (roomsJson) out = { ...out, rooms: takeBeds(roomsJson) };
  const latlng = html.match(/"listingLat"\s*:\s*(-?\d+(?:\.\d+))\s*,\s*"listingLng"\s*:\s*(-?\d+(?:\.\d+))/);
  if (latlng) {
    const lat = Number(latlng[1]);
    const lon = Number(latlng[2]);
    if (plausible(lat, lon)) out = { ...out, lat, lon };
  }
  const phrases: string[] = [];
  const reVoy = /"(\d+)\s*voyageurs?"/gi;
  const reCh = /"(\d+)\s*chambres?"/gi;
  const rePers = /"(\d+)\s*(?:personnes?|pers\.?)"/gi;
  const reMax = /Max(?:imum|\.)?\s*(?:de\s+)?(\d+)\s*(?:personnes?|voyageurs?|occupants?|guests?)/gi;
  let m: RegExpExecArray | null;
  while ((m = reVoy.exec(html))) phrases.push(m[0].replace(/"/g, ""));
  while ((m = reCh.exec(html))) phrases.push(m[0].replace(/"/g, ""));
  while ((m = rePers.exec(html))) phrases.push(m[0].replace(/"/g, ""));
  while ((m = reMax.exec(html))) phrases.push(m[0]);
  if (phrases.length) out = { ...out, ...mergeOccupancy(out, occupancyFromText(...phrases)) };
  return out;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&deg;|&#176;/gi, "°")
    .replace(/&/gi, "&")
    .replace(/"/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Meta description / Open Graph : la centrale y répète capacité et pièces. */
function fromMeta(html: string): LectureFiche {
  let out: LectureFiche = { ...VIDE };
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    if (!/name=["']description["']|property=["']og:(?:description|title)["']/i.test(tag)) continue;
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (!content) continue;
    out = { ...out, ...mergeOccupancy(out, occupancyFromText(decodeHtml(content))) };
    if (/property=["']og:title["']/i.test(tag)) {
      const titre = titrePublie(decodeHtml(content));
      if (titre) out = { ...out, title: out.title ?? titre };
    }
  }
  return out;
}

/**
 * Fiche Ingénie : critères GCAPAC / pièces / Chambre 1-N, GPS écrit en clair.
 *
 * Le JSON-LD de la centrale est souvent celui du loueur, pas du logement ;
 * les chambres n'y figurent pas. Les titres `Chambre 1`, `Chambre 2` sont
 * le décompte publié, pas une estimation.
 */
function fromIngenie(html: string): LectureFiche {
  let out: LectureFiche = { ...VIDE };
  const cap =
    html.match(/GCAPAC-GCAP0?(\d+)/i)?.[1] ??
    html.match(/Capacit[eé][^<]{0,80}<\/span>[\s\S]{0,280}?(\d+)\s*personnes/i)?.[1];
  if (cap) out = { ...out, guests: takeGuests(cap) };
  const pieces =
    html.match(/GTYPAP-G(\d+)PIEC/i)?.[1] ??
    html.match(/Nombre de pi[eè]ces[\s\S]{0,280}?(\d+)\s*pi[eè]ces/i)?.[1];
  if (pieces) out = { ...out, rooms: takeBeds(pieces) };
  let maxCh = 0;
  const reCh = /crit_GCHAM(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = reCh.exec(html))) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n > maxCh && n <= MAX) maxCh = n;
  }
  if (maxCh > 0) out = { ...out, bedrooms: takeBeds(maxCh) };
  const itemLat = html.match(/itemprop=["']latitude["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const itemLon = html.match(/itemprop=["']longitude["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const lat = asCoord(itemLat) ?? asCoord(html.match(/Latitude\s*:\s*(-?\d+(?:[.,]\d+)?)/i)?.[1] ?? null);
  const lon = asCoord(itemLon) ?? asCoord(html.match(/Longitude\s*:\s*(-?\d+(?:[.,]\d+)?)/i)?.[1] ?? null);
  if (plausible(lat, lon)) out = { ...out, lat, lon };
  const h1 = html.match(/<h1\b[^>]*>([\s\S]{0,220}?)<\/h1>/i)?.[1];
  const titre = titrePublie(h1 ?? null);
  if (titre) out = { ...out, title: titre };
  return out;
}

function fromGpsHtml(html: string): LectureFiche {
  let out: LectureFiche = { ...VIDE };
  const atlas = html.match(/data-atlas-latlng="\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*"/i);
  if (atlas) {
    const lat = Number(atlas[1]);
    const lon = Number(atlas[2]);
    if (plausible(lat, lon)) out = { ...out, lat, lon };
  }
  if (!plausible(out.lat, out.lon)) {
    const lat = asCoord(html.match(/\bdata-lat=["']([^"']+)["']/i)?.[1] ?? null);
    const lon =
      asCoord(html.match(/\bdata-lng=["']([^"']+)["']/i)?.[1] ?? null) ??
      asCoord(html.match(/\bdata-lon=["']([^"']+)["']/i)?.[1] ?? null);
    if (plausible(lat, lon)) out = { ...out, lat, lon };
  }
  if (!plausible(out.lat, out.lon)) {
    const geo = html.match(
      /"geo"\s*:\s*\{[^}]{0,280}"latitude"\s*:\s*"?(-?\d+(?:\.\d+)?)"?[^}]{0,120}"longitude"\s*:\s*"?(-?\d+(?:\.\d+)?)"?/i,
    );
    if (geo) {
      const lat = Number(geo[1]);
      const lon = Number(geo[2]);
      if (plausible(lat, lon)) out = { ...out, lat, lon };
    }
  }
  if (!plausible(out.lat, out.lon)) {
    const pair = html.match(
      /"latitude"\s*:\s*"?(-?\d+(?:\.\d+)?)"?\s*,\s*"longitude"\s*:\s*"?(-?\d+(?:\.\d+)?)"?/i,
    );
    if (pair) {
      const lat = Number(pair[1]);
      const lon = Number(pair[2]);
      if (plausible(lat, lon)) out = { ...out, lat, lon };
    }
  }
  return out;
}

/** Lit capacité, chambres et GPS dans le HTML d'une fiche déjà chargée. */
export function lectureFiche(html: string): LectureFiche {
  if (!html || html.length < 40) return { ...VIDE };
  let out: LectureFiche = { ...VIDE };
  for (const block of jsonLdBlocks(html)) out = walk(block, out, 0);
  out = mergeLecture(out, fromRegex(html));
  out = mergeLecture(out, fromMeta(html));
  const ingenie = fromIngenie(html);
  out = mergeLecture(out, ingenie);
  if (ingenie.title) out = { ...out, title: ingenie.title };
  if (!plausible(out.lat, out.lon)) out = mergeLecture(out, fromGpsHtml(html));
  const taxe = taxeSejourSomme(html);
  if (taxe != null) out = { ...out, taxeSejour: out.taxeSejour ?? taxe };
  return out;
}
