/**
 * Pose la langue choisie (`useLocale`) pour tout ce qui s'affiche dessous.
 *
 * Le serveur et le premier rendu du navigateur écrivent en français : sinon
 * l'hydratation échouerait pour qui a choisi l'anglais. Une fois monté, le
 * composant pose la langue choisie (`poserLangue`) et remonte l'arbre par sa
 * clé : chaque `tr`, chaque nombre, chaque date se réécrit dans la langue
 * choisie. Les magasins gardent leur état ; seuls les panneaux ouverts se
 * referment, comme à un changement de page.
 */

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useLocale } from "./index.ts";
import { poserLangue } from "./langue.ts";

export function Langue({ children }: { children: ReactNode }) {
  const choisie = useLocale((s) => s.locale);
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  const enCours = monte ? choisie : "fr";
  // Posée pendant le rendu : les enfants la lisent dans ce même rendu.
  poserLangue(enCours);
  useEffect(() => {
    document.documentElement.lang = enCours;
  }, [enCours]);
  return <Fragment key={enCours}>{children}</Fragment>;
}
