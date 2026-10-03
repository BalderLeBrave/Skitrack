/**
 * Les altitudes de points, côté serveur (voir `altitude.ts`) : l'IGN par lots
 * de 200 points, puis Open-Meteo pour ceux qu'il laisse sans valeur. Gardées
 * pour le processus : une altitude ne change pas.
 */

import { altitudePlausible, cleAltitude, lireIgn, type Altitude } from "./altitude.ts";

const IGN = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json";
/** Le service refuse au-delà (relevé le 3 octobre 2026 : 200 passent, 500 non). */
const LOT_IGN = 200;
const CACHE_MAX = 200_000;
const cache = new Map<string, Altitude | null>();

function garder(k: string, v: Altitude | null): void {
  cache.set(k, v);
  if (cache.size <= CACHE_MAX) return;
  for (const k2 of cache.keys()) {
    if (cache.size <= CACHE_MAX * 0.75) break;
    cache.delete(k2);
  }
}

async function lotIgn(pts: readonly { lat: number; lon: number }[]): Promise<(number | null)[]> {
  try {
    const res = await fetch(IGN, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        lon: pts.map((p) => p.lon.toFixed(6)).join("|"),
        lat: pts.map((p) => p.lat.toFixed(6)).join("|"),
        resource: "ign_rge_alti_wld",
        // Le service attend la chaîne « true » : un booléen JSON est refusé (400).
        zonly: "true",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return pts.map(() => null);
    return lireIgn(await res.json(), pts.length);
  } catch {
    return pts.map(() => null);
  }
}

/** L'altitude de chaque point, `null` quand aucune source ne la donne. */
export async function altitudes(pts: readonly { lat: number; lon: number }[]): Promise<(Altitude | null)[]> {
  const out: (Altitude | null)[] = new Array(pts.length).fill(null);
  const manquants: number[] = [];
  pts.forEach((p, i) => {
    const k = cleAltitude(p.lat, p.lon);
    if (cache.has(k)) out[i] = cache.get(k) ?? null;
    else manquants.push(i);
  });
  const sansIgn: number[] = [];
  for (let d = 0; d < manquants.length; d += LOT_IGN) {
    const lot = manquants.slice(d, d + LOT_IGN);
    const vals = await lotIgn(lot.map((i) => pts[i]));
    lot.forEach((i, j) => {
      const m = vals[j];
      if (m == null) sansIgn.push(i);
      else out[i] = { m, source: "ign" };
    });
  }
  if (sansIgn.length > 0) {
    const { fetchElevations } = await import("../snow/openMeteo.server");
    const vals = await fetchElevations(sansIgn.map((i) => pts[i]));
    sansIgn.forEach((i, j) => {
      const m = vals[j];
      out[i] = altitudePlausible(m) ? { m: Math.round(m), source: "dem" } : null;
    });
  }
  // Seules les altitudes trouvées se gardent : un service muet un instant ne
  // laisse pas un point sans altitude pour toute la vie du processus.
  for (const i of manquants) if (out[i]) garder(cleAltitude(pts[i].lat, pts[i].lon), out[i]);
  return out;
}
