/**
 * La liste des communes, chargée à part (`communesProches.ts`) : vrai quand
 * elle est là. `charger` la demande ; l'écran se redessine à son arrivée,
 * pour que les suggestions et la station retenue en tiennent compte.
 */

import { useEffect, useSyncExternalStore } from "react";
import { chargerCommunes, communesChargees, surCommunesChargees } from "@/lib/communesProches";

export function useCommunes(charger: boolean): boolean {
  const pretes = useSyncExternalStore(surCommunesChargees, communesChargees, () => false);
  useEffect(() => {
    if (charger && !pretes) chargerCommunes().catch(() => {});
  }, [charger, pretes]);
  return pretes;
}
