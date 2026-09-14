/**
 * Piau-Engaly.
 *
 * WordPress de station, empreinte Open System venue d'un widget inclus. Relevé
 * du 13 septembre 2026 : aucun `MoteurRecherche`, aucun chemin
 * `pr<N>-....htm`. La page d'accueil renvoie par ailleurs vers `www.n-py.com`,
 * qui est le portail des Nouvelles Pyrénées et non une centrale de cette
 * station.
 *
 * `robots.txt` répond 200 et porte `Disallow: /wp-admin/`, en rouvrant
 * `/wp-admin/admin-ajax.php`. On le lit. Ce qui manque est une URL de résultats.
 */

import type { Connecteur } from "../types";

export const piauEngaly: Connecteur = {
  host: "piau-engaly.com",
  nom: "Piau-Engaly",
  moteur: "Open System",
  indisponible:
    "son site de station n'a pas de page de résultats datés. L'empreinte Open System relevée par l'audit vient d'un widget inclus, pas d'un moteur interrogeable. Relevé du 13 septembre 2026.",
};
