/**
 * Les Sybelles — La Toussuire, Le Corbier, Les Bottières, Saint-Sorlin-d'Arves,
 * Saint-Jean-d'Arves, Saint-Pancrace.
 *
 * Six stations, la plus grosse prise du moteur Open System, et elle ne se prend
 * pas. La centrale tourne sur la génération **ancienne** d'Open System :
 * pages `.aspx`, widgets chargés depuis `gadget.open-system.fr` et
 * `js.for-system.com`, gabarit déclaré par le namespace
 * `http://www.open-system.fr/def-maquette/v1`.
 *
 * Relevé du 13 septembre 2026, mesuré et non supposé : les chemins de la
 * génération moderne répondent 404 — `/pr7-tous-nos-hebergements.htm`,
 * `/pr1-hebergements.htm` —, il n'y a ni `sitemap.xml` ni plan du site, et la
 * page d'accueil ne déclare aucun `MoteurRecherche`. La recherche datée part
 * donc d'un widget JavaScript, sans URL de résultats à interroger.
 *
 * `robots.txt` répond 404 : fichier absent, journalisé, l'extraction
 * continuerait. Ce qui empêche ici n'est pas le fichier : il n'y a rien à appeler.
 */

import type { Connecteur } from "../types";

export const lesSybelles: Connecteur = {
  host: "reservation.la-toussuire.com",
  nom: "Les Sybelles",
  moteur: "Open System",
  indisponible:
    "elle tourne sur la génération ancienne d'Open System, dont la recherche passe par un widget JavaScript, sans page de résultats à interroger. Relevé du 13 septembre 2026.",
};
