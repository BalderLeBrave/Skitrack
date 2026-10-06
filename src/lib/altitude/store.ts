/**
 * Les altitudes des logements côté navigateur : lues au serveur par lots
 * (`lireAltitudes`), gardées dans le navigateur (une altitude ne change pas),
 * rendues par point (`cleAltitude`).
 */

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Listing } from "../listings.ts";
import { cleAltitude, pointAltitude, type Altitude } from "./altitude.ts";

/** Au plus : une vingtaine de stations relevées en entier. */
const GARDEES_MAX = 30_000;
const LOT = 400;

type EtatAltitudes = {
  /** `null` : aucune source n'a donné d'altitude pour ce point (le temps de la session). */
  parCle: Record<string, Altitude | null>;
  poser: (valeurs: Record<string, Altitude | null>) => void;
};

export const useAltitudesStore = create<EtatAltitudes>()(
  persist(
    (set) => ({
      parCle: {},
      poser: (valeurs) => set((s) => ({ parCle: { ...s.parCle, ...valeurs } })),
    }),
    {
      name: "skitrack-altitudes",
      version: 1,
      // Seules les altitudes trouvées se gardent, les plus récentes d'abord
      // quand la place manque.
      partialize: (s) => {
        const trouvees = Object.entries(s.parCle).filter(([, v]) => v != null);
        return { parCle: Object.fromEntries(trouvees.slice(-GARDEES_MAX)) };
      },
    },
  ),
);

/** Les points demandés au serveur et pas encore rendus : une seule demande par point. */
const enCours = new Set<string>();

async function demander(cles: string[], points: { lat: number; lon: number }[]): Promise<void> {
  const { lireAltitudes } = await import("./api.ts");
  for (let d = 0; d < points.length; d += LOT) {
    const lotCles = cles.slice(d, d + LOT);
    try {
      const vals = await lireAltitudes({ data: { points: points.slice(d, d + LOT) } });
      useAltitudesStore.getState().poser(Object.fromEntries(lotCles.map((k, i) => [k, vals[i] ?? null])));
    } catch {
      /* serveur injoignable : ces points restent « en cours » jusqu'au prochain rendu */
    } finally {
      for (const k of lotCles) enCours.delete(k);
    }
  }
}

/**
 * L'altitude de chaque annonce : `Altitude`, `null` (aucune source), ou
 * `undefined` (pas encore lue, ou sans point). Demande au serveur celles qui
 * manquent. Tout point fait l'affaire (les gares d'une remontée, dans la
 * fiche d'annonce) : seuls `lat` et `lon` sont lus.
 */
export function useAltitudes<T extends Pick<Listing, "lat" | "lon">>(
  annonces: readonly T[],
): (l: T) => Altitude | null | undefined {
  const parCle = useAltitudesStore((s) => s.parCle);
  const manquantes = useMemo(() => {
    const vus = new Map<string, { lat: number; lon: number }>();
    for (const l of annonces) {
      const p = pointAltitude(l);
      if (!p) continue;
      const k = cleAltitude(p.lat, p.lon);
      if (!(k in parCle) && !enCours.has(k)) vus.set(k, p);
    }
    return vus;
  }, [annonces, parCle]);
  useEffect(() => {
    if (manquantes.size === 0) return;
    const cles = [...manquantes.keys()].filter((k) => !enCours.has(k));
    if (cles.length === 0) return;
    for (const k of cles) enCours.add(k);
    void demander(
      cles,
      cles.map((k) => manquantes.get(k) as { lat: number; lon: number }),
    );
  }, [manquantes]);
  return useMemo(
    () => (l: T) => {
      const p = pointAltitude(l);
      if (!p) return undefined;
      return parCle[cleAltitude(p.lat, p.lon)];
    },
    [parCle],
  );
}
