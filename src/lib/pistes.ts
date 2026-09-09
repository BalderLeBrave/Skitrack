/** Mix de pistes : parts OSM × kilométrage annoncé. On n’invente ni le total ni la répartition. */

export type PisteColor = "green" | "blue" | "red" | "black" | "other";
export type PisteUnit = "count" | "km" | "pct";
export type PistePreset = "all" | "famille" | "mixte" | "engage" | "expert" | "haut" | "glacier" | "lie" | "itineraires";

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

/** Profils : parts OSM (comptes) + altitudes France Montagnes + glacier catalogue. Pas de km inventés. */
export const PISTE_PRESETS = {
  famille: { minShareGreenBlue: 0.6, maxShareBlack: 0.15 },
  mixte: { maxShareAnyClassic: 0.5 },
  /** Dénivelé FM ≥ 1 800 m, ou ≥ 40 % rouges+noires OSM (Chamonix). */
  engage: { minDropM: 1800, minShareRedBlack: 0.4 },
  /** Sommet FM ≥ 3 000 m, ou ≥ 12 noires OSM (Chamonix). */
  expert: { minMaxM: 3000, minBlackCount: 12 },
  /** Sommet France Montagnes ≥ 3 000 m. */
  haut: { minMaxM: 3000 },
  /** Glacier déclaré dans le catalogue de domaine. */
  glacier: { needGlacier: true },
  /** Forfait lié publié (3 Vallées, Espace Killy, MBU…). */
  lie: { needLinked: true },
  /** Tracés OSM hors vert/bleu/rouge/noir (itinéraires, snowpark…). */
  itineraires: { minOther: 4 },
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

export type PisteStationAlt = {
  minM: number;
  maxM: number;
  glacier?: boolean;
  linked?: boolean;
};

export function stationMatchesPiste(
  slopes: StationSlopes,
  f: PisteFilter,
  alt?: PisteStationAlt,
): boolean {
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
  if (classic <= 0 && f.preset !== "all" && f.preset !== "glacier" && f.preset !== "haut" && f.preset !== "lie" && f.preset !== "itineraires") return false;
  const share = (n: number) => (classic > 0 ? n / classic : 0);
  const c = slopes.counts;
  const dropM = alt != null ? Math.max(0, alt.maxM - alt.minM) : null;
  const maxM = alt?.maxM ?? null;

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
    const p = PISTE_PRESETS.engage;
    const steep = share((c.red ?? 0) + (c.black ?? 0)) >= p.minShareRedBlack;
    const big = dropM != null && dropM >= p.minDropM;
    return steep || big;
  }
  if (f.preset === "expert") {
    const p = PISTE_PRESETS.expert;
    const high = maxM != null && maxM >= p.minMaxM;
    const blacks = (c.black ?? 0) >= p.minBlackCount;
    return high || blacks;
  }
  if (f.preset === "haut") {
    return maxM != null && maxM >= PISTE_PRESETS.haut.minMaxM;
  }
  if (f.preset === "glacier") {
    return alt?.glacier === true;
  }
  if (f.preset === "lie") {
    return alt?.linked === true;
  }
  if (f.preset === "itineraires") {
    return (c.other ?? 0) >= PISTE_PRESETS.itineraires.minOther;
  }
  return true;
}

export function formatKm(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}
