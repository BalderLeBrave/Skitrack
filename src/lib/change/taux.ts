import { createServerFn } from "@tanstack/react-start";
import type { TauxBce } from "./affichage.ts";

/** Les taux BCE du jour, lus par le serveur (`taux.server.ts`). */
export const lireTauxDeChange = createServerFn({ method: "GET" }).handler(
  async (): Promise<TauxBce | null> => {
    const { tauxBce } = await import("./taux.server");
    return tauxBce();
  },
);
