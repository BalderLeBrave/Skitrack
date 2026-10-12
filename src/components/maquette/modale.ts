/**
 * Ce que toute fenêtre modale de la maquette Airbnb tient : Échap la ferme, le
 * focus reste dedans, et il revient à la commande qui l'a ouverte.
 *
 * Les fenêtres s'empilent (la fiche d'annonce, puis « Enregistrer » par-dessus) :
 * seule celle du dessus répond. L'écoute d'Échap passe en capture et s'arrête
 * là, pour que la fenêtre de dessous — qui écoute le document — ne se ferme pas
 * du même coup. La règle de tabulation est celle de `lib/piegeFocus.ts`.
 */

import { useEffect, useRef, type RefObject } from "react";
import { rangApresTab } from "@/lib/piegeFocus";

/** Les commandes atteignables au clavier dans une fenêtre. */
export const COMMANDES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function commandes(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>(COMMANDES)].filter(
    (c) => !c.closest("[inert]") && c.getClientRects().length > 0,
  );
}

/** La fenêtre est-elle la dernière `aria-modal` du document ? */
function dessus(el: HTMLElement): boolean {
  const modales = document.querySelectorAll('[aria-modal="true"]');
  const haut = modales[modales.length - 1];
  return !!haut && el.contains(haut);
}

/**
 * Piège le focus dans `boite` et ferme à Échap, tant que la fenêtre est montée.
 *
 * `boite` : l'élément `role="dialog"` (avec `aria-modal="true"` et
 * `tabIndex={-1}`). `fermer` peut changer d'identité à chaque rendu.
 * `focusInitial` : sélecteur de la commande à focaliser à l'ouverture ; à
 * défaut, la fenêtre elle-même.
 */
export function useModale(
  boite: RefObject<HTMLElement | null>,
  fermer: () => void,
  focusInitial?: string,
) {
  const fermerRef = useRef(fermer);
  fermerRef.current = fermer;

  useEffect(() => {
    const el = boite.current;
    if (!el) return;
    const avant = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const premier = focusInitial ? el.querySelector<HTMLElement>(focusInitial) : null;
    (premier ?? el).focus({ preventScroll: true });

    const touche = (e: KeyboardEvent) => {
      if (!dessus(el)) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        fermerRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const cs = commandes(el);
      const r = rangApresTab(
        cs.length,
        cs.indexOf(document.activeElement as HTMLElement),
        e.shiftKey,
      );
      if (r == null) return;
      e.preventDefault();
      (r < 0 ? el : cs[r]).focus();
    };
    const entree = (e: FocusEvent) => {
      if (dessus(el) && e.target instanceof Node && !el.contains(e.target))
        el.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", touche, true);
    document.addEventListener("focusin", entree);
    return () => {
      window.removeEventListener("keydown", touche, true);
      document.removeEventListener("focusin", entree);
      // Rendre le focus à la commande d'ouverture, si elle est encore là.
      if (avant?.isConnected) avant.focus({ preventScroll: true });
    };
    // L'ouverture seule compte : `focusInitial` n'est lu qu'une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boite]);
}
