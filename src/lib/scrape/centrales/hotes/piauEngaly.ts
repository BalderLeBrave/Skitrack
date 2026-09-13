/**
 * Piau-Engaly.
 *
 * WordPress de station, empreinte Open System venue d'un widget inclus. Relevé
 * du 13 septembre 2026 : aucun `MoteurRecherche`, aucun chemin
 * `pr<N>-....htm`. La page d'accueil renvoie par ailleurs vers `www.n-py.com`,
 * qui est le portail des Nouvelles Pyrénées et non une centrale de cette
 * station.
 *
 * `robots.txt` répond 200 et ne ferme que `/wp-admin/`, en rouvrant
 * `/wp-admin/admin-ajax.php`.
 */

import type { Connecteur } from "../types";

export const piauEngaly: Connecteur = {
  host: "piau-engaly.com",
  nom: "Piau-Engaly",
  moteur: "Open System",
  indisponible:
    "Site de station sans page de résultats datés : l'empreinte Open System vient d'un widget inclus, pas d'un moteur interrogeable. Relevé du 13 septembre 2026.",
};
