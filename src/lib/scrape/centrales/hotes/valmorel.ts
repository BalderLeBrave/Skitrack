/**
 * Valmorel.
 *
 * L'audit a relevé une empreinte Open System sur `www.valmorel.com`, mais le
 * site est un WordPress d'office de tourisme : l'empreinte vient d'un widget
 * inclus dans une page, pas d'un moteur de recherche hébergé là. Relevé du
 * 13 septembre 2026 : la page d'accueil ne déclare aucun `MoteurRecherche` et
 * ne porte aucun chemin `pr<N>-....htm`.
 *
 * `robots.txt` répond 200 et porte Disallow sur la connexion WordPress, les
 * rétroliens, les flux, les commentaires, `/cgi-bin`, et les fichiers en
 * `.php`, `.inc`, `.gz` et `.cgi`. On le lit. Rien qui concerne une page
 * d'hébergements. Ce qui manque est une URL de résultats.
 */

import type { Connecteur } from "../types";

export const valmorel: Connecteur = {
  host: "www.valmorel.com",
  nom: "Valmorel",
  moteur: "Open System",
  indisponible:
    "son site d'office de tourisme n'a pas de page de résultats datés. L'empreinte Open System relevée par l'audit vient d'un widget inclus, pas d'un moteur interrogeable. Relevé du 13 septembre 2026.",
};
