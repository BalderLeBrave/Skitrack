import raw from "./catalog.json" with { type: "json" };
import type { DomainForfait } from "./types";

export const FORFAIT_CATALOG: DomainForfait[] = raw as DomainForfait[];

/** Domaine principal d’une station mise en avant. */
export const STATION_FORFAIT_SLUG: Record<string, string> = {
  "les-2-alpes": "les-2-alpes",
  chamonix: "chamonix-les-grands-montets",
  "val-thorens": "val-thorens-orelle",
  tignes: "tignes-val-d-isere",
  meribel: "meribel",
  "val-disere": "tignes-val-d-isere",
  "alpe-d-huez": "alpe-d-huez-grand-domaine",
  "la-clusaz": "la-clusaz",
};

export function domainBySlug(slug: string): DomainForfait | undefined {
  return FORFAIT_CATALOG.find((d) => d.slug === slug);
}

function cam(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function domainForStation(stationId: string): DomainForfait | undefined {
  const preferred = STATION_FORFAIT_SLUG[stationId];
  if (preferred) return domainBySlug(preferred);
  const hit = FORFAIT_CATALOG.find((d) => d.stationIds.includes(stationId) || d.slug === stationId);
  if (hit) return hit;
  const key = cam(stationId);
  return FORFAIT_CATALOG.find((d) => cam(d.slug) === key || cam(d.name) === key);
}

/** Glacier : drapeau du catalogue de domaine, jamais inventé. */
export function stationHasGlacier(stationId: string): boolean {
  return domainForStation(stationId)?.glacier === true;
}

/** Km cités dans la zone de forfait (« Les 3 Vallées (600 km) »). */
export function kmInZone(zone: string | null | undefined): number | null {
  if (!zone) return null;
  const m = /(\d[\d\s]*)\s*km/i.exec(zone);
  if (!m) return null;
  const n = Number(m[1].replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

export type PassLink = {
  pass: string | null;
  zone: string | null;
  linkedKm: number | null;
  /** Forfait multi-stations publié, ou km de zone > km annoncés du domaine. */
  isLinked: boolean;
  line: string | null;
};

export function passLinkFor(stationId: string, announcedKm: number): PassLink {
  const d = domainForStation(stationId);
  if (!d) return { pass: null, zone: null, linkedKm: null, isLinked: false, line: null };
  const zone = d.seed?.zone ?? null;
  const pass = d.pass ?? null;
  const linkedKm = kmInZone(zone);
  const isLinked = pass != null || (linkedKm != null && linkedKm > announcedKm);
  return { pass, zone, linkedKm, isLinked, line: zone ?? pass };
}

const FORFAIT_ANCHORS: [number, number][] = [
  [20, 90],
  [50, 160],
  [100, 230],
  [150, 280],
  [300, 340],
  [600, 380],
];

function interpolate(anchors: [number, number][], x: number): number {
  if (x <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return anchors[anchors.length - 1][1];
}

/** Estimé seulement s’il n’existe aucun relevé. Exclu du coût officiel. */
export function estimateForfait(slopesKm: number, altitudeMax: number): { j1: number; j6: number; enf6: number } {
  const altitudeBonus = Math.max(0, Math.min(45, (altitudeMax - 2200) * 0.02));
  const j6 = Math.round((interpolate(FORFAIT_ANCHORS, slopesKm) + altitudeBonus) / 5) * 5;
  return { j6, j1: Math.round(j6 * 0.2), enf6: Math.round(j6 * 0.8) };
}
