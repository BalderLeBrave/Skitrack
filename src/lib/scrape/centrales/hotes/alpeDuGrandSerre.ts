/**
 * Alpe du Grand Serre, par l'office de tourisme de la Matheysine.
 *
 * Même situation que [Valmorel](./valmorel.ts) : un WordPress d'office de
 * tourisme où l'empreinte Open System vient d'un widget inclus. Relevé du
 * 13 septembre 2026 : aucun `MoteurRecherche`, aucun chemin `pr<N>-....htm`.
 *
 * `robots.txt` répond 200 et dit « User-agent: * / Disallow: », c'est-à-dire
 * qu'il n'interdit rien. Ce n'est pas la permission qui manque.
 */

import type { Connecteur } from "../types";

export const alpeDuGrandSerre: Connecteur = {
  host: "www.matheysine-tourisme.com",
  nom: "Alpe du Grand Serre",
  moteur: "Open System",
  indisponible:
    "Site d'office de tourisme sans page de résultats datés : l'empreinte Open System vient d'un widget inclus, pas d'un moteur interrogeable. Relevé du 13 septembre 2026.",
};
