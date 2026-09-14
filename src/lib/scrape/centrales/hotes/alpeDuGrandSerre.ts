/**
 * Alpe du Grand Serre, par l'office de tourisme de la Matheysine.
 *
 * Même situation que [Valmorel](./valmorel.ts) : un WordPress d'office de
 * tourisme où l'empreinte Open System vient d'un widget inclus. Relevé du
 * 13 septembre 2026 : aucun `MoteurRecherche`, aucun chemin `pr<N>-....htm`.
 *
 * `robots.txt` répond 200 et dit « User-agent: * / Disallow: », c'est-à-dire
 * aucune règle. On le lit. Ce qui manque est une URL de résultats.
 */

import type { Connecteur } from "../types";

export const alpeDuGrandSerre: Connecteur = {
  host: "www.matheysine-tourisme.com",
  nom: "Alpe du Grand Serre",
  moteur: "Open System",
  indisponible:
    "son site d'office de tourisme n'a pas de page de résultats datés. L'empreinte Open System relevée par l'audit vient d'un widget inclus, pas d'un moteur interrogeable. Relevé du 13 septembre 2026.",
};
