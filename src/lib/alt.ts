/** Altitudes par source, grain station. On n’en fusionne aucune. */

import { domainForStation } from "./forfaits/catalog.ts";
import { SKIINFO } from "./skiinfo.ts";
import { dropM, type Station } from "./stations.ts";

export type AltSourceId = "village" | "fm" | "skiinfo" | "ign" | "catalog";

export type AltBand = {
  source: AltSourceId;
  label: string;
  villageM: number | null;
  minM: number | null;
  maxM: number | null;
  dropM: number | null;
};

function band(
  source: AltSourceId,
  label: string,
  villageM: number | null,
  minM: number | null,
  maxM: number | null,
): AltBand {
  const drop = minM != null && maxM != null ? Math.max(0, maxM - minM) : null;
  return { source, label, villageM, minM, maxM, dropM: drop };
}

export function altBands(station: Station): AltBand[] {
  const out: AltBand[] = [
    band("village", "Village (cette station)", station.villageM, null, null),
  ];
  const si = SKIINFO[station.id];
  if (si?.minM != null || si?.maxM != null) {
    out.push(band("skiinfo", "Skiinfo (cette fiche)", null, si.minM ?? null, si.maxM ?? null));
  }
  if (station.fmId != null && (station.fmMinM != null || station.fmMaxM != null)) {
    out.push(
      band("fm", "France Montagnes", station.fmVillageM, station.fmMinM, station.fmMaxM),
    );
  }
  if (station.demM != null) {
    const pin =
      station.pinKind === "sommet"
        ? "IGN au pin (sommet, pas le village)"
        : station.pinKind === "base"
          ? "IGN au pin (village)"
          : "IGN au pin GPS";
    out.push(band("ign", pin, station.pinKind === "sommet" ? null : station.demM, null, station.pinKind === "sommet" ? station.demM : null));
  }
  const cat = domainForStation(station.id);
  if (cat && (cat.villageM != null || cat.minM != null || cat.maxM != null)) {
    out.push(band("catalog", "Catalogue domaine", cat.villageM ?? null, cat.minM ?? null, cat.maxM ?? null));
  }
  return out;
}

export function altDeltaM(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return a - b;
}

export function displaySummitM(station: Station): number {
  return station.maxM;
}

export function displayDropM(station: Station): number {
  return dropM(station);
}
