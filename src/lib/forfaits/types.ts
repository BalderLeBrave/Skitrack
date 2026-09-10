/** Tarif de forfait : relevé, saisi, estimé ou en erreur. Rien n’est inventé. */

export type ForfaitStatus = "ok" | "stale" | "erreur" | "estimé" | "manuel";

export type ForfaitKind = "journée" | "6 jours" | "saison" | null;

export type ForfaitReading = {
  at: string;
  j1: number | null;
  j6: number | null;
  enf6: number | null;
  sourceUrl: string | null;
};

export type ForfaitRow = {
  slug: string;
  j1: number | null;
  j6: number | null;
  enf6: number | null;
  kind: ForfaitKind;
  validFrom: string | null;
  validTo: string | null;
  sourceUrl: string | null;
  fetchedAt: string | null;
  lastAttemptAt: string | null;
  status: ForfaitStatus;
  locked: boolean;
  lastError: string | null;
  parseKind: string | null;
  history: ForfaitReading[];
};

export type ForfaitSeed = {
  j1: number | null;
  j6: number | null;
  enf6: number | null;
  saison: number | null;
  zone: string | null;
  maj: string | null;
  majLabel: string | null;
};

export type DomainForfait = {
  id: number;
  slug: string;
  name: string;
  massif: string;
  region: string;
  minM: number;
  maxM: number;
  villageM: number;
  km: number;
  lifts: number;
  glacier: boolean;
  pass: string | null;
  lat: number;
  lon: number;
  country: "FR";
  website: string | null;
  websiteVerified: boolean;
  seed: ForfaitSeed | null;
  stationIds: string[];
};

export type ExtractedForfait = {
  j1: number | null;
  j6: number | null;
  enf6: number | null;
  kind: string;
};
