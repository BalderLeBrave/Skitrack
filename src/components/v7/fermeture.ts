/** Fermer un panneau : au clic dehors, et à Échap.
 *
 *  La maquette tient ces deux règles une fois pour toutes, au niveau du
 *  document (SKITRACK v7 - App.dc.html:552-557). Le portage les avait
 *  réécrites écran par écran, et les avait oubliées à plusieurs endroits : le
 *  panneau de filtres de Comparer, le volet d'annonce des Logements — déclaré
 *  `aria-modal` sans sortie clavier —, et les quatre panneaux de l'accueil.
 */

import { useEffect } from "react";

/**
 * Ferme au clic dehors et à Échap.
 *
 * `garde` nomme les boutons qui ouvrent ce panneau sans être dedans. Sans
 * elle, cliquer sur un tel bouton alors que le panneau est ouvert ferme au
 * `mousedown` puis rouvre au `click` : le panneau ne se referme jamais par son
 * propre bouton. La maquette tient la même règle autrement, en excluant
 * `[data-panel-btn]` de son écouteur.
 */
export function useFermeture(
  ouvert: boolean,
  fermer: () => void,
  hote: React.RefObject<HTMLElement | null>,
  garde?: string,
) {
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      const cible = e.target as Node;
      if (hote.current?.contains(cible)) return;
      if (garde && cible instanceof Element && cible.closest(garde)) return;
      fermer();
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert, fermer, hote, garde]);
}

/** Échap seule, quand le clic dehors est déjà géré autrement — un fond
 *  cliquable, ou une carte qui doit garder la souris. */
export function useEchap(ouvert: boolean, fermer: () => void) {
  useEffect(() => {
    if (!ouvert) return;
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [ouvert, fermer]);
}
