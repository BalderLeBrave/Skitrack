/** `go(screen, opts)` de la maquette (l. 480–493), sur les routes du dépôt.
 *  Les verrous et leurs bandeaux sont ceux de la maquette ; le rendu de
 *  l'écran est laissé à la route, le retour en haut de page au `.scroll`. */

import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback } from "react";
import { useParcours } from "@/lib/parcours";

export type Screen = "home" | "compare" | "fiche" | "lodging" | "booking";

export function screenOf(pathname: string): Screen {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/logements")) return "lodging";
  if (pathname.startsWith("/reservation")) return "booking";
  if (pathname.startsWith("/stations/")) return "fiche";
  return "compare";
}

export function useScreen(): Screen {
  return useRouterState({ select: (s) => screenOf(s.location.pathname) });
}

export function useGo() {
  const navigate = useNavigate();
  const stationId = useParcours((s) => s.stationId);
  const lodgeId = useParcours((s) => s.lodgeId);
  const say = useParcours((s) => s.say);
  return useCallback(
    (screen: Screen, opts: { id?: string } = {}) => {
      if (screen === "lodging" && !stationId) return say("Retenez d’abord une station.");
      if (screen === "booking" && !lodgeId) return say("Choisissez d’abord un logement.");
      if (screen === "home") return navigate({ to: "/" });
      if (screen === "compare") return navigate({ to: "/comparer" });
      if (screen === "fiche" && opts.id)
        return navigate({ to: "/stations/$id", params: { id: opts.id } });
      if (screen === "lodging") return navigate({ to: "/logements" });
      if (screen === "booking") return navigate({ to: "/reservation" });
    },
    [navigate, stationId, lodgeId, say],
  );
}
