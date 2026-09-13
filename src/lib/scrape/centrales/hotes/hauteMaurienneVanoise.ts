/**
 * Haute Maurienne Vanoise — Aussois, Bonneval-sur-Arc, La Norma, Val Cenis.
 *
 * La première centrale branchée, et celle sur laquelle le moteur Open System a
 * été établi. Relevé du 13 septembre 2026 : `robots.txt` dit « User-Agent: * /
 * Allow: / », les huit rubriques répondent 200, et le relevé daté du 6 au
 * 13 février 2027 pour huit personnes rend cent sept logements distincts avec
 * un total de séjour.
 *
 * **Pourquoi les huit rubriques et pas la seule page « tous ».** Le moteur
 * plafonne à cinquante fiches par page et sa pagination ne répond pas en
 * requête simple. « Tous nos hébergements » en donne donc cinquante, les
 * appartements de particuliers en ajoutent trente-trois que la première n'avait
 * pas, ceux de professionnels vingt-quatre de plus. Les quatre dernières
 * rubriques n'apportent rien de neuf, et les campings comme le refuge ne
 * rendent rien du tout en février : c'est la bonne réponse, pas une panne. On
 * les garde parce qu'une rubrique muette ne coûte qu'une requête, et qu'elle
 * parlera à d'autres dates.
 *
 * **Les pages par station ne servent pas.** `/ac57-val-cenis.htm` et ses
 * voisines ont l'air de viser une station, mais ce sont des pages éditoriales :
 * elles ne portent aucune fiche, avec ou sans dates. Le tri par station se fait
 * en aval, au rayon de recherche, sur les coordonnées que chaque fiche porte.
 */

import { chercherOpenSystem } from "../moteurs/openSystem.server";
import type { Connecteur } from "../types";

export const hauteMaurienneVanoise: Connecteur = {
  host: "reservation.haute-maurienne-vanoise.com",
  nom: "Haute Maurienne Vanoise",
  moteur: "Open System",
  chercher: (ctx) =>
    chercherOpenSystem(ctx, {
      host: "reservation.haute-maurienne-vanoise.com",
      nom: "Haute Maurienne Vanoise",
      cle: "hmv",
      rubriques: [
        "/pr7-tous-nos-hebergements.htm",
        "/pr75-appartements-de-particuliers.htm",
        "/pr93-appartements-de-professionnels.htm",
        "/pr8-hotels-et-residences-de-tourisme.htm",
        "/pr27-chambres-d-hotes-gites-d-etape.htm",
        "/pr77-hebergements-insolites.htm",
        "/pr28-campings.htm",
        "/pr29-refuge.htm",
      ],
    }),
};
