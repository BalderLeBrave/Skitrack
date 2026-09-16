/**
 * Fermer un panneau flottant au clic dehors et à Échap.
 *
 * **Pourquoi au niveau du document.** La première version posait un voile
 * cliquable en plein écran dans le bandeau collant. Le `backdrop-filter` de ce
 * bandeau crée un contexte de confinement : le voile, tout en `position: fixed`
 * qu'il était, restait borné à la barre, et un clic sous la barre ne le
 * touchait jamais — le panneau Filtres ne se fermait donc pas. L'écoute se fait
 * ici sur le document, en phase de capture, et la seule question posée est :
 * le clic est-il tombé dans l'ancre du panneau ?
 *
 * L'ancre englobe le bouton **et** le panneau : sans elle, le clic sur le
 * bouton fermait le panneau juste avant que son propre `onClick` ne le
 * rouvre, et le bouton ne faisait plus rien.
 *
 * `pointerdown` plutôt que `click` : un glisser commencé sur un curseur du
 * panneau et relâché dehors ne doit pas compter comme un clic dehors.
 */

import { useEffect, type RefObject } from "react";

export function useFermeturePanneau(
  ouvert: boolean,
  fermer: () => void,
  ancre: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      const cible = e.target;
      if (cible instanceof Node && ancre.current?.contains(cible)) return;
      fermer();
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("pointerdown", dehors, true);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors, true);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert, fermer, ancre]);
}
