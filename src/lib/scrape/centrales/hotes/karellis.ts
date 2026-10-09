/**
 * Les Karellis.
 *
 * L'accueil de www.karellis.com publie le moteur, le 9 octobre 2026 :
 * idClient « karellis », saison hiver, action
 * https://www.karellis-reservation.com/result, catalogue
 * destination-endpoint.php du thème wp-hospitality. C'est Resalys.
 *
 * Le script searchjs.3.1.1.js et ce catalogue ont répondu 403. On ne les a
 * pas rappelés. Sans la forme de la requête, que seul ce script publie, il
 * n'y a pas de total de séjour à lire.
 */

import type { Connecteur } from "../types";

export const karellis: Connecteur = {
  host: "www.karellis.com",
  nom: "Les Karellis",
  moteur: "Resalys",
  indisponible:
    "l'office publie la recherche sur www.karellis-reservation.com, idClient « karellis », formulaire vers /result. Le 9 octobre 2026 le script de ce formulaire et son catalogue JSON ont répondu 403. On ne les a pas rappelés.",
};
