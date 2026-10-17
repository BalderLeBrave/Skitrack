/**
 * Pose la devise d'affichage choisie (`useDevise`) pour tout ce qui
 * s'affiche dessous, comme `Langue` pose la langue.
 *
 * Le serveur et le premier rendu du navigateur écrivent les prix dans leur
 * devise : sinon l'hydratation échouerait. Une fois monté, le composant lit
 * les taux BCE du jour, pose la devise choisie et remonte l'arbre par sa clé.
 * Sans taux (hors ligne), rien n'est converti.
 */

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { poserAffichage, type TauxBce } from "./affichage.ts";
import { lireTauxDeChange } from "./taux.ts";

type DeviseStore = {
  /** `null` : chaque prix dans sa devise, sans conversion. */
  devise: string | null;
  setDevise: (devise: string | null) => void;
};

export const useDevise = create<DeviseStore>()(
  persist(
    (set) => ({
      devise: null,
      setDevise: (devise) => set({ devise }),
    }),
    { name: "skitrack-devise" },
  ),
);

export function DeviseApp({ children }: { children: ReactNode }) {
  const choisie = useDevise((s) => s.devise);
  const [monte, setMonte] = useState(false);
  const [taux, setTaux] = useState<TauxBce | null>(null);
  useEffect(() => setMonte(true), []);
  useEffect(() => {
    if (!monte || !choisie || taux) return;
    let actif = true;
    lireTauxDeChange()
      .then((t) => {
        if (actif) setTaux(t);
      })
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [monte, choisie, taux]);
  const enCours = monte && choisie && taux ? choisie : null;
  // Posée pendant le rendu : les enfants la lisent dans ce même rendu.
  poserAffichage(enCours, enCours ? taux : null);
  return <Fragment key={`${enCours ?? "origine"}|${taux?.date ?? ""}`}>{children}</Fragment>;
}
