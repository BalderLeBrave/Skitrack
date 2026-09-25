/**
 * Haute Maurienne Vanoise — Aussois, Bonneval-sur-Arc, La Norma, Val Cenis.
 *
 * La première centrale branchée, et celle sur laquelle le moteur Open System a
 * été établi. Relevé du 13 septembre 2026 : `robots.txt` dit « User-Agent: * /
 * Allow: / ». On le lit, on extrait. Les huit rubriques d'alors répondaient
 * 200, et le relevé daté du 6 au 13 février 2027 pour huit personnes rendait
 * cent sept logements distincts avec un total de séjour.
 *
 * **Pourquoi plusieurs rubriques et pas la seule page « tous ».** Le moteur
 * plafonne à cinquante fiches par page et sa pagination ne répond pas en
 * requête simple. « Tous nos hébergements » en donne donc cinquante, les
 * appartements de particuliers en ajoutent trente-trois que la première n'avait
 * pas, ceux de professionnels vingt-quatre de plus. Les autres rubriques
 * n'apportaient rien de neuf, et les campings comme le refuge ne rendaient rien
 * du tout en février : c'était la bonne réponse, pas une panne.
 *
 * **Cinq rubriques ne sont plus interrogées**, par la règle du propriétaire :
 * ni camping, ni insolite, ni refuge, ni chambre d'hôtes, ni gîte d'étape, ni
 * hôtel. Relevé du 25 septembre 2026, du 6 au 13 février 2027 à quatre
 * personnes : « chambres d'hôtes et gîtes d'étape » et « hébergements
 * insolites » rendent la même fiche, les « Cabanes & Yourtes de Montagne » ;
 * « hôtels et résidences de tourisme » rend deux hôtels et quatre résidences,
 * toutes sans type publié et toutes déjà dans « tous nos hébergements ». Les
 * campings et le refuge n'ont pas été interrogés à ce relevé.
 *
 * **Ce qui reste de ces types dans « tous » est écarté fiche à fiche**
 * (`appliquerRegleOpenSystem`). Une fiche sans type publié n'est gardée que si
 * elle paraît aussi sous l'une des deux rubriques d'appartements : c'est le cas
 * des quatre résidences (« Les Valmonts de Val Cenis », trois « Balcons »),
 * rangées par la centrale sous « appartements de professionnels », et jamais
 * des deux hôtels ni des cabanes.
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
      ],
      rubriquesDeLocation: [
        "/pr75-appartements-de-particuliers.htm",
        "/pr93-appartements-de-professionnels.htm",
      ],
    }),
};
