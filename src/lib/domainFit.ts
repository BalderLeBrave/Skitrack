/** Un logement n’appartient à un domaine que s’il y est vraiment, pas s’il est « à 5 km à vol d’oiseau ». */

import { metresBetween } from "./osmAccess.ts";
import { domainForStation, FORFAIT_CATALOG } from "./forfaits/catalog.ts";
import { STATIONS, stationById, type Station } from "./stations.ts";

export type GeoHint = {
  lat?: number | null;
  lon?: number | null;
  title?: string;
  locality?: string | null;
  placeName?: string | null;
};

export type DomainVerdict = "in" | "linked" | "other" | "unknown";

export type DomainFit = {
  searchedId: string;
  nearestStationId: string | null;
  nearestStationName: string | null;
  distToSearchedPinM: number | null;
  distToNearestPinM: number | null;
  verdict: DomainVerdict;
  winterBarrier: string | null;
};

/** Cols fermés l’hiver : proches à vol d’oiseau, pas le même domaine skiable. */
const WINTER_BARRIERS: { a: string; b: string; col: string }[] = [
  { a: "val-disere", b: "bonneval-sur-arc", col: "Col de l'Iseran" },
  { a: "val-disere", b: "bessans", col: "Col de l'Iseran" },
  { a: "val-disere", b: "val-cenis", col: "Col de l'Iseran" },
  { a: "tignes", b: "bonneval-sur-arc", col: "Col de l'Iseran" },
  { a: "tignes", b: "bessans", col: "Col de l'Iseran" },
  { a: "tignes", b: "val-cenis", col: "Col de l'Iseran" },
];

/** Hameaux / toponymes → station, jamais un autre versant. */
const PLACE_ALIAS: Record<string, string> = {
  "le fornet": "val-disere",
  fornet: "val-disere",
  "la daille": "val-disere",
  "le laisinant": "val-disere",
  tralenta: "bonneval-sur-arc",
  "l ecot": "bonneval-sur-arc",
  "l'ecot": "bonneval-sur-arc",
  bonneval: "bonneval-sur-arc",
  "bonneval sur arc": "bonneval-sur-arc",
  "bonneval-sur-arc": "bonneval-sur-arc",
};

const EXTRA_LINKED: string[][] = [
  ["alpe-d-huez", "auris-en-oisans", "vaujany", "oz-en-oisans", "villard-reculas"],
];

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function barrierBetween(a: string, b: string): string | null {
  if (a === b) return null;
  for (const row of WINTER_BARRIERS) {
    if ((row.a === a && row.b === b) || (row.a === b && row.b === a)) return row.col;
  }
  return null;
}

let linkedCache: Map<string, Set<string>> | null = null;

function linkedIndex(): Map<string, Set<string>> {
  if (linkedCache) return linkedCache;
  const groups: string[][] = [...EXTRA_LINKED];
  const byPass = new Map<string, string[]>();
  for (const d of FORFAIT_CATALOG) {
    const ids = [...(d.stationIds ?? [])];
    if (stationById(d.slug)) ids.push(d.slug);
    if (d.pass) {
      const cur = byPass.get(d.pass) ?? [];
      cur.push(...ids);
      byPass.set(d.pass, cur);
    } else if (ids.length > 1) {
      groups.push(ids);
    }
  }
  for (const ids of byPass.values()) groups.push(ids);
  for (const s of STATIONS) {
    const d = domainForStation(s.id);
    if (!d) continue;
    const ids = [...(d.stationIds ?? []), d.slug, s.id].filter(Boolean);
    groups.push(ids);
  }
  const map = new Map<string, Set<string>>();
  const add = (id: string, other: string) => {
    let set = map.get(id);
    if (!set) {
      set = new Set([id]);
      map.set(id, set);
    }
    set.add(other);
  };
  for (const g of groups) {
    const ids = [...new Set(g.filter((id) => stationById(id)))];
    for (const a of ids) for (const b of ids) add(a, b);
  }
  linkedCache = map;
  return map;
}

