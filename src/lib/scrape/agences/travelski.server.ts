/**
 * Relevé Travelski (voir `travelski.ts`) : la recherche de l'API pour le lieu
 * du catalogue rattaché à la station, cent résidences par page ; puis la fiche
 * des résidences dont la position manque, une à une, dans le temps qui reste.
 *
 * La position, les chambres et les pièces ne sont que sur la fiche (340 à
 * 435 Ko), et elles ne changent pas avec les dates : lues une fois, elles vont
 * dans la mémoire des fiches de l'application (`stay/memoireFiches.server.ts`,
 * trente jours), où le relevé suivant les reprend sans requête. Une grande
 * station (102 résidences à Avoriaz) se complète donc sur plusieurs relevés ;
 * une annonce sans position le reste en attendant, et le relevé le dit.
 */

import type { Listing } from "@/lib/listings";
import { comblerDepuisMemoire, memoireFiches } from "@/lib/stay/memoireFiches.server";
import { cleListing } from "@/lib/stay/poserReleve";
import { allowsPath } from "../robots";
import type { LiveSearchInput } from "../types";
import { lieuxDe } from "./couverture";
import { ArretAgence, demander, raisonDe, type OptionsReleve, type ReleveAgence } from "./reseau.server";
import {
  corpsRecherche,
  lieuTravelski,
  lireFiche,
  lireRecherche,
  offresRetenues,
  travelskiListings,
  urlFiche,
  urlRecherche,
  PAGES_MAX,
  TRAVELSKI_API,
  type ResidenceTravelski,
} from "./travelski";

/** Un arrêt de notre fait (échéance, limiteur local), et non un refus du site. */
function arretDeTemps(err: unknown): boolean {
  return err instanceof ArretAgence && !/HTTP \d{3}/.test(err.message);
}

function sansPosition(l: Listing): boolean {
  return l.lat == null || l.lon == null;
}

/** La clé de mémoire d'un logement de la fiche : celle de ses annonces (`cleListing`). */
function cleLogement(id: string): string | null {
  return cleListing({ source: "Travelski", platformId: id, proven: "", guests: null, bedrooms: null, lat: null, lon: null });
}

export async function releverTravelski(input: LiveSearchInput, opts: OptionsReleve): Promise<ReleveAgence> {
  const [brut] = lieuxDe("Travelski", input.stationId);
  if (!brut) return { listings: [] };
  const lieu = lieuTravelski(brut);
  await allowsPath(TRAVELSKI_API, "/se/search/product");
  const residences: ResidenceTravelski[] = [];
  let total: number | null = null;
  let pages = 1;
  let raison: string | undefined;
  for (let page = 0; page < pages; page++) {
    try {
      const res = await demander({
        hote: "travelski",
        url: urlRecherche(page),
        methode: "POST",
        corps: JSON.stringify(corpsRecherche(input, lieu)),
        entetes: { accept: "*/*", "content-type": "application/json" },
        echeance: opts.echeance,
      });
      const r = lireRecherche(JSON.parse(res.texte));
      if (page === 0) {
        total = r.total;
        pages = Math.min(PAGES_MAX, Math.max(1, r.pages ?? 1));
      }
      residences.push(...r.residences);
      if (r.recues === 0) break;
    } catch (err) {
      if (page === 0) throw err;
      raison = `page ${page + 1} : ${raisonDe(err)}`;
      break;
    }
  }

  // Les annonces, avec ce que la mémoire des fiches sait déjà.
  const memoire = memoireFiches();
  const parResidence = new Map<string, Listing[]>();
  const aLire: ResidenceTravelski[] = [];
  for (const r of residences) {
    if (offresRetenues(r, input).length === 0) continue;
    const rows = travelskiListings(r, null, input);
    for (const row of rows) {
      const m = memoire.lire(cleListing(row));
      if (m) comblerDepuisMemoire(row, m);
    }
    parResidence.set(r.liheId, rows);
    if (rows.some(sansPosition) && urlFiche(r.lien)) aLire.push(r);
  }

  // Les fiches qui manquent, une à une, tant que la part le permet.
  let lues = 0;
  let enRoute = false;
  for (const r of raison ? [] : aLire) {
    try {
      const res = await demander({
        hote: "travelski",
        url: urlFiche(r.lien) as string,
        echeance: opts.echeance,
        entetes: { accept: "text/html,application/xhtml+xml" },
      });
      const fiche = lireFiche(res.texte);
      if (!fiche) continue;
      lues++;
      memoire.noter(
        [...fiche.logements.values()].map((l) => ({
          cle: cleLogement(l.id),
          guests: l.capacite,
          bedrooms: l.chambres,
          rooms: l.pieces,
          lat: fiche.lat,
          lon: fiche.lon,
          lue: true,
        })),
      );
      parResidence.set(r.liheId, travelskiListings(r, fiche, input));
    } catch (err) {
      if (arretDeTemps(err)) enRoute = true;
      else raison = raisonDe(err);
      break;
    }
  }

  const listings = [...parResidence.values()].flat();
  const sans = listings.filter(sansPosition).length;
  const notes = [
    `${residences.length} résidences${total != null && total > residences.length ? ` sur ${total}` : ""}, ${parResidence.size} avec une offre aux dates`,
    `${lues} fiche${lues > 1 ? "s" : ""} lue${lues > 1 ? "s" : ""}`,
    sans ? `${sans} annonces encore sans position${enRoute ? " (fiches laissées au relevé suivant)" : ""}` : null,
  ].filter(Boolean);
  return {
    listings,
    // Le compte du site est celui des résidences (`totalProducts`), pas des logements : il va dans la note.
    annoncees: null,
    note: notes.join(", "),
    ...(raison ? { raison } : {}),
  };
}
