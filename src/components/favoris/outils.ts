/** Les crochets et pictogrammes de Favoris et Réservation. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useGo } from "@/components/v6/go";
import { useParcours } from "@/lib/parcours";

/** « Voir les logements » : la liste de la station retenue, sinon le choix
 *  d'une station (Logements est verrouillé sans elle). */
export function useVersLogements(): () => void {
  const go = useGo();
  return useCallback(() => void go(useParcours.getState().stationId ? "lodging" : "compare"), [go]);
}

/** « Lien copié » pendant 1,8 s après une copie réussie (`copy()` de la maquette). */
export function useCopie(): { copie: boolean; copier: (texte: string | Promise<string>) => Promise<boolean> } {
  const [copie, setCopie] = useState(false);
  const minuterie = useRef<number | null>(null);
  useEffect(() => () => {
    if (minuterie.current != null) window.clearTimeout(minuterie.current);
  }, []);
  const copier = useCallback(async (texte: string | Promise<string>) => {
    try {
      await navigator.clipboard.writeText(await texte);
    } catch {
      return false;
    }
    setCopie(true);
    if (minuterie.current != null) window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(() => setCopie(false), 1800);
    return true;
  }, []);
  return { copie, copier };
}

/** Les pictogrammes des boutons de la maquette. */
export const PICTO_PARTAGER = "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13";
export const PICTO_LIEN =
  "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7";
export const PICTO_GROUPE =
  "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75";
export const PICTO_CORBEILLE = "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14";
export const PICTO_EXTERNE = "M7 17 17 7M7 7h10v10";
