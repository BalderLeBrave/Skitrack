/** Le compte des classes de `Histogramme`, sans React : éprouvable seul. */

/** Les effectifs par classe : `bins` classes égales sur `bornes`, valeurs hors échelle rangées aux bords. */
export function classesHistogramme(
  valeurs: readonly number[],
  bornes: readonly [number, number],
  bins: number,
): number[] {
  const [b0, b1] = bornes;
  const n = Math.max(1, Math.floor(bins));
  const counts = Array<number>(n).fill(0);
  const w = (b1 - b0) / n || 1;
  for (const v of valeurs) {
    if (!Number.isFinite(v)) continue;
    counts[Math.max(0, Math.min(n - 1, Math.floor((v - b0) / w)))]++;
  }
  return counts;
}
