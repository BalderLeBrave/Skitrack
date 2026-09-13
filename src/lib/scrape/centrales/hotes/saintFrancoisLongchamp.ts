/**
 * Saint-François-Longchamp.
 *
 * Moteur MSEM, comme [l'Alpe d'Huez](./alpeDHuez.ts), à deux identifiants près.
 * Relevé du 13 septembre 2026 : `robots.txt` n'interdit rien, le catalogue
 * annonce deux cent quatre-vingt-dix-neuf hébergements et vingt et un sont
 * vendables à huit personnes pour la semaine du 6 février 2027.
 *
 * Même vente au samedi : trois nuits rendent zéro, et le doublement de la durée
 * fait la preuve — « 4 pièces duplex 8/10 personnes, L'Ancolie » passe de
 * 3 180,76 € à 6 335,40 €.
 */

import { chercherMsem } from "../moteurs/msem.server";
import type { Connecteur } from "../types";

export const saintFrancoisLongchamp: Connecteur = {
  host: "reservation.saintfrancoislongchamp.com",
  nom: "Saint François Longchamp",
  moteur: "Ublo",
  chercher: (ctx) =>
    chercherMsem(ctx, {
      host: "reservation.saintfrancoislongchamp.com",
      nom: "Saint François Longchamp",
      cle: "sfl",
      resort: 566,
      canal: "OT-SFL",
    }),
};
