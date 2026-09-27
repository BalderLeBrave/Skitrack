/**
 * La porte de sortie d'une annonce : ce qui en sort porte une `completude`
 * entière, aux trois champs, chacun avec son statut et sa raison.
 *
 * La porte ne lit aucun texte et ne calcule rien. La remontée vient de
 * `attachAccess` (`access.ts`) ; les chambres et la capacité, des nombres
 * que le collecteur a posés. Elle pose le statut, convertit les pièces en
 * chambres (convention du dépôt : N pièces = N-1 chambres, faite ici et non
 * chez les collecteurs), et corrige une completude qui se contredit.
 */

import type { Listing } from "../listings.ts";
import type {
  AvecCompletude,
  Completude,
  ListingComplet,
  NearestLift,
  Provenance,
} from "./statut.ts";
import { derive, estStatut, extrait, inconnu, remonteeInconnue } from "./statut.ts";

/** Relevé du jour, ou annonce relue en mémoire, dont les nombres attendent
 *  un rafraîchissement avant d'être crus. */
export type Origine = "releve" | "memoire";

const MEMOIRE = "annonce antérieure, en attente de rafraîchissement";
const NON_PUBLIE = "non publié par la source";
/** Au-delà, ce n'est plus un logement de station. */
const MAX = 50;

function entier(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

function horsBornes(v: number): string {
  return `valeur hors bornes : ${v}`;
}

function chambresDe(l: Listing, origine: Origine): Provenance<number> {
  if (origine === "memoire") return inconnu(l.source, MEMOIRE);
  if (entier(l.bedrooms, 0, MAX)) return extrait(l.bedrooms, l.source);
  if (entier(l.rooms, 1, MAX)) {
    const raw = `${l.rooms} pièce${l.rooms > 1 ? "s" : ""}`;
    return derive(Math.max(0, l.rooms - 1), l.source, raw, "pièces moins une");
  }
  // Un nombre publié mais impossible se dit ; une absence aussi.
  if (typeof l.bedrooms === "number") return inconnu(l.source, horsBornes(l.bedrooms));
  return inconnu(l.source, NON_PUBLIE);
}

function capaciteDe(l: Listing, origine: Origine): Provenance<number> {
  if (origine === "memoire") return inconnu(l.source, MEMOIRE);
  if (entier(l.guests, 1, MAX)) return extrait(l.guests, l.source);
  if (typeof l.guests === "number") return inconnu(l.source, horsBornes(l.guests));
  return inconnu(l.source, NON_PUBLIE);
}

function raisonSansRemontee(l: Listing, origine: Origine): string {
  if (origine === "memoire") return MEMOIRE;
  if (l.lat == null || l.lon == null) return "position inconnue";
  return "accès ski non calculé";
}

/** Une valeur qui contredit son statut est écartée, et la raison le dit. */
function normaliserNombre(p: Provenance<number>, min: number, source: string): Provenance<number> {
  const base: Provenance<number> = { ...p, source: p.source || source };
  if (!estStatut(p.status)) return inconnu(base.source, `statut inconnu : ${String(p.status)}`);
  if (p.status === "unknown") {
    if (p.value == null) return { ...base, value: null };
    const reason = p.reason ? `${p.reason} ; valeur écartée` : "valeur écartée";
    return { ...base, value: null, reason };
  }
  if (p.value == null) return { ...base, status: "unknown", value: null, reason: "valeur absente" };
  if (!entier(p.value, min, MAX)) {
    return { ...base, status: "unknown", value: null, reason: horsBornes(p.value) };
  }
  return base;
}

function normaliserRemontee(n: NearestLift): NearestLift {
  // La version du jeu de remontées et la date restent : elles disent qu'on
  // a cherché, même sans rien trouver.
  const vide: NearestLift = {
    distanceM: null,
    liftId: null,
    liftName: null,
    liftType: null,
    status: "unknown",
    positionSource: null,
    liftsDatasetVersion: n.liftsDatasetVersion ?? null,
    computedAt: n.computedAt ?? null,
  };
  if (!estStatut(n.status)) return { ...vide, reason: `statut inconnu : ${String(n.status)}` };
  if (n.status === "unknown") return n.reason == null ? vide : { ...vide, reason: n.reason };
  if (n.distanceM == null || !Number.isFinite(n.distanceM) || n.distanceM < 0) {
    return { ...vide, reason: "distance absente" };
  }
  const positionSource =
    n.positionSource === "listing" || n.positionSource === "geocoded_address"
      ? n.positionSource
      : null;
  const out: NearestLift = {
    distanceM: Math.round(n.distanceM / 10) * 10,
    liftId: n.liftId ?? null,
    liftName: n.liftName ?? null,
    liftType: n.liftType ?? null,
    status: n.status,
    positionSource,
    liftsDatasetVersion: n.liftsDatasetVersion ?? null,
    computedAt: n.computedAt ?? null,
  };
  return n.reason == null ? out : { ...out, reason: n.reason };
}

export function passerLaPorte(l: Listing & AvecCompletude, origine: Origine): ListingComplet {
  const c = l.completude;
  const completude: Completude = {
    bedrooms: c?.bedrooms ? normaliserNombre(c.bedrooms, 0, l.source) : chambresDe(l, origine),
    capacity: c?.capacity ? normaliserNombre(c.capacity, 1, l.source) : capaciteDe(l, origine),
    nearestLift: c?.nearestLift
      ? normaliserRemontee(c.nearestLift)
      : remonteeInconnue(raisonSansRemontee(l, origine)),
  };
  if (Number.isInteger(c?.capacityBase) && (c!.capacityBase as number) >= 1) {
    completude.capacityBase = c!.capacityBase as number;
  }
  return { ...l, completude };
}

function nombreCoherent(p: Provenance<number>, min: number): boolean {
  if (!estStatut(p.status) || typeof p.source !== "string" || p.source === "") return false;
  if (p.status === "unknown") return p.value === null;
  return entier(p.value, min, MAX);
}

function remonteeCoherente(n: NearestLift): boolean {
  if (!estStatut(n.status)) return false;
  if (n.liftsDatasetVersion === undefined || n.computedAt === undefined) return false;
  if (
    n.positionSource !== null &&
    n.positionSource !== "listing" &&
    n.positionSource !== "geocoded_address"
  ) {
    return false;
  }
  if (n.status === "unknown") {
    return (
      n.distanceM === null &&
      n.liftId === null &&
      n.liftName === null &&
      n.liftType === null &&
      n.positionSource === null
    );
  }
  if (n.liftId === undefined || n.liftName === undefined || n.liftType === undefined) return false;
  return (
    typeof n.distanceM === "number" &&
    Number.isFinite(n.distanceM) &&
    n.distanceM >= 0 &&
    n.distanceM % 10 === 0
  );
}

/** Garde de forme : les trois champs sont là, et la porte n'y changerait rien. */
export function estComplet(l: Listing & AvecCompletude): l is ListingComplet {
  const c = l.completude;
  if (!c || !c.bedrooms || !c.capacity || !c.nearestLift) return false;
  if (!nombreCoherent(c.bedrooms, 0) || !nombreCoherent(c.capacity, 1)) return false;
  if (!remonteeCoherente(c.nearestLift)) return false;
  return (
    c.capacityBase === undefined ||
    (Number.isInteger(c.capacityBase) && (c.capacityBase as number) >= 1)
  );
}
