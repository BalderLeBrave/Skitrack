import type { Listing } from "@/lib/listings";

export type SourceName = Listing["source"];

export type SourceReport = {
  source: SourceName;
  ok: boolean;
  count: number;
  ms: number;
  error?: string;
  /**
   * Ce que la source dit avoir pour cette recherche (ex. `filteredCount` de
   * CozyCozy), quand elle le publie : de quoi écrire « N relevées sur M ».
   */
  annoncees?: number | null;
  /**
   * Le détail du relevé, pour le journal : d'où viennent les annonces (« Cozy
   * 38, direct 408 »), et ce qui a manqué sans faire échouer la source.
   */
  note?: string;
};

export type LiveSearchInput = {
  stationId: string;
  stationName: string;
  lat: number;
  lon: number;
  checkIn: string;
  checkOut: string;
  guests: number;
  bedrooms: number;
};

export type LiveSearchResult = {
  listings: Listing[];
  sources: SourceReport[];
};
