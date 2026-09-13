/**
 * Combloux.
 *
 * Son `robots.txt` dit « Disallow: / ». On le lit, on n'en fait pas un arrêt.
 * Le moteur n'a pas été identifié au sondage du 13 septembre 2026 : rien d'autre
 * que le fichier n'avait alors été demandé. Sans moteur nommé, il n'y a pas
 * encore d'appel de recherche.
 */

import type { Connecteur } from "../types";

export const combloux: Connecteur = {
  host: "reservation.combloux.com",
  nom: "Combloux",
  moteur: "inconnu",
  indisponible:
    "le moteur de cette centrale n'a pas été identifié au relevé du 13 septembre 2026. Sans savoir ce qui la fait tourner, il n'y a rien à interroger de sûr.",
};
