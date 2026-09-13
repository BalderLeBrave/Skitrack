/**
 * Isola 2000.
 *
 * Centrale MSEM, `resort` 386 et `channel` « ISOLA » — le canal ne suit pas ici
 * la convention « OT-<resort> » des autres, il porte le nom de la station.
 *
 * Relevé du 13 septembre 2026 : quarante-quatre hébergements au catalogue, tous
 * avec coordonnées, et **zéro offre à huit personnes** sur la semaine du
 * 6 février 2027. Ce n'est pas une panne : neuf hébergements du catalogue
 * accueillent huit personnes ou plus, et ils sont tous pris cette semaine-là.
 * La semaine précédente, du 30 janvier au 6 février, la même requête à huit
 * rend bien deux offres, à 2 122,54 € et 2 175,18 €.
 *
 * Le lien mène à la page de réservation de la station et non au logement : le
 * site n'expose pas de page par hébergement sous les slugs de MSEM, et les
 * trois chemins essayés rendent 404.
 */

import { chercherMsem } from "../moteurs/msem.server";
import type { Connecteur } from "../types";

export const isola2000: Connecteur = {
  host: "isola2000.com",
  nom: "Isola 2000",
  moteur: "MSEM",
  chercher: (ctx) =>
    chercherMsem(ctx, {
      host: "isola2000.com",
      nom: "Isola 2000",
      cle: "iso",
      resort: 386,
      canal: "ISOLA",
      ficheChemin: "/reservez-votre-sejour/",
    }),
};
