import { OSM_ACCESS, OSM_LIFTS, type OsmPt } from "./osmAccess.data.ts";

export type OsmHit = {
  name: string | null;
  kind: string;
  m: number;
  lat: number;
  lon: number;
  otherLat: number | null;
  otherLon: number | null;
};

export const CABIN_KINDS = new Set(["gondola", "cable_car", "mixed_lift", "funicular"]);

const KIND_FR: Record<string, { de: string; label: string }> = {
  gondola: { de: "de la", label: "télécabine" },
  cable_car: { de: "du", label: "téléphérique" },
  chair_lift: { de: "du", label: "télésiège" },
  mixed_lift: { de: "du", label: "télémixte" },
  funicular: { de: "du", label: "funiculaire" },
};

const KIND_PLURAL: Record<string, string> = {
  gondola: "télécabines",
  cable_car: "téléphériques",
  mixed_lift: "télémixte",
  chair_lift: "télésièges",
  funicular: "funiculaires",
};

export function metresBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat);
  const dLon = toR(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function asHit(p: OsmPt, m: number, other: OsmPt | null): OsmHit {
  return {
    name: p.n,
    kind: p.k,
    m,
    lat: p.lat,
    lon: p.lon,
    otherLat: other?.lat ?? null,
    otherLon: other?.lon ?? null,
  };
}

function mateOf(lifts: OsmPt[], p: OsmPt): OsmPt | null {
  let best: OsmPt | null = null;
  let bestM = 0;
  for (const q of lifts) {
    if (q.n !== p.n || q.k !== p.k) continue;
    const m = metresBetween(p.lat, p.lon, q.lat, q.lon);
    if (m < 8 || m > 12_000) continue;
    if (m > bestM) {
      bestM = m;
      best = q;
    }
  }
  return best;
}

function nearest(pts: OsmPt[] | undefined, lat: number, lon: number): OsmHit | null {
  if (!pts || pts.length === 0) return null;
  let bestPt: OsmPt | null = null;
  let bestM = Number.POSITIVE_INFINITY;
  for (const p of pts) {
    const m = metresBetween(lat, lon, p.lat, p.lon);
    if (m < bestM) {
      bestM = m;
      bestPt = p;
    }
  }
  if (!bestPt) return null;
  return asHit(bestPt, Math.round(bestM), mateOf(pts, bestPt));
}

/**
 * La remontée la plus proche **de cette station-là**.
 *
 * L'index mondial ne sert que de filet : il répond pour une station dont le
 * référentiel ne connaît pas les remontées. Tant que la station a les siennes,
 * ce sont elles qui répondent, et aucune autre.
 *
 * Il en allait autrement, et c'était faux. L'index mondial l'emportait dès
 * qu'une remontée quelconque se trouvait plus près, à quarante kilomètres à la
 * ronde : un logement de Bonneval-sur-Arc cherché depuis Val d'Isère mesurait
 * 372 m « des remontées de Val d'Isère », parce que le tapis « Piou-piou » de
 * Bonneval était juste à côté. Les vraies remontées de Val d'Isère sont à
 * 5 249 m, de l'autre côté du col de l'Iseran, fermé l'hiver.
 *
 * L'écart n'est pas cosmétique : c'est ce chiffre qui fait dire à la fiche
 * « au pied des pistes », et `domainFit` avait pourtant déjà tranché que ce
 * logement n'était pas dans le domaine cherché. Les deux se contredisaient
 * dans la même ligne.
 */
export function nearestLift(stationId: string, lat: number, lon: number): OsmHit | null {
  const local = nearest(OSM_ACCESS[stationId]?.lifts, lat, lon);
  if (local) return local;
  const world = nearest(OSM_LIFTS, lat, lon);
  return world && world.m <= 40_000 ? world : null;
}

export function nearestPlace(stationId: string, lat: number, lon: number): OsmHit | null {
  return nearest(OSM_ACCESS[stationId]?.places, lat, lon);
}

export function isCabinLift(kind: string | null | undefined): boolean {
  return kind != null && CABIN_KINDS.has(kind);
}

export function liftKindLabel(kind: string | null | undefined): string {
  return KIND_FR[kind ?? ""]?.label ?? "remontée";
}

export type StationLift = {
  name: string | null;
  kind: string;
  aLat: number;
  aLon: number;
  bLat: number | null;
  bLon: number | null;
};

export function stationLifts(stationId: string): StationLift[] {
  const lifts = OSM_ACCESS[stationId]?.lifts ?? [];
  const seen = new Set<string>();
  const out: StationLift[] = [];
  for (const p of lifts) {
    const key = `${p.n ?? ""}|${p.k}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const other = mateOf(lifts, p);
    out.push({
      name: p.n,
      kind: p.k,
      aLat: p.lat,
      aLon: p.lon,
      bLat: other?.lat ?? null,
      bLon: other?.lon ?? null,
    });
  }
  return out;
}

export type LiftFleet = {
  unique: number;
  gondola: number;
  cable_car: number;
  chair_lift: number;
  mixed_lift: number;
  funicular: number;
};

export function liftFleet(stationId: string): LiftFleet {
  const lifts = OSM_ACCESS[stationId]?.lifts ?? [];
  const seen = new Set<string>();
  const out: LiftFleet = {
    unique: 0,
    gondola: 0,
    cable_car: 0,
    chair_lift: 0,
    mixed_lift: 0,
    funicular: 0,
  };
  for (const p of lifts) {
    const key = `${p.n ?? ""}|${p.k}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.unique += 1;
    if (p.k === "gondola") out.gondola += 1;
    else if (p.k === "cable_car") out.cable_car += 1;
    else if (p.k === "chair_lift") out.chair_lift += 1;
    else if (p.k === "mixed_lift") out.mixed_lift += 1;
    else if (p.k === "funicular") out.funicular += 1;
  }
  return out;
}

export function formatFleet(f: LiftFleet): string {
  const bits: string[] = [];
  const push = (n: number, kind: string) => {
    if (n <= 0) return;
    const label = KIND_PLURAL[kind] ?? "remontées";
    bits.push(`${n} ${label}`);
  };
  push(f.cable_car, "cable_car");
  push(f.gondola, "gondola");
  push(f.mixed_lift, "mixed_lift");
  push(f.chair_lift, "chair_lift");
  push(f.funicular, "funicular");
  if (bits.length === 0) return `${f.unique} remontées OSM`;
  return `${f.unique} remontées OSM : ${bits.join(" · ")}`;
}

export function liftKindPhrase(kind: string | null | undefined, name: string | null | undefined): string {
  const fr = KIND_FR[kind ?? ""] ?? { de: "de la", label: "remontée" };
  const nom = (name ?? "").trim();
  if (!nom) return `${fr.de} ${fr.label}`;
  if (new RegExp(`^(ts|tc|tph|tcd|tél[ée]|super\\s)`, "i").test(nom)) {
    return `de ${nom}`;
  }
  return `${fr.de} ${fr.label} ${nom}`;
}

/** Titre de lieu publié, sans inventer de toponyme. */
export function displayLocality(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, " ").trim();
  if (s.length < 2) return null;
  return s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_all, sep: string, ch: string) => sep + ch.toUpperCase());
}
