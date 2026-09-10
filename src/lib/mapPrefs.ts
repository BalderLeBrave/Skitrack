import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_BASEMAP, resolvedBasemap, type BasemapKey } from "./mapStyle";

type MapPrefs = {
  basemap: BasemapKey;
  pistes: boolean;
  threeD: boolean;
  setBasemap: (basemap: BasemapKey) => void;
  togglePistes: () => void;
  toggle3D: () => void;
};

export const useMapPrefs = create<MapPrefs>()(
  persist(
    (set, get) => ({
      basemap: DEFAULT_BASEMAP,
      pistes: true,
      threeD: false,
      setBasemap: (basemap) => set({ basemap: resolvedBasemap(basemap) }),
      togglePistes: () => set({ pistes: !get().pistes }),
      toggle3D: () => set({ threeD: !get().threeD }),
    }),
    {
      name: "skitrack-map",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<MapPrefs>;
        return {
          ...current,
          ...p,
          basemap: resolvedBasemap(p.basemap ?? current.basemap),
        };
      },
    },
  ),
);
