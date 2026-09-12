/** Témoin OpenSkiMap (OSM / OpenSnowMap). Pas OpenSnow.com. Jamais injecté dans le mix. */

import raw from "./openskimap.snapshot.json" with { type: "json" };
import { SKIINFO } from "./skiinfo.ts";
import { DEPOT_STATIONS, type Station } from "./stations.ts";

export type OsmVerdict = "ok" | "segments" | "km_court" | "grain_domaine" | "ecart_n" | "osm_absent";

export type OsmCounts = { green: number; blue: number; red: number; black: number };

export type OsmHit = {
  osmId: string;
  name: string;
  n: number;
  km: number;
  counts: OsmCounts;
  kms: OsmCounts;
  nOther: number;
  minM: number | null;
  maxM: number | null;
  lifts: number;
  distKm: number | null;
  verdict: Exclude<OsmVerdict, "osm_absent">;
};

export type OsmRow = OsmHit | { verdict: "osm_absent" };

type Snapshot = { at: string; source: string; rows: Record<string, OsmRow> };

const snap = raw as Snapshot;
export const OPENSKIMAP_AT = snap.at;
export const OPENSKIMAP: Record<string, OsmRow> = snap.rows;

export function osmFor(id: string): OsmHit | null {
  const row = OPENSKIMAP[id];
  if (!row || row.verdict === "osm_absent") return null;
  return row;
}

export const OSM_VERDICT_FR: Record<OsmVerdict, string> = {
  ok: "OSM ≈ Skiinfo",
  segments: "OSM compte des segments, pas des pistes brochure",
  km_court: "km OSM < km Skiinfo (mesuré vs annoncé)",
  grain_domaine: "OSM = domaine lié, pas la station seule",
  ecart_n: "écart de comptes > 25 %",
  osm_absent: "pas de domaine downhill OpenSkiMap",
};

export type OsmSkiRow = {
  id: string;
  name: string;
  massif: string;
  osmName: string | null;
  nOsm: number | null;
  nSki: number | null;
  kmOsm: number | null;
  kmSki: number | null;
  minOsm: number | null;
  maxOsm: number | null;
  minSki: number | null;
  maxSki: number | null;
  ignM: number | null;
  verdict: OsmVerdict;
};

export function osmSkiinfo(station: Station): OsmSkiRow {
  const osm = osmFor(station.id);
  const si = SKIINFO[station.id];
  return {
    id: station.id,
    name: station.name,
    massif: station.massif,
    osmName: osm?.name ?? null,
    nOsm: osm?.n ?? null,
    nSki: si?.n ?? null,
    kmOsm: osm?.km ?? null,
    kmSki: si?.km ?? null,
    minOsm: osm?.minM ?? null,
    maxOsm: osm?.maxM ?? null,
    minSki: si?.minM ?? null,
    maxSki: si?.maxM ?? null,
    ignM: station.demM,
    verdict: osm?.verdict ?? "osm_absent",
  };
}

/** Comparaison adossée à la fiche Skiinfo : seules les stations du dépôt
 *  en ont une, le classeur seul n’est pas comparable. */
export function osmSkiinfoAll(stations: readonly Station[] = DEPOT_STATIONS): OsmSkiRow[] {
  return stations.map(osmSkiinfo);
}

export type OsmSkiSummary = {
  n: number;
  ok: number;
  segments: number;
  km_court: number;
  grain_domaine: number;
  ecart_n: number;
  osm_absent: number;
};

export function osmSkiinfoSummary(rows: readonly OsmSkiRow[]): OsmSkiSummary {
  const count = (v: OsmVerdict) => rows.filter((r) => r.verdict === v).length;
  return {
    n: rows.length,
    ok: count("ok"),
    segments: count("segments"),
    km_court: count("km_court"),
    grain_domaine: count("grain_domaine"),
    ecart_n: count("ecart_n"),
    osm_absent: count("osm_absent"),
  };
}
