/**
 * Les tracés des pistes autour d'une station (`public/pistes-traces/`, écrits
 * par `scripts/build-pistes-traces.mjs`), pour mesurer la piste la plus
 * proche d'un logement. Un fichier par domaine, chargé une fois.
 */

import { useEffect, useState } from "react";
import indexBrut from "@/lib/pistesDetail.index.json";
import type { IndexStation } from "@/lib/pistesDetail";
import type { FichierTraces } from "@/lib/stay/accesPistes";

const INDEX = indexBrut as unknown as { stations: Record<string, IndexStation> };
const charges = new Map<string, Promise<FichierTraces | null>>();

function charger(fichier: string): Promise<FichierTraces | null> {
  let p = charges.get(fichier);
  if (!p) {
    p = fetch(`/pistes-traces/${fichier}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<FichierTraces>) : null))
      .catch(() => null);
    charges.set(fichier, p);
  }
  return p;
}

/**
 * Les tracés du domaine d'une station : `undefined` pendant le chargement,
 * `null` si la station n'a pas de domaine connu ou si le fichier manque.
 */
export function useTracesPistes(stationId: string | null | undefined): FichierTraces | null | undefined {
  const fichier = stationId ? (INDEX.stations[stationId]?.fichier ?? null) : null;
  const [etat, setEtat] = useState<{ fichier: string | null; traces: FichierTraces | null } | null>(null);
  useEffect(() => {
    if (!fichier) return;
    let fini = false;
    void charger(fichier).then((traces) => {
      if (!fini) setEtat({ fichier, traces });
    });
    return () => {
      fini = true;
    };
  }, [fichier]);
  if (!fichier) return null;
  return etat?.fichier === fichier ? etat.traces : undefined;
}
