/**
 * Corrençon-en-Vercors, par l'office de tourisme de Villard-de-Lans.
 *
 * **L'audit s'était trompé de moteur.** Il avait rangé cette centrale sous
 * Elloha. Elle tourne en réalité sur MSEM, comme les trois autres : le site de
 * l'office publie lui-même sa configuration, `resort` 30002 et `channel`
 * « OTVDL », et l'API répond exactement comme pour Sainte-Foy. C'est vérifié,
 * pas déduit — catalogue de deux cent soixante-seize hébergements, vingt-deux
 * vendables à huit personnes sur la semaine du 6 février 2027, et le doublement
 * de la durée double le prix : « Maison Sapin Bleu » passe de 2 087,80 € à
 * 4 160,60 €.
 *
 * **Deux sites, et il faut les deux.** Le registre connaît le site de l'office,
 * `www.villarddelans-correnconenvercors.com`, qui porte la configuration du
 * moteur mais rend 404 sur `/hebergements/<slug>/`. Les fiches vivent sur son
 * sous-domaine de réservation, dont le `robots.txt` est lu (aucune règle).
 * D'où `siteBase` : sans lui, chaque lien de la liste mènerait à une erreur.
 */

import { chercherMsem } from "../moteurs/msem.server";
import type { Connecteur } from "../types";

export const correnconEnVercors: Connecteur = {
  host: "www.villarddelans-correnconenvercors.com",
  nom: "Corrençon-en-Vercors",
  moteur: "MSEM",
  chercher: (ctx) =>
    chercherMsem(ctx, {
      host: "www.villarddelans-correnconenvercors.com",
      nom: "Corrençon-en-Vercors",
      cle: "vdl",
      resort: 30002,
      canal: "OTVDL",
      siteBase: "https://reservation.villarddelans-correnconenvercors.com",
    }),
};
