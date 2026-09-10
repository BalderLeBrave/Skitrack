import type { Listing } from "@/lib/listings";

export type SourceName = Listing["source"];

export type SourceReport = {
  source: SourceName;
  ok: boolean;
  count: number;
  ms: number;
  error?: string;
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
