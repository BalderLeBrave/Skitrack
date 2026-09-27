/**
 * Relevé Maeva (voir `maeva.ts`) : la recherche du site pour chaque
 * destination maeva de la station (`couverture.ts`), 30 résidences par page.
 * D'abord le catalogue FRANCE (hébergement seul, totaux exacts), toutes ses
 * pages ; puis, dans le temps qui reste, le catalogue SKI, pour les formules
 * « Hébergement + forfait », dont le site ne publie qu'un prix par personne.
 *
 * Un refus du site (429, 503, 403) arrête tout et se dit. Le catalogue SKI
 * laissé en route faute de temps ne met pas le relevé en défaut : ses offres
 * n'ont pas de total, et ne comptent nulle part.
 */

import type { Listing } from "@/lib/listings";
import { allowsPath } from "../robots";
import type { LiveSearchInput } from "../types";
import { lieuxDe } from "./couverture";
import { lireRecherche, maevaListings, pagesAParcourir, requeteRecherche, MAEVA_SITE, type Catalogue } from "./maeva";
import { ArretAgence, demander, raisonDe, type OptionsReleve, type ReleveAgence } from "./reseau.server";

type Lecture = { residences: number; pages: number; arret?: unknown };

async function lireCatalogue(
  input: LiveSearchInput,
  cles: readonly number[],
  catalogue: Catalogue,
  echeance: number,
  garder: (l: Listing) => void,
): Promise<Lecture> {
  let residences = 0;
  let pages = 0;
  for (const cle of cles) {
    let dernier = 1;
    for (let page = 1; page <= dernier; page++) {
      try {
        const q = requeteRecherche(input, cle, { page, catalogue });
        const r = lireRecherche(JSON.parse((await demander({ hote: "maeva", url: q.url, methode: "POST", corps: q.corps, entetes: q.entetes, echeance })).texte));
        pages++;
        if (page === 1) dernier = pagesAParcourir(r.total);
        residences += r.residences.length;
        for (const res of r.residences) for (const l of maevaListings(res, input, { cles, forfaits: catalogue === "SKI" })) garder(l);
        if (r.recus === 0) break;
      } catch (err) {
        return { residences, pages, arret: err };
      }
    }
  }
  return { residences, pages };
}

/** Un arrêt de notre fait (échéance, limiteur local), et non un refus du site. */
function arretDeTemps(err: unknown): boolean {
  return err instanceof ArretAgence && !/HTTP \d{3}/.test(err.message);
}

export async function releverMaeva(input: LiveSearchInput, opts: OptionsReleve): Promise<ReleveAgence> {
  const cles = lieuxDe("Maeva", input.stationId).map(Number);
  if (cles.length === 0) return { listings: [] };
  await allowsPath(MAEVA_SITE, "/fr-fr/assets/dm.php");
  const parId = new Map<string, Listing>();
  const garder = (l: Listing) => {
    if (!parId.has(l.id)) parId.set(l.id, l);
  };
  const france = await lireCatalogue(input, cles, "FRANCE", opts.echeance, garder);
  if (france.arret && france.pages === 0) throw france.arret;
  const notes = [`hébergement seul : ${france.residences} résidences en ${france.pages} page${france.pages > 1 ? "s" : ""}`];
  let raison = france.arret ? raisonDe(france.arret) : undefined;
  if (!raison) {
    const ski = await lireCatalogue(input, cles, "SKI", opts.echeance, garder);
    notes.push(`formules ski : ${ski.residences} résidences en ${ski.pages} page${ski.pages > 1 ? "s" : ""}`);
    if (ski.arret) {
      if (arretDeTemps(ski.arret)) notes.push("formules ski laissées en route, faute de temps dans la part");
      else raison = raisonDe(ski.arret);
    }
  }
  return {
    listings: [...parId.values()],
    note: notes.join(", "),
    ...(raison ? { raison } : {}),
  };
}
