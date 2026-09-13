/**
 * Valmorel.
 *
 * L'audit a relevé une empreinte Open System sur `www.valmorel.com`, mais le
 * site est un WordPress d'office de tourisme : l'empreinte vient d'un widget
 * inclus dans une page, pas d'un moteur de recherche hébergé là. Relevé du
 * 13 septembre 2026 : la page d'accueil ne déclare aucun `MoteurRecherche` et
 * ne porte aucun chemin `pr<N>-....htm`.
 *
 * `robots.txt` répond 200 et ferme la connexion WordPress, les rétroliens, les
 * flux, les commentaires, `/cgi-bin`, et les fichiers en `.php`, `.inc`, `.gz`
 * et `.cgi`. Rien qui concerne une page d'hébergements.
 */

import type { Connecteur } from "../types";

export const valmorel: Connecteur = {
  host: "www.valmorel.com",
  nom: "Valmorel",
  moteur: "Open System",
  indisponible:
    "Site d'office de tourisme sans page de résultats datés : l'empreinte Open System vient d'un widget inclus, pas d'un moteur interrogeable. Relevé du 13 septembre 2026.",
};
