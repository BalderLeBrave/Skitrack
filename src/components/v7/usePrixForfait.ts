/**
 * Le forfait d'une station pour le séjour en cours, tel que la fiche, Logements
 * et Réservation l'écrivent : le prix résolu par `resolvePassPrice` sur toutes
 * les grilles connues (officielles, migrées, relevé serveur), sa période, ses
 * bornes, son périmètre, sa fiabilité, et le budget des forfaits du groupe.
 *
 * Il remplace `useForfait`, qui lisait trois nombres sans date (journée,
 * 6 jours adulte, 6 jours enfant) : le même prix pour trois nuits et pour
 * dix, en décembre comme en février.
 */

import { useEffect, useMemo } from "react";
import { chargerGrillesForfaits } from "@/lib/forfaits/grillesApp";
import {
  budgetForfaits,
  joursDuSejour,
  journeeDuSejour,
  saisonDeLaGrille,
  type BudgetForfaits,
  type ForfaitsSejour,
} from "@/lib/forfaits/prixSejour";
import {
  forfaitsStation,
  useGrillesForfaits,
  type ContexteSejour,
} from "@/lib/forfaits/prixStations";
import type { Resolution } from "@/lib/forfaits/resolution";
import type { GrilleTarifaire } from "@/lib/forfaits/tarifsPeriode";
import { useSejour } from "@/lib/parcours";
import { todayIso } from "@/lib/stay/calendar";
import type { Station } from "@/lib/stations";

/** Les grilles, chargées au premier écran qui en a besoin. `null` avant. */
export function useGrilles(): GrilleTarifaire[] | null {
  const grilles = useGrillesForfaits((e) => e.grilles);
  useEffect(() => {
    void chargerGrillesForfaits();
  }, []);
  return grilles;
}

/**
 * Pour les listes : charge les grilles et s'abonne à elles et aux dates, pour
 * que les prix (`prixAdulteSejour`) se redessinent quand ils arrivent ou que
 * le séjour change. `jours` : les jours de ski du séjour, pour les libellés
 * (« Forfait 6 j ») ; `ctx` : ce dont les prix dépendent, pour un `useMemo`.
 */
export function usePrixStations(): { pret: boolean; jours: number | null; ctx: ContexteSejour } {
  const grilles = useGrilles();
  const { checkIn, checkOut } = useSejour();
  const ctx = useMemo(
    () => ({ grilles, arrivee: checkIn, depart: checkOut }),
    [grilles, checkIn, checkOut],
  );
  return {
    pret: grilles != null,
    jours: joursDuSejour({ arrivee: checkIn, depart: checkOut }),
    ctx,
  };
}

export type PrixForfait = {
  /** Les grilles sont chargées. */
  pret: boolean;
  /** Adulte et enfant du séjour, `null` avant les grilles. */
  forfaits: ForfaitsSejour | null;
  /** La journée adulte du premier jour de ski. */
  journee: Resolution | null;
  /** Le forfait saison adulte de la même grille. */
  saison: { prix: number; devise: string } | null;
  budget: BudgetForfaits | null;
  /** Les jours de ski du séjour. */
  jours: number | null;
};

export function usePrixForfait(s: Station | undefined): PrixForfait {
  const grilles = useGrilles();
  const { checkIn, checkOut, adultes, enfants } = useSejour();
  return useMemo(() => {
    const jours = joursDuSejour({ arrivee: checkIn, depart: checkOut });
    if (!grilles || !s)
      return {
        pret: grilles != null,
        forfaits: null,
        journee: null,
        saison: null,
        budget: null,
        jours,
      };
    const dates = { arrivee: checkIn, depart: checkOut };
    const forfaits = forfaitsStation(s.id, { grilles, ...dates });
    if (!forfaits)
      return { pret: true, forfaits: null, journee: null, saison: null, budget: null, jours };
    return {
      pret: true,
      forfaits,
      journee: journeeDuSejour(s.id, dates, grilles, todayIso(), forfaits.adulte),
      saison: saisonDeLaGrille(grilles, forfaits.adulte),
      budget: budgetForfaits(forfaits, adultes, enfants),
      jours,
    };
  }, [grilles, s, checkIn, checkOut, adultes, enfants]);
}
