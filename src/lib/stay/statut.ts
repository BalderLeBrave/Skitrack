/**
 * Le statut de chaque champ complété d'une annonce : d'où il vient, et ce
 * qu'il vaut quand il manque.
 *
 * « extracted » : le collecteur a lu un nombre. « derived » : l'aval l'a
 * tiré d'un texte ou d'un remplisseur de trous, et `raw` ou `reason` disent
 * de quoi. « unknown » : rien, avec la raison. Une valeur inconnue n'est
 * jamais 0 : un statut unknown porte toujours une valeur nulle, comme un
 * `total` à 0 n'est pas un prix (`listings.ts`).
 */

import type { Listing } from "../listings.ts";

export type FieldStatus = "extracted" | "derived" | "unknown";

export type Provenance<T> = {
  value: T | null;
  status: FieldStatus;
  /** Identifiant de la source, celui de `Listing.source`. */
  source: string;
  /** Le texte d'où la valeur a été tirée, quand elle est dérivée. */
  raw?: string;
  reason?: string;
};

export type PositionSource = "listing" | "geocoded_address";

export type NearestLift = {
  distanceM: number | null;
  liftId: string | null;
  liftName: string | null;
  liftType: string | null;
  status: FieldStatus;
  positionSource: PositionSource | null;
  liftsDatasetVersion: string | null;
  computedAt: string | null;
  reason?: string;
};

export type Completude = {
  bedrooms: Provenance<number>;
  capacity: Provenance<number>;
  capacityBase?: number | null;
  nearestLift: NearestLift;
};

/** Un objet en cours de completion : chaque partie peut manquer. */
export type AvecCompletude = { completude?: Partial<Completude> };

export type ListingComplet = Listing & { completude: Completude };

export function estStatut(s: unknown): s is FieldStatus {
  return s === "extracted" || s === "derived" || s === "unknown";
}

export function extrait<T>(value: T, source: string): Provenance<T> {
  return { value, status: "extracted", source };
}

/** `raw` et `reason` ne sont posés que s'ils sont donnés : une clé à
 *  `undefined` n'est pas une absence pour `deepEqual`. */
export function derive<T>(value: T, source: string, raw?: string, reason?: string): Provenance<T> {
  const p: Provenance<T> = { value, status: "derived", source };
  if (raw != null) p.raw = raw;
  if (reason != null) p.reason = reason;
  return p;
}

/** Une inconnue tient dans n'importe quel champ : sa valeur est nulle. */
export function inconnu(source: string, reason: string): Provenance<never> {
  return { value: null, status: "unknown", source, reason };
}

export function remonteeInconnue(reason: string): NearestLift {
  return {
    distanceM: null,
    liftId: null,
    liftName: null,
    liftType: null,
    status: "unknown",
    positionSource: null,
    liftsDatasetVersion: null,
    computedAt: null,
    reason,
  };
}
