/** `go(screen, opts)` de la maquette (l. 480–493), sur les routes du dépôt.
 *  Les verrous et leurs bandeaux sont ceux de la maquette ; le rendu de
 *  l'écran est laissé à la route, le retour en haut de page au `.scroll`. */

import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback } from "react";
import { dire } from "@/lib/i18n";
import { useParcours } from "@/lib/parcours";

export type Screen = "home" | "compare" | "fiche" | "lodging" | "booking";

/** Les écrans de contrôle, rangés sous « Plus ». Seule table de ces chemins :
 *  `screenOf` et `horsParcours` en tenaient chacun la leur, et la première les
 *  rangeait tous sous « Comparer ». */
export const AILLEURS_PATHS = ["/carte", "/monde", "/altitudes", "/openskimap", "/forfaits", "/traces", "/cles"] as const;

/** L'écran du parcours, ou `null` hors du parcours.
 *
 *  Elle rendait `"compare"` pour tout chemin inconnu : sur /carte, /forfaits ou
 *  /traces, l'étape « 1 Comparer » s'allumait et s'annonçait page courante. */
export function screenOf(pathname: string): Screen | null {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/logements")) return "lodging";
  if (pathname.startsWith("/reservation")) return "booking";
  if (pathname.startsWith("/stations/")) return "fiche";
  if (pathname.startsWith("/comparer")) return "compare";
  return null;
}

export function useScreen(): Screen | null {
  return useRouterState({ select: (s) => screenOf(s.location.pathname) });
}

export function useGo() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return useCallback(
    (screen: Screen, opts: { id?: string } = {}) => {
      // L'état est lu à l'appel, pas capturé au rendu : « Retenir et voir les
      // logements » retient la station puis navigue dans le même geste, et un
      // verrou lu dans une fermeture périmée refusait encore le passage.
      const { stationId, lodgeId, say } = useParcours.getState();
      // Déjà là : deux clics rapides n'empilent pas deux navigations.
      if (screenOf(pathname) === screen && (!opts.id || pathname === `/stations/${opts.id}`)) return;
      if (screen === "lodging" && !stationId) return say(dire("nav.lodgingLocked"));
      if (screen === "booking" && !lodgeId) return say(dire("nav.bookingLocked"));
      if (screen === "home") return navigate({ to: "/" });
      if (screen === "compare") return navigate({ to: "/comparer" });
      // Un appel sans identifiant ne partait nulle part et ne disait rien.
      if (screen === "fiche")
        return opts.id
          ? navigate({ to: "/stations/$id", params: { id: opts.id } })
          : say("Station inconnue.");
      if (screen === "lodging") return navigate({ to: "/logements" });
      if (screen === "booking") return navigate({ to: "/reservation" });
    },
    [navigate, pathname],
  );
}
