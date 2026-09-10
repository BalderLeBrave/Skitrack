/** Fiche station : uniquement des champs publiés (Skiinfo, IGN, catalogue). */

import { domainForStation, passLinkFor } from "./forfaits/catalog.ts";
import {
  classicCount,
  displayPct,
  PISTE_CLASSIC,
  scaleKm,
  type PisteColor,
} from "./pistes.ts";
import { SKIINFO, SKIINFO_AT, slopesFromRow } from "./skiinfo.ts";
import type { SkiinfoLive } from "./skiinfoStore.ts";
import { type PinKind, type Station } from "./stations.ts";

const COLOR_FR: Record<(typeof PISTE_CLASSIC)[number], string> = {
  green: "Verte",
  blue: "Bleue",
  red: "Rouge",
  black: "Noire",
};

export type FicheMixRow = {
  color: (typeof PISTE_CLASSIC)[number];
  label: string;
  n: number;
  pct: number;
  km: number;
};

export type StationFiche = {
  id: string;
  name: string;
  massif: string;
  villageM: number;
  minM: number;
  maxM: number;
  dropM: number;
  demM: number | null;
  pinKind: PinKind;
  lat: number;
  lon: number;
  mix: FicheMixRow[];
  n: number;
  km: number | null;
  longestKm: number | null;
  grain: "station" | "valley";
  skiinfoUrl: string | null;
  skiinfoAt: string;
  hasMix: boolean;
  domainName: string | null;
  domainKm: number | null;
  domainLifts: number | null;
  glacier: boolean;
  passLine: string | null;
  website: string | null;
  fmId: number | null;
};

export function stationFiche(station: Station, live?: SkiinfoLive | null): StationFiche {
  const row = live ?? SKIINFO[station.id];
  const slopes = live ? slopesFromRow(live) : station.slopes;
  const split = scaleKm(slopes);
  const minM = live?.minM ?? station.minM;
  const maxM = live?.maxM ?? station.maxM;
  const mix: FicheMixRow[] = PISTE_CLASSIC.map((color) => ({
    color,
    label: COLOR_FR[color],
    n: slopes.counts[color] ?? 0,
    pct: displayPct(slopes, color),
    km: split[color],
  }));
  const cat = domainForStation(station.id);
  const link = passLinkFor(station.id, slopes.announcedKm);
  return {
    id: station.id,
    name: station.name,
    massif: station.massif,
    villageM: station.villageM,
    minM,
    maxM,
    dropM: maxM - minM,
    demM: station.demM,
    pinKind: station.pinKind,
    lat: station.lat,
    lon: station.lon,
    mix,
    n: classicCount(slopes.counts),
    km: row?.km ?? (slopes.announcedKm > 0 ? slopes.announcedKm : null),
    longestKm: row?.longestKm ?? null,
    grain: row?.grain ?? slopes.skiinfoGrain ?? "station",
    skiinfoUrl: row?.url ?? null,
    skiinfoAt: live?.fetchedAt?.slice(0, 10) ?? row?.at ?? SKIINFO_AT,
    hasMix: Boolean(row?.hasMix && row.n != null),
    domainName: cat?.name ?? null,
    domainKm: cat?.km ?? null,
    domainLifts: cat?.lifts ?? null,
    glacier: cat?.glacier === true,
    passLine: link.line,
    website: cat?.websiteVerified ? cat.website : null,
    fmId: station.fmId,
  };
}

export function pinKindLabel(kind: PinKind): string {
  if (kind === "sommet") return "pin au sommet";
  if (kind === "base") return "pin au village";
  if (kind === "autre") return "pin IGN (entre base et sommet, ou hors station)";
  return "pin non mesuré";
}

export function colorLabel(color: PisteColor): string {
  if (color === "other") return "Autre";
  return COLOR_FR[color];
}
