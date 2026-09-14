/**
 * Dévoluy — La Joue du Loup et Superdévoluy.
 *
 * Troisième centrale de la génération ancienne d'Open System, reconnaissable au
 * `script/script_os.js` que sa page d'accueil charge et aux widgets
 * `gadget.open-system.fr`. Relevé du 13 septembre 2026 : aucune page
 * `pr<N>-....htm` (404 sur les deux chemins essayés), pas de `sitemap.xml`,
 * aucun `MoteurRecherche` déclaré.
 *
 * `robots.txt` répond 404 : fichier absent, journalisé. Ce qui manque est une
 * URL de résultats.
 */

import type { Connecteur } from "../types";

export const devoluy: Connecteur = {
  host: "reservation.ledevoluy.com",
  nom: "Dévoluy",
  moteur: "Open System",
  indisponible:
    "elle tourne sur la génération ancienne d'Open System, dont la recherche passe par un widget JavaScript, sans page de résultats à interroger. Relevé du 13 septembre 2026.",
};
