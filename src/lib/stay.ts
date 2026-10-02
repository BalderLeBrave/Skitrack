import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Listing } from "./listings";
import type { SourceReport } from "./scrape/types";

/** Le séjour : dates, groupe, sélection, et le relevé en cours.
 *
 *  La station courante n'est **pas** ici : elle vit dans `useParcours`, et
 *  seule. Elle était tenue des deux côtés, `retain()` écrivait les deux et
 *  `relacher()` un seul ; /traces montrait alors les traces d'une station que
 *  le reste de l'application considérait comme relâchée. */
export type Stay = {
  checkIn: string;
  checkOut: string;
  guests: number;
  /** Combien, **parmi** les voyageurs, paient le tarif enfant. Jamais un
   *  compte à part : un enfant occupe un lit comme les autres. */
  children: number;
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
  /** Remplace, par identifiant, des annonces déjà affichées (relecture des fiches) ; les autres restent. */
  patchLive: (rows: Listing[]) => void;
  setSearching: (searching: boolean) => void;
};

export const useStay = create<StayStore>()(
  persist(
    (set) => ({
      checkIn: "2027-02-06",
      checkOut: "2027-02-13",
      guests: 8,
      children: 0,
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
      patchLive: (rows) =>
        set((s) => {
          if (!s.liveListings || rows.length === 0) return {};
          const parId = new Map(rows.map((r) => [r.id, r]));
          // Une relecture qui ne change rien ne redessine pas l'écran : les
          // annonces sont comparées telles qu'elles ont fait l'aller-retour.
          let change = false;
          const suivantes = s.liveListings.map((l) => {
            const r = parId.get(l.id);
            if (!r || JSON.stringify(r) === JSON.stringify(l)) return l;
            change = true;
            return r;
          });
          return change ? { liveListings: suivantes } : {};
        }),
      setSearching: (searching) => set({ searching }),
    }),
    {
      name: "skitrack-stay",
      partialize: (s) => ({
        checkIn: s.checkIn,
        checkOut: s.checkOut,
        guests: s.guests,
        children: s.children,
        bedrooms: s.bedrooms,
        shortlist: s.shortlist,
      }),
    },
  ),
);
