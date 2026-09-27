/**
 * Relevé Mountain Collection (voir `mountainCollection.ts`) : l'API JSON de la
 * recherche, pour la zone du site rattachée à la station, 30 logements par
 * page. D'abord l'hébergement seul, toutes ses pages ; puis la formule ski
 * (hébergement et forfaits), seulement pour un séjour de 7 nuits, la seule
 * durée où le site la vend, dans le temps qui reste.
 *
 * Un refus du site (429, 503, 403) arrête tout et se dit. La formule ski
 * laissée en route faute de temps ne met pas le relevé en défaut : chacune de
 * ses annonces double une offre d'hébergement seul déjà lue, moins chère.
 */

import type { Listing } from "@/lib/listings";
import { allowsPath } from "../robots";
import type { LiveSearchInput } from "../types";
import { lieuxDe } from "./couverture";
import {
  corpsRecherche,
  entetesRecherche,
  formuleSkiPossible,
  lireRecherche,
  mcListings,
  pageSuivante,
  MC_RECHERCHE,
  MC_SITE,
  type FormuleMC,
} from "./mountainCollection";
import { ArretAgence, demander, raisonDe, type OptionsReleve, type ReleveAgence } from "./reseau.server";

type LectureFormule = { listings: Listing[]; annoncees: number | null; pages: number; arret?: unknown };

async function lireFormule(input: LiveSearchInput, zone: string, formule: FormuleMC, echeance: number): Promise<LectureFormule> {
  const listings: Listing[] = [];
  const vus = new Set<string>();
  let annoncees: number | null = null;
  let pages = 0;
  for (let page: number | null = 1; page != null; ) {
    let r: ReturnType<typeof lireRecherche>;
    try {
      const res = await demander({
        hote: "mountaincollection",
        url: MC_RECHERCHE,
        methode: "POST",
        corps: JSON.stringify(corpsRecherche(input, zone, page, formule)),
        entetes: entetesRecherche(input, zone, formule),
        echeance,
      });
      r = lireRecherche(JSON.parse(res.texte));
    } catch (err) {
      return { listings, annoncees, pages, arret: err };
    }
    pages++;
    annoncees = r.total ?? annoncees;
    for (const l of mcListings(r.produits, input)) {
      if (vus.has(l.id)) continue;
      vus.add(l.id);
      listings.push(l);
    }
    page = pageSuivante(page, r.total, r.recus);
  }
  return { listings, annoncees, pages };
}

/** Un arrêt de notre fait (échéance, limiteur local), et non un refus du site. */
function arretDeTemps(err: unknown): boolean {
  return err instanceof ArretAgence && !/HTTP \d{3}/.test(err.message);
}

export async function releverMountainCollection(input: LiveSearchInput, opts: OptionsReleve): Promise<ReleveAgence> {
  const [zone] = lieuxDe("Mountain Collection", input.stationId);
  if (!zone) return { listings: [] };
  await allowsPath(MC_SITE, "/fr/search");
  const seul = await lireFormule(input, zone, "hebergement", opts.echeance);
  if (seul.arret && seul.pages === 0) throw seul.arret;
  const notes = [`hébergement seul : ${seul.listings.length} logements en ${seul.pages} page${seul.pages > 1 ? "s" : ""}`];
  let raison = seul.arret ? raisonDe(seul.arret) : undefined;
  const listings = [...seul.listings];
  if (!raison && formuleSkiPossible(input)) {
    const ski = await lireFormule(input, zone, "hebergement_forfait", opts.echeance);
    listings.push(...ski.listings);
    notes.push(`formule ski : ${ski.listings.length} logements en ${ski.pages} page${ski.pages > 1 ? "s" : ""}`);
    if (ski.arret) {
      if (arretDeTemps(ski.arret)) notes.push("formule ski laissée en route, faute de temps dans la part");
      else raison = raisonDe(ski.arret);
    }
  }
  return {
    listings,
    annoncees: seul.arret ? null : seul.annoncees,
    note: notes.join(", "),
    ...(raison ? { raison } : {}),
  };
}
