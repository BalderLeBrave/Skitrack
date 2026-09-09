/** Indice interne (chutes + vent). Ce n’est pas le BRA. */

export type InternalSnow = {
  source: "interne";
  label: "indice interne";
  note: string;
  level: number | null;
  snowfall24hCm: number | null;
  windKmh: number | null;
  snowDepthCm: number | null;
};

export function internalIndex(snowfall24hCm: number | null, windKmh: number | null): number | null {
  if (snowfall24hCm == null && windKmh == null) return null;
  const snow = snowfall24hCm ?? 0;
  const wind = windKmh ?? 0;
  if (snow >= 40 || wind >= 80) return 5;
  if (snow >= 25 || wind >= 60) return 4;
  if (snow >= 12 || wind >= 40) return 3;
  if (snow >= 4 || wind >= 25) return 2;
  return 1;
}

export function describeInternal(level: number | null): InternalSnow {
  return {
    source: "interne",
    label: "indice interne",
    note: "Indice interne (chutes + vent). Ce n’est pas le BRA officiel Météo-France.",
    level,
    snowfall24hCm: null,
    windKmh: null,
    snowDepthCm: null,
  };
}