export function linkedSkiStations(stationId: string): Set<string> {
  return linkedIndex().get(stationId) ?? new Set([stationId]);
}

export function winterBarrier(a: string, b: string): string | null {
  return barrierBetween(a, b);
}

export function nearestStationPin(
  lat: number,
  lon: number,
): { station: Station; m: number } {
  let best = STATIONS[0]!;
  let bestM = metresBetween(lat, lon, best.lat, best.lon);
  for (let i = 1; i < STATIONS.length; i++) {
    const s = STATIONS[i]!;
    const m = metresBetween(lat, lon, s.lat, s.lon);
    if (m < bestM) {
      best = s;
      bestM = m;
    }
  }
  return { station: best, m: Math.round(bestM) };
}

const NAME_IDS: { needle: string; id: string }[] = (() => {
  const rows: { needle: string; id: string }[] = [];
  for (const [alias, id] of Object.entries(PLACE_ALIAS)) {
    rows.push({ needle: fold(alias), id });
  }
  for (const s of STATIONS) {
    rows.push({ needle: fold(s.name), id: s.id });
    rows.push({ needle: fold(s.id.replace(/-/g, " ")), id: s.id });
  }
  rows.sort((a, b) => b.needle.length - a.needle.length);
  return rows;
})();

export function stationIdFromText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hay = ` ${fold(raw)} `;
  for (const row of NAME_IDS) {
    if (row.needle.length < 5 && row.needle !== "fornet") continue;
    if (hay.includes(` ${row.needle} `)) return row.id;
  }
  return null;
}

export function domainFit(listing: GeoHint, searched: Station): DomainFit {
  const pinM =
    listing.lat != null && listing.lon != null
      ? Math.round(metresBetween(listing.lat, listing.lon, searched.lat, searched.lon))
      : null;
  const gps =
    listing.lat != null && listing.lon != null
      ? nearestStationPin(listing.lat, listing.lon)
      : null;
  const textId = stationIdFromText(`${listing.locality ?? ""} ${listing.placeName ?? ""} ${listing.title}`);
  const nearestId = gps?.station.id ?? textId;
  const nearest = nearestId ? stationById(nearestId) : undefined;
  if (!nearest) {
    return {
      searchedId: searched.id,
      nearestStationId: null,
      nearestStationName: null,
      distToSearchedPinM: pinM,
      distToNearestPinM: null,
      verdict: "unknown",
      winterBarrier: null,
    };
  }
  const col = barrierBetween(searched.id, nearest.id);
  const linked = !col && linkedSkiStations(searched.id).has(nearest.id);
  // Le classeur découpe les grands domaines en sous-stations (Arc 1600, Plagne
  // Centre, Le Fornet…). Deux pins du même domaine skiable, sans col fermé
  // entre eux, sont le même domaine — comparer les identifiants ne suffit plus.
  const sameDomain = !col && nearest.domain != null && nearest.domain === searched.domain;
  let verdict: DomainVerdict;
  if (nearest.id === searched.id) verdict = "in";
  else if (linked) verdict = "linked";
  else if (sameDomain) verdict = "in";
  else verdict = "other";
  return {
    searchedId: searched.id,
    nearestStationId: nearest.id,
    nearestStationName: nearest.name,
    distToSearchedPinM: pinM,
    distToNearestPinM: gps?.m ?? null,
    verdict,
    winterBarrier: col,
  };
}

export function inSearchedDomain(fit: DomainFit): boolean {
  return fit.verdict === "in" || fit.verdict === "linked";
}

export function otherDomainMessage(fit: DomainFit, searchedName: string): string | null {
  if (fit.verdict !== "other" || !fit.nearestStationName) return null;
  if (fit.winterBarrier) {
    return `Autre domaine : ${fit.nearestStationName}. Pas ${searchedName} : ${fit.winterBarrier} fermé l’hiver, le vol d’oiseau n’est ni un accès ski ni une route directe.`;
  }
  return `Autre domaine : ${fit.nearestStationName}. Ce logement n’est pas sur ${searchedName} ni sur un domaine relié en saison.`;
}
