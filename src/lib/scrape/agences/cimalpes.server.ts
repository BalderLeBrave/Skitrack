/**
 * Relevé Cimalpes (voir `cimalpes.ts`) : la recherche AJAX de la station du
 * site, secteurs compris, 26 logements par page, une page à la fois. Le
 * serveur est lent (2 à 7 s par page) : on reste séquentiel. La position de
 * chaque logement est laissée à la complétion, qui lit sa fiche.
 */

import type { Listing } from "@/lib/listings";
import { allowsPath } from "../robots";
import type { LiveSearchInput } from "../types";
import { cibleCimalpes, cimalpesListings, lireRecherche, nombrePages, urlRecherche, CIMALPES_SITE, type CarteCimalpes } from "./cimalpes";
import { lieuxDe } from "./couverture";
import { demander, raisonDe, type OptionsReleve, type ReleveAgence } from "./reseau.server";

export async function releverCimalpes(input: LiveSearchInput, opts: OptionsReleve): Promise<ReleveAgence> {
  const [lieu] = lieuxDe("Cimalpes", input.stationId);
  if (!lieu) return { listings: [] };
  await allowsPath(CIMALPES_SITE, "/fr/recherche-location/");
  const cible = cibleCimalpes(lieu);
  const cartes: CarteCimalpes[] = [];
  let total: number | null = null;
  let pages = 1;
  let suggestions = 0;
  let raison: string | undefined;
  for (let page = 1; page <= pages; page++) {
    try {
      const res = await demander({
        hote: "cimalpes",
        url: urlRecherche(input, cible, page),
        echeance: opts.echeance,
        entetes: { accept: "application/json, text/javascript, */*; q=0.01" },
      });
      const r = lireRecherche(res.texte);
      if (page === 1) {
        total = r.total;
        pages = nombrePages(r.total);
      }
      cartes.push(...r.cartes);
      suggestions += r.suggestions;
      if (r.cartes.length === 0) break;
    } catch (err) {
      if (page === 1) throw err;
      raison = `page ${page} : ${raisonDe(err)}`;
      break;
    }
  }
  const listings: Listing[] = cimalpesListings(cartes, input);
  return {
    listings,
    annoncees: total,
    note: `${cartes.length} cartes${suggestions ? `, ${suggestions} suggestions d'autres stations coupées` : ""}`,
    ...(raison ? { raison } : {}),
  };
}
