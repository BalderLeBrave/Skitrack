/**
 * Ax 3 Domaines.
 *
 * Même génération ancienne d'Open System que [Les Sybelles](./lesSybelles.ts) :
 * point d'entrée `index.aspx`, widgets `gadget.open-system.fr`, aucune page
 * `pr<N>-....htm` — relevé du 13 septembre 2026, les deux chemins essayés
 * répondent 404, et il n'y a pas de `sitemap.xml`.
 *
 * `robots.txt` répond 200 et dit : « User-Agent: * / Disallow:
 * /*callback=jQuery*_WPJS=r* / Allow: / ». Il n'interdit donc qu'un motif de
 * rappel jQuery, et autorise le reste. Là encore, ce n'est pas la permission
 * qui manque.
 */

import type { Connecteur } from "../types";

export const ax3Domaines: Connecteur = {
  host: "reservation.ax-ski.com",
  nom: "Ax 3 Domaines",
  moteur: "Open System",
  indisponible:
    "Centrale Open System d'ancienne génération : sa recherche passe par un widget JavaScript, sans page de résultats à interroger. Relevé du 13 septembre 2026.",
};
