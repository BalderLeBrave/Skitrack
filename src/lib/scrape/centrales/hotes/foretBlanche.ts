/**
 * Forêt Blanche — Risoul.
 *
 * **Son `robots.txt` ne porte aucune des règles Disallow habituelles du
 * moteur.** Il s'arrête après dix motifs et ne contient ni `/*booking?*`, ni
 * `/*search?*`, ni `/*?action=*`, ni `/*?cid=*`, ni `/*?ajax=*`. On le lit,
 * on extrait. Sur les vingt-huit centrales du moteur, six sont dans ce cas ;
 * les vingt-deux autres portent `Disallow: /*booking?*`, journalisé, et
 * s'extraient de la même façon.
 *
 * **Ce fichier a d'abord dit que la centrale était injoignable, et c'était
 * notre erreur.** Le formulaire porte `action=searchAjax` ; envoyée ainsi, la
 * requête répondait « Une erreur s'est produite », et la fiche datée rendait
 * 503 « Site en maintenance ! ». Le bouton « Afficher » du moteur envoie en
 * réalité `action=result`, et celle-là rend la liste complète. Une valeur de
 * champ, et tout le moteur avec.
 *
 * Relevé du 13 septembre 2026, `cid` 4 : huit logements pour huit personnes sur
 * la semaine du 6 février 2027, de 1 300 € à 4 959 €. Sur quatorze nuits,
 * « Deneb 25 » passe de 1 980 € à 3 960 € et « Chalet Les Oursons » de 4 959 €
 * à 9 918 €, soit exactement le double. Sans dates, la page ne porte aucune
 * fiche.
 *
 * Cette centrale ne dessert plus que Risoul : Vars, Vars Sainte-Marie et Les
 * Claux ont la leur, sur un autre moteur. Voir [`vars.ts`](./vars.ts).
 */

import { chercherIngenie } from "../moteurs/ingenie.server";
import type { Connecteur } from "../types";

export const foretBlanche: Connecteur = {
  host: "www.risoul.com",
  nom: "Forêt Blanche : Vars/Risoul",
  moteur: "Ingénie",
  chercher: (ctx) =>
    chercherIngenie(ctx, {
      host: "www.risoul.com",
      nom: "Forêt Blanche : Vars/Risoul",
      cle: "ris",
      cid: 4,
    }),
};
