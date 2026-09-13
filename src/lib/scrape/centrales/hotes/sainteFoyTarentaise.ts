/**
 * Sainte-Foy-Tarentaise.
 *
 * La plus petite des quatre centrales MSEM, et celle qui rend la preuve la plus
 * nette. Relevé du 13 septembre 2026, `robots.txt` n'interdit rien, catalogue
 * de soixante-dix-neuf hébergements.
 *
 * Contrairement à ses voisines, elle vend aussi des séjours courts, ce qui
 * permet la comparaison directe : pour huit personnes, l'« Appartement
 * Soldanelle » coûte 2 259,58 € sur sept nuits et 865,82 € sur trois ;
 * l'« Arpège des Neiges A18 » 3 135,02 € puis 1 486,30 €. Sans dates, la
 * centrale ne rend rien du tout.
 */

import { chercherMsem } from "../moteurs/msem.server";
import type { Connecteur } from "../types";

export const sainteFoyTarentaise: Connecteur = {
  host: "www.saintefoy-reservation.com",
  nom: "Sainte-Foy Tarentaise",
  moteur: "MSEM",
  chercher: (ctx) =>
    chercherMsem(ctx, {
      host: "www.saintefoy-reservation.com",
      nom: "Sainte-Foy Tarentaise",
      cle: "stf",
      resort: 595,
      canal: "OT-595",
    }),
};
