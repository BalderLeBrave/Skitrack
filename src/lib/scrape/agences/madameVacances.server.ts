/**
 * Relevé Madame Vacances (voir `madameVacances.ts`) : la page de recherche de
 * la station du site, qui liste les établissements vendus aux dates (une
 * requête, sans pagination), puis l'appel AJAX de chaque établissement gardé,
 * qui donne le total exact de chaque type de logement. Un par un, au rythme
 * partagé du site ; un établissement non lu à l'échéance ne donne rien, et le
 * relevé le dit.
 */

import type { Listing } from "@/lib/listings";
import { allowsPath } from "../robots";
import type { LiveSearchInput } from "../types";
import { lieuxDe } from "./couverture";
import {
  aDetailler,
  entetesFiche,
  lireFiche,
  lireRecherche,
  madameVacancesListings,
  rechercheComprise,
  urlFiche,
  urlRecherche,
  MV_SITE,
} from "./madameVacances";
import { ArretAgence, demander, raisonDe, type OptionsReleve, type ReleveAgence } from "./reseau.server";

/** Deux établissements illisibles de suite : c'est le site qui a changé. */
const ECHECS_DE_SUITE = 2;

export async function releverMadameVacances(input: LiveSearchInput, opts: OptionsReleve): Promise<ReleveAgence> {
  const [site] = lieuxDe("Madame Vacances", input.stationId);
  if (!site) return { listings: [] };
  await allowsPath(MV_SITE, "/recherche/");
  const page = await demander({
    hote: "madamevacances",
    url: urlRecherche(input, site),
    echeance: opts.echeance,
    entetes: { accept: "text/html,application/xhtml+xml" },
  });
  const recherche = lireRecherche(page.texte);
  // Des dates mal comprises rendent d'autres semaines, sans erreur : aucune
  // n'est une offre pour ce séjour.
  if (!rechercheComprise(recherche, input)) {
    return { listings: [], raison: "le site n'a pas compris les dates demandées" };
  }
  const etablissements = aDetailler(recherche, input);
  const listings: Listing[] = [];
  let lus = 0;
  let echecs = 0;
  let suite = 0;
  let raison: string | undefined;
  for (const e of etablissements) {
    try {
      const r = await demander({
        hote: "madamevacances",
        url: urlFiche(e, input, site),
        echeance: opts.echeance,
        entetes: entetesFiche(e, input),
      });
      listings.push(...madameVacancesListings(e, lireFiche(r.texte), input));
      lus++;
      suite = 0;
    } catch (err) {
      echecs++;
      if (err instanceof ArretAgence || ++suite >= ECHECS_DE_SUITE) {
        raison = `${etablissements.length - lus} établissements non lus : ${raisonDe(err)}`;
        break;
      }
    }
  }
  if (!raison && echecs) raison = `${echecs} établissement${echecs > 1 ? "s" : ""} illisible${echecs > 1 ? "s" : ""}`;
  const ecartes = recherche.etablissements.length - etablissements.length;
  return {
    listings,
    note: `${etablissements.length} établissements aux dates, ${lus} lus${ecartes ? `, ${ecartes} écartés (hôtel, autres dates)` : ""}`,
    ...(raison ? { raison } : {}),
  };
}
