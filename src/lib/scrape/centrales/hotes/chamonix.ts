/**
 * Chamonix, Les Houches, Vallorcine.
 *
 * Orchestra, mais pas le gabarit de La Plagne : l'accueil ne publie pas de
 * `/destinations/{slug}`. Il publie des pages de résultats par lieu, et chaque
 * carte y porte `data-product` avec l'identifiant du calendrier. Relevé du
 * 9 octobre 2026 : le produit 4751, sept nuits au 6 février 2027, vaut 1 258 €
 * (`byHousing`, `nightNb` 7) et 2 620 € sur quatorze nuits. Le « à partir de »
 * de la page, lui, n'est pas daté et n'est pas lu.
 */

import { chercherOrchestraSerp } from "../moteurs/orchestra.server";
import type { Connecteur } from "../types";

const PAGES: Record<string, { chemin: string; lieu: string }> = {
  chamonix: {
    chemin: "/fr/serp?s_c.ACCOMMODATION=chalet,apartment&ref_c.LOCATION=cmb.chamonix&type=chalet,apartment",
    lieu: "chamonix",
  },
  "les-houches": {
    chemin: "/fr/serp?s_c.ACCOMMODATION=chalet,apartment&ref_c.LOCATION=cmb.houches&type=chalet,apartment",
    lieu: "houches",
  },
  vallorcine: {
    chemin: "/fr/serp?s_c.ACCOMMODATION=chalet,apartment&ref_c.LOCATION=cmb.vallorcine&type=chalet,apartment",
    lieu: "vallorcine",
  },
};

export const chamonix: Connecteur = {
  host: "booking.chamonix.com",
  nom: "Chamonix",
  moteur: "Orchestra",
  chercher: (ctx) => {
    const page = PAGES[ctx.stationId];
    if (!page) return Promise.reject(new Error("cette station n'a pas de page de résultats publiée"));
    return chercherOrchestraSerp(ctx, "Chamonix", "booking.chamonix.com", page);
  },
};
