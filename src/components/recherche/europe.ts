/**
 * Les domaines européens hors France, chargés à part (`europe.ts`) : vrai
 * quand ils sont là. `charger` les demande ; l'écran se redessine à leur
 * arrivée, pour que les suggestions et la station retenue en tiennent compte.
 */

import { useEffect, useSyncExternalStore } from "react";
import { chargerEurope, europeChargee, surEuropeChargee } from "@/lib/europe";

export function useEurope(charger: boolean): boolean {
  const pretes = useSyncExternalStore(surEuropeChargee, europeChargee, () => false);
  useEffect(() => {
    if (charger && !pretes) chargerEurope().catch(() => {});
  }, [charger, pretes]);
  return pretes;
}
