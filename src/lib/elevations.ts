import { create } from "zustand";

export function eleKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

type EleStore = {
  byKey: Record<string, number | null>;
  put: (rows: { lat: number; lon: number; eleM: number | null }[]) => void;
};

export const useElevations = create<EleStore>()((set) => ({
  byKey: {},
  put: (rows) =>
    set((s) => {
      const next = { ...s.byKey };
      for (const r of rows) next[eleKey(r.lat, r.lon)] = r.eleM;
      return { byKey: next };
    }),
}));

export function listingEleM(
  byKey: Record<string, number | null>,
  lat: number | null | undefined,
  lon: number | null | undefined,
): number | null | undefined {
  if (lat == null || lon == null) return null;
  const v = byKey[eleKey(lat, lon)];
  return v;
}
