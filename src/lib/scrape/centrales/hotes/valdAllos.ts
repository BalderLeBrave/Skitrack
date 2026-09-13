/**
 * Val d'Allos — La Foux et Le Seignus.
 *
 * Quatrième centrale Ingénie branchée, et la dernière des cinq que
 * `robots.txt` laisse passer. Son `cid` vaut 8, lu sur sa page d'accueil comme
 * sur sa page de location.
 *
 * **Elle n'a presque rien à vendre, et elle le dit d'une façon qu'il fallait
 * comprendre.** Relevé du 13 septembre 2026, quatre personnes du 6 au
 * 13 février 2027 : dix-neuf fiches rendues, dix blocs de tarif, dont neuf
 * affichent « à partir de 0 € ». Un zéro n'est pas un prix : c'est ainsi que
 * cette centrale signale un logement dont elle n'a pas le tarif à ces dates.
 * Une seule offre tient, à 700 €.
 *
 * Elle écrit par ailleurs sa monnaie en entité, « 700 &euro; » et non
 * « 700 € ». Couper sur le signe littéral aurait manqué toutes ses décimales ;
 * l'analyseur décode d'abord, et les deux cas sont éprouvés.
 */

import { chercherIngenie } from "../moteurs/ingenie.server";
import type { Connecteur } from "../types";

export const valdAllos: Connecteur = {
  host: "www.valdallos.com",
  nom: "Val d'Allos - La Foux",
  moteur: "Ingénie",
  chercher: (ctx) =>
    chercherIngenie(ctx, {
      host: "www.valdallos.com",
      nom: "Val d'Allos - La Foux",
      cle: "vda",
      cid: 8,
    }),
};
