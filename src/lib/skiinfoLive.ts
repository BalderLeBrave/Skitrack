import { create } from "zustand";
import type { SkiinfoLive } from "./skiinfoStore";

type Store = {
  rows: Record<string, SkiinfoLive>;
  put: (id: string, row: SkiinfoLive) => void;
};

export const useSkiinfoLive = create<Store>()((set) => ({
  rows: {},
  put: (id, row) => set((s) => ({ rows: { ...s.rows, [id]: row } })),
}));
