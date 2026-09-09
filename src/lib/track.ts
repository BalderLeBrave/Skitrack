import { create } from "zustand";
import { persist } from "zustand/middleware";
import { parseGpx, type GpxPoint, type GpxStats } from "./gpx";

type TrackStore = {
  name: string | null;
  fileName: string | null;
  points: GpxPoint[];
  stats: GpxStats | null;
  error: string | null;
  loadText: (xml: string, fileName: string) => void;
  clear: () => void;
};

export const useTrack = create<TrackStore>()(
  persist(
    (set) => ({
      name: null,
      fileName: null,
      points: [],
      stats: null,
      error: null,
      loadText: (xml, fileName) => {
        try {
          const track = parseGpx(xml, fileName);
          set({
            name: track.name,
            fileName,
            points: track.points,
            stats: track.stats,
            error: null,
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "GPX illisible.",
          });
        }
      },
      clear: () => set({ name: null, fileName: null, points: [], stats: null, error: null }),
    }),
    {
      name: "skitrack-track",
      partialize: (s) => ({
        name: s.name,
        fileName: s.fileName,
        points: s.points.map((p) => ({ lat: p.lat, lon: p.lon, ele: p.ele, timeMs: null })),
        stats: s.stats,
      }),
    },
  ),
);
