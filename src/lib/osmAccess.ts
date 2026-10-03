import { OSM_ACCESS, OSM_LIFTS, type OsmPt } from "./osmAccess.data.ts";
import { asHit, mateOf, metresBetween } from "./remontees.ts";
import { aTraduire, tr, trN } from "./i18n/tr.ts";

export { metresBetween };

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

/** « de la télécabine », puis avec son nom : le complément d'une distance (« 300 m de la télécabine »). */
const KIND_FR: Record<string, { label: string; seul: string; nomme: string }> = {
  gondola: { label: aTraduire("télécabine"), seul: aTraduire("de la télécabine"), nomme: aTraduire("de la télécabine {nom}") },
  cable_car: { label: aTraduire("téléphérique"), seul: aTraduire("du téléphérique"), nomme: aTraduire("du téléphérique {nom}") },
  chair_lift: { label: aTraduire("télésiège"), seul: aTraduire("du télésiège"), nomme: aTraduire("du télésiège {nom}") },
  mixed_lift: { label: aTraduire("télémixte"), seul: aTraduire("du télémixte"), nomme: aTraduire("du télémixte {nom}") },
  funicular: { label: aTraduire("funiculaire"), seul: aTraduire("du funiculaire"), nomme: aTraduire("du funiculaire {nom}") },
};
const KIND_AUTRE = { label: aTraduire("remontée"), seul: aTraduire("de la remontée"), nomme: aTraduire("de la remontée {nom}") };

const KIND_PLURAL: Record<string, readonly [string, string]> = {
  gondola: [aTraduire("{n} télécabine"), aTraduire("{n} télécabines")],
  cable_car: [aTraduire("{n} téléphérique"), aTraduire("{n} téléphériques")],
  mixed_lift: [aTraduire("{n} télémixte"), aTraduire("{n} télémixtes")],
  chair_lift: [aTraduire("{n} télésiège"), aTraduire("{n} télésièges")],
  funicular: [aTraduire("{n} funiculaire"), aTraduire("{n} funiculaires")],
};

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
 *
 * Une fois `domainFit` d'accord, `attachAccess` prend la plus proche de cette
 * gare et de `nearestAnyLift` : la liste de la station est incomplète pour
 * plusieurs d'entre elles (voir `remontees.ts`).
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
  return tr((KIND_FR[kind ?? ""] ?? KIND_AUTRE).label);
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
    const [un, plusieurs] = KIND_PLURAL[kind] ?? [aTraduire("{n} remontée"), aTraduire("{n} remontées")];
    bits.push(trN(n, un, plusieurs));
  };
  push(f.cable_car, "cable_car");
  push(f.gondola, "gondola");
  push(f.mixed_lift, "mixed_lift");
  push(f.chair_lift, "chair_lift");
  push(f.funicular, "funicular");
  const total = trN(f.unique, "{n} remontée OSM", "{n} remontées OSM");
  if (bits.length === 0) return total;
  return tr("{total} : {detail}", { total, detail: bits.join(" · ") });
}

export function liftKindPhrase(kind: string | null | undefined, name: string | null | undefined): string {
  const fr = KIND_FR[kind ?? ""] ?? KIND_AUTRE;
  const nom = (name ?? "").trim();
  if (!nom) return tr(fr.seul);
  if (new RegExp(`^(ts|tc|tph|tcd|tél[ée]|super\\s)`, "i").test(nom)) {
    return tr("de {remontee}", { remontee: nom });
  }
  return tr(fr.nomme, { nom });
}

/** Titre de lieu publié, sans inventer de toponyme. */
export function displayLocality(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, " ").trim();
  if (s.length < 2) return null;
  return s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_all, sep: string, ch: string) => sep + ch.toUpperCase());
}
