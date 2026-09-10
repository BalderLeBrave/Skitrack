import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Listing } from "./listings";
import type { SourceReport } from "./scrape/types";

export type Stay = {
  stationId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  bedrooms: number;
  shortlist: string[];
  searchNonce: number;
};

type StayStore = Stay & {
  setStay: (patch: Partial<Stay>) => void;
  toggleShort: (id: string) => void;
  liveListings: Listing[] | null;
  liveSources: SourceReport[];
  searching: boolean;
  setLive: (rows: Listing[] | null, sources: SourceReport[], searching: boolean) => void;
  mergeLive: (rows: Listing[], sources: SourceReport[]) => void;
  setSearching: (searching: boolean) => void;
};

export const useStay = create<StayStore>()(
  persist(
    (set) => ({
      stationId: "les-2-alpes",
      checkIn: "2027-02-06",
      checkOut: "2027-02-13",
      guests: 8,
      bedrooms: 0,
      shortlist: [],
      searchNonce: 0,
      liveListings: null,
      liveSources: [],
      searching: false,
      setStay: (patch) => set(patch),
      toggleShort: (id) =>
        set((s) => ({
          shortlist: s.shortlist.includes(id)
            ? s.shortlist.filter((x) => x !== id)
            : s.shortlist.length >= 4
              ? s.shortlist
              : [...s.shortlist, id],
        })),
      setLive: (rows, sources, searching) =>
        set({ liveListings: rows, liveSources: sources, searching }),
      mergeLive: (rows, sources) =>
        set((s) => {
          const replaced = new Set(sources.map((x) => x.source));
          const listings = [...(s.liveListings ?? []).filter((l) => !replaced.has(l.source)), ...rows].sort(
            (a, b) => a.total - b.total,
          );
          return {
            liveListings: listings,
            liveSources: [...s.liveSources.filter((r) => !replaced.has(r.source)), ...sources],
          };
        }),
      setSearching: (searching) => set({ searching }),
    }),
    {
      name: "skitrack-stay",
      partialize: (s) => ({
        stationId: s.stationId,
        checkIn: s.checkIn,
        checkOut: s.checkOut,
        guests: s.guests,
        bedrooms: s.bedrooms,
        shortlist: s.shortlist,
      }),
    },
  ),
);
