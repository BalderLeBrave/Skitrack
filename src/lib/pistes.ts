/** Mix de pistes : parts OSM × kilométrage annoncé. On n’invente ni le total ni la répartition. */

export type PisteColor = "green" | "blue" | "red" | "black" | "other";
export type PisteUnit = "count" | "km" | "pct";
export type PistePreset = "all" | "famille" | "mixte" | "engage" | "expert";

export type PisteCounts = Partial<Record<PisteColor, number>>;

export type StationSlopes = {
  announcedKm: number;
  counts: PisteCounts;
  source: "osm";
};

export const PISTE_CLASSIC: Exclude<PisteColor, "other">[] = ["green", "blue", "red", "black"];
export const PISTE_HEX: Record<PisteColor, string> = {
  green: "#22A34A",
  blue: "#2B6CB0",
  red: "#C53030",
  black: "#1A1A1A",
  other: "#718096",
};

/** Profils sur les parts OSM (comptes), pas sur des km inventés. */
export const PISTE_PRESETS = {
  famille: { minShareGreenBlue: 0.6, maxShareBlack: 0.15 },
  mixte: { maxShareAnyClassic: 0.5 },
  engage: { minShareRedBlack: 0.5 },
  expert: { minBlackCount: 8, minShareBlack: 0.2 },
} as const;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function allocateToTotal(shares: number[], total: number): number[] {
  const units = Math.round(total * 10);
  const weight = shares.reduce((n, s) => n + s, 0);
  if (weight <= 0 || units <= 0) return shares.map(() => 0);
  const raw = shares.map((s) => (s / weight) * units);
  const floors = raw.map(Math.floor);
  let left = units - floors.reduce((n, v) => n + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < left; k++) floors[order[k % order.length].i] += 1;
  return floors.map((n) => n / 10);
}

export type PisteSplit = {
  green: number;
  blue: number;
  red: number;
  black: number;
  other: number;
  total: number;
};

export function scaleKm(slopes: StationSlopes): PisteSplit {
  const c = slopes.counts;
  const weights = [c.green ?? 0, c.blue ?? 0, c.red ?? 0, c.black ?? 0, c.other ?? 0];
  const parts = allocateToTotal(weights, slopes.announcedKm);
  const split: PisteSplit = {
    green: parts[0] ?? 0,
    blue: parts[1] ?? 0,
    red: parts[2] ?? 0,
    black: parts[3] ?? 0,
    other: parts[4] ?? 0,
    total: 0,
  };
  split.total = round1(split.green + split.blue + split.red + split.black + split.other);
  return split;
}

export function classicCount(c: PisteCounts): number {
  return PISTE_CLASSIC.reduce((n, k) => n + (c[k] ?? 0), 0);
}

export type PisteFilter = {
  unit: PisteUnit;
  preset: PistePreset;
  minGreen: number;
  minBlue: number;
  minRed: number;
  minBlack: number;
};

export const EMPTY_PISTE_FILTER: PisteFilter = {
  unit: "count",
  preset: "all",
  minGreen: 0,
  minBlue: 0,
  minRed: 0,
  minBlack: 0,
};

export function pisteMax(unit: PisteUnit): number {
  if (unit === "pct") return 100;
  if (unit === "km") return 400;
  return 500;
}

export function stationMatchesPiste(slopes: StationSlopes, f: PisteFilter): boolean {
  const split = scaleKm(slopes);
  const value = (color: Exclude<PisteColor, "other">): number => {
    if (f.unit === "count") return slopes.counts[color] ?? 0;
    if (f.unit === "km") return split[color];
    return split.total > 0 ? (100 * split[color]) / split.total : 0;
  };
  if (f.minGreen && value("green") < f.minGreen) return false;
  if (f.minBlue && value("blue") < f.minBlue) return false;
  if (f.minRed && value("red") < f.minRed) return false;
  if (f.minBlack && value("black") < f.minBlack) return false;

  const classic = classicCount(slopes.counts);
  if (classic <= 0 && f.preset !== "all") return false;
  const share = (n: number) => (classic > 0 ? n / classic : 0);
  const c = slopes.counts;
  if (f.preset === "famille") {
    return (
      share((c.green ?? 0) + (c.blue ?? 0)) >= PISTE_PRESETS.famille.minShareGreenBlue &&
      share(c.black ?? 0) <= PISTE_PRESETS.famille.maxShareBlack
    );
  }
  if (f.preset === "mixte") {
    return PISTE_CLASSIC.every((k) => share(c[k] ?? 0) <= PISTE_PRESETS.mixte.maxShareAnyClassic);
  }
  if (f.preset === "engage") {
    return share((c.red ?? 0) + (c.black ?? 0)) >= PISTE_PRESETS.engage.minShareRedBlack;
  }
  if (f.preset === "expert") {
    const black = c.black ?? 0;
    return black >= PISTE_PRESETS.expert.minBlackCount || share(black) >= PISTE_PRESETS.expert.minShareBlack;
  }
  return true;
}

export function formatKm(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}
