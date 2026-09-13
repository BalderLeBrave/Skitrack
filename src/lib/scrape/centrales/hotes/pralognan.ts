/**
 * Pralognan-la-Vanoise.
 *
 * Seule centrale du parc sur le moteur Arkiane, la plateforme LocVacances. Les
 * prix ne viennent pas de son site mais de son hôte marchand,
 * `reservationpralognan.locvacances.com`, dont le `robots.txt` ne ferme que
 * onze répertoires. Aucun ne contient le chemin de la recherche, et celle-ci
 * n'a de toute façon pas de chaîne de requête : tous les critères voyagent dans
 * le corps du formulaire.
 *
 * **La garantie que le prix est daté est écrite dans la page.** Sans dates,
 * chaque carte porte « À partir de … / sem. » et aucun total ; avec dates, ce
 * libellé disparaît et un montant ferme le remplace. Le connecteur écarte toute
 * carte qui le porte encore.
 *
 * Relevé du 13 septembre 2026, huit personnes : quarante et une cartes et zéro
 * prix ferme sans dates ; sept cartes et sept prix fermes sur la semaine du
 * 6 février 2027 ; trois sur quatorze nuits, où le rapport va de 2,000 à 2,760
 * sans qu'aucun prix reste identique. Sur trois nuits, la centrale répond en
 * cent onze octets qu'elle n'a plus de disponibilité.
 *
 * La capacité est un champ structuré, et elle remonte. Il n'y a en revanche ni
 * coordonnées ni adresse de fiche atteignable : le détail d'un lot est lui aussi
 * un envoi de formulaire, et le lien mène donc à la centrale.
 */

import { chercherArkiane } from "../moteurs/arkiane.server";
import type { Connecteur } from "../types";

export const pralognan: Connecteur = {
  host: "www.reservationpralognan.fr",
  nom: "Pralognan la Vanoise",
  moteur: "Arkiane",
  chercher: (ctx) =>
    chercherArkiane(ctx, {
      host: "www.reservationpralognan.fr",
      nom: "Pralognan la Vanoise",
      cle: "prl",
      marchand: "https://reservationpralognan.locvacances.com",
      langue: "fr-FR",
    }),
};
