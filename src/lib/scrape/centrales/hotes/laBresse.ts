/**
 * La Bresse Hohneck.
 *
 * L'office (www.labresse.net) charge un panier Open System, sans recherche
 * datée. Le lien « La Bresse Réservation » qu'il publie mène à
 * reservation.labresse.net, et cette page est un formulaire Ingénie : `cid` 3,
 * catégorie `G` (meublés). Relevé du 9 octobre 2026, quatre personnes à partir
 * du 6 février 2027. Vingt-quatre meublés. L'appartement LB019-A0635 passe de
 * 929 € sur sept nuits à 1 826 € sur quatorze, Les Grandes Feignes de 2 219 €
 * à 4 438 €. L'étiquette dit « à partir de » : c'est le moins cher du lot, et
 * il suit la durée.
 */

import { chercherIngenie } from "../moteurs/ingenie.server";
import type { Connecteur } from "../types";

export const laBresse: Connecteur = {
  host: "www.labresse.net",
  nom: "La Bresse Hohneck",
  moteur: "Ingénie",
  chercher: (ctx) =>
    chercherIngenie(
      { ...ctx, base: "https://reservation.labresse.net" },
      {
        host: "www.labresse.net",
        nom: "La Bresse Hohneck",
        cle: "lbr",
        cid: 3,
      },
    ),
};
