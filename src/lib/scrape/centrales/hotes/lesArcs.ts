/**
 * Les Arcs — Bourg-Saint-Maurice et Villaroger.
 *
 * Seule centrale du parc sur le moteur iResa. La vitrine de la station est un
 * Drupal ; la réservation vit sur `lesarcs-reservation.com`, et c'est son
 * `robots.txt` qu'on lit. Il porte `Disallow: /search/` et `/search?`, qui
 * ne sont pas le chemin du moteur. On journalise, on extrait. La recherche
 * n'a aucune chaîne de requête : tout voyage dans le corps du formulaire.
 *
 * **Un piège qu'il faut connaître avant de lire cette centrale.** Quand la
 * durée demandée n'est pas vendue, le moteur ne rend pas une liste vide : il
 * rend son catalogue non daté, six cent huit fiches aux prix unitaires, dont
 * des nuitées à trente-neuf euros. Les prendre pour des séjours mettrait les
 * moins chers du parc en tête de liste. Le connecteur écarte donc chaque fiche
 * dont la durée ou la date de début ne correspond pas à la demande.
 *
 * Et le cas est fréquent ici : sur la semaine du 6 février 2027, le service de
 * durées de la centrale, interrogé, ne répond qu'une seule valeur, sept nuits.
 * La preuve que le prix suit la durée a donc été faite sur une date qui en vend
 * plusieurs, le 17 octobre 2026, où le même hébergement passe de 478 € sur deux
 * nuits à 956 € sur quatre et 1 673 € sur sept.
 *
 * Relevé du 13 septembre 2026 : vingt-six résultats pour huit personnes sur
 * sept nuits, de 1 911 € à 3 398 €, chacun avec sa capacité et ses photos. Le
 * connecteur lit la première page, vingt-quatre fiches sur vingt-six. Il n'y a
 * pas de coordonnées dans ce flux.
 *
 * **Le rattachement a dû être corrigé.** Le classeur du 19 août donnait Les Arcs
 * à la centrale de Peisey-Vallandry, sous le nom « Les Arcs ». Ce site est en
 * réalité l'office de Peisey-Vallandry, et celle-ci vend bien Arc 1600,
 * Arc 1950, Arc 2000, Charmettoger, le Chantel, Montrigon, le Charvet, les
 * Villards et la Croisette, son fil d'Ariane disant « Bourg-Saint-Maurice ».
 */

import { chercherIresa } from "../moteurs/iresa.server";
import type { Connecteur } from "../types";

export const lesArcs: Connecteur = {
  host: "www.lesarcs.com",
  nom: "Les Arcs",
  moteur: "iResa",
  chercher: (ctx) =>
    chercherIresa(ctx, {
      host: "www.lesarcs.com",
      nom: "Les Arcs",
      cle: "arc",
      reservation: "https://www.lesarcs-reservation.com",
      chemin: "/reservez-votre-sejour",
    }),
};
