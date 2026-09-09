/** Seuils mesurés, pas des minutes inventées. */
export const LIFT_FOOT_M = 200;
export const LIFT_NEAR_M = 500;
export const LIFT_KM_M = 1000;

/** Libellé d’accès ski, uniquement si la distance OSM est mesurée. */
export function skiAccessLabel(m: number | null | undefined): string | null {
  if (m == null) return null;
  if (m <= LIFT_FOOT_M) return "Au pied des pistes";
  if (m <= LIFT_NEAR_M) return "Moins de 500 m";
  if (m <= LIFT_KM_M) return "Moins de 1 km";
  return null;
}

export function withinLiftM(distToLiftM: number | null | undefined, maxM: number): boolean {
  return distToLiftM != null && distToLiftM <= maxM;
}
