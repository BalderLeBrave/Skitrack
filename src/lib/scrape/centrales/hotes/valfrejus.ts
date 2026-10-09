/**
 * Valfréjus.
 *
 * Le site de la station a été réfuté comme source de prix le 13 septembre 2026.
 * Ce qu'il publie, le 9 octobre 2026, est un lien vers la centrale déjà
 * vérifiée de Haute Maurienne Vanoise :
 * `reservation.haute-maurienne-vanoise.com/pr398-nos-meubles-coup-de-coeur.htm`.
 * Cette page, datée, rend les mêmes blocs que les autres rubriques du moteur,
 * avec un total (880 €, 1 183 €, 1 750 € du 6 au 13 février 2027). On ne garde
 * que les fiches dont la commune ou le chemin dit Valfréjus : la page publie
 * aussi Saint-André et Modane.
 */

import { chercherOpenSystem } from "../moteurs/openSystem.server";
import type { Connecteur } from "../types";

export const valfrejus: Connecteur = {
  host: "www.valfrejus.com",
  nom: "Valfréjus",
  moteur: "Open System",
  chercher: async (ctx) => {
    const listings = await chercherOpenSystem(
      { ...ctx, base: "https://reservation.haute-maurienne-vanoise.com" },
      {
        host: "reservation.haute-maurienne-vanoise.com",
        nom: "Valfréjus",
        cle: "vfr",
        rubriques: [
          "/pr398-nos-meubles-coup-de-coeur.htm",
          "/pr7-tous-nos-hebergements.htm",
          "/pr75-appartements-de-particuliers.htm",
          "/pr93-appartements-de-professionnels.htm",
        ],
        rubriquesDeLocation: [
          "/pr398-nos-meubles-coup-de-coeur.htm",
          "/pr75-appartements-de-particuliers.htm",
          "/pr93-appartements-de-professionnels.htm",
        ],
      },
    );
    return listings.filter(
      (l) => /valfr[eé]jus/i.test(l.locality ?? "") || /valfrejus/i.test(l.url ?? ""),
    );
  },
};
