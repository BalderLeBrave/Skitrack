/**
 * Relevé Ovo Network (voir `ovo.ts`) : l'API JSON de la recherche, une
 * requête par destination du site rattachée à la station (`couverture.ts` :
 * une, deux pour La Clusaz), toute la destination en une page. Tout ce qu'une
 * annonce publie est dans la réponse : aucune fiche à ouvrir.
 */

import { allowsPath } from "../robots";
import type { LiveSearchInput } from "../types";
import { lieuxDe } from "./couverture";
import { entetesRecherche, lireRecherche, ovoListings, uniques, urlRecherche, OVO_SITE, type BienOvo } from "./ovo";
import { demander, raisonDe, type OptionsReleve, type ReleveAgence } from "./reseau.server";

export async function releverOvo(input: LiveSearchInput, opts: OptionsReleve): Promise<ReleveAgence> {
  await allowsPath(OVO_SITE, "/ajax");
  const pages: BienOvo[][] = [];
  let incomplet = false;
  let raison: string | undefined;
  for (const destination of lieuxDe("Ovo Network", input.stationId)) {
    try {
      const r = await demander({
        hote: "ovo",
        url: urlRecherche(input, destination),
        echeance: opts.echeance,
        entetes: entetesRecherche(input, destination),
      });
      const page = lireRecherche(JSON.parse(r.texte), input);
      pages.push(page.biens);
      if (!page.complet) incomplet = true;
    } catch (err) {
      if (pages.length === 0) throw err;
      raison = raisonDe(err);
      break;
    }
  }
  const biens = uniques(pages);
  const listings = ovoListings(biens, input);
  const libres = biens.filter((b) => b.reservable).length;
  return {
    listings,
    note: `${biens.length} biens, ${libres} libres aux dates${incomplet ? ", page tronquée par le site" : ""}`,
    ...(raison ? { raison } : {}),
  };
}
