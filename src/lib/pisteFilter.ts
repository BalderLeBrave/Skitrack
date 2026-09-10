import { create } from "zustand";
import { persist } from "zustand/middleware";
import { EMPTY_PISTE_FILTER, type PisteFilter, type PistePreset, type PisteUnit } from "./pistes";

const PRESETS: PistePreset[] = ["all", "famille", "mixte", "engage", "expert", "haut", "glacier", "lie", "itineraires"];

function asPreset(v: unknown): PistePreset {
  return PRESETS.includes(v as PistePreset) ? (v as PistePreset) : "all";
}

type Store = PisteFilter & {
  setUnit: (unit: PisteUnit) => void;
  setPreset: (preset: PistePreset) => void;
  setMin: (key: "minGreen" | "minBlue" | "minRed" | "minBlack", n: number) => void;
  reset: () => void;
};

export const usePisteFilter = create<Store>()(
  persist(
    (set) => ({
      ...EMPTY_PISTE_FILTER,
      setUnit: (unit) => set({ unit, minGreen: 0, minBlue: 0, minRed: 0, minBlack: 0 }),
      setPreset: (preset) => set({ preset }),
      setMin: (key, n) => set({ [key]: n }),
      reset: () => set(EMPTY_PISTE_FILTER),
    }),
    {
      name: "skitrack-pistes",
      partialize: (s) => ({
        unit: s.unit,
        preset: s.preset,
        minGreen: s.minGreen,
        minBlue: s.minBlue,
        minRed: s.minRed,
        minBlack: s.minBlack,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PisteFilter>;
        return {
          ...current,
          ...p,
          unit: p.unit ?? "count",
          preset: asPreset(p.preset),
          minGreen: p.minGreen ?? 0,
          minBlue: p.minBlue ?? 0,
          minRed: p.minRed ?? 0,
          minBlack: p.minBlack ?? 0,
        };
      },
    },
  ),
);
