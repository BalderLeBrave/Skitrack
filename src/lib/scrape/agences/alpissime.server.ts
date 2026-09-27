/**
 * Relevé Alpissime (voir `alpissime.ts`) : la recherche datée de la station
 * du site, page après page, neuf cartes par page, au rythme partagé du site
 * (`reseau.server.ts`). Un refus ou l'échéance arrête la pagination ; ce qui
 * est lu reste. Les chambres, que seule la fiche publie, sont laissées à la
 * complétion (`stay/priseFiche.ts`).
 */

import { allowsPath } from "../robots";
import type { LiveSearchInput } from "../types";
import { annoncesAlpissime, releverStation, stationAlpissime, ALPISSIME_SITE } from "./alpissime";
import { lieuxDe } from "./couverture";
import { demander, type OptionsReleve, type ReleveAgence } from "./reseau.server";

export async function releverAlpissime(input: LiveSearchInput, opts: OptionsReleve): Promise<ReleveAgence> {
  const [lieugeo] = lieuxDe("Alpissime", input.stationId);
  if (!lieugeo) return { listings: [] };
  await allowsPath(ALPISSIME_SITE, "/recherche");
  const station = stationAlpissime(lieugeo, input.stationId);
  const r = await releverStation(input, station, async (url) => {
    const res = await demander({
      hote: "alpissime",
      url,
      echeance: opts.echeance,
      entetes: { accept: "text/html,application/xhtml+xml" },
    });
    return res.texte;
  });
  const listings = annoncesAlpissime(r, input, station);
  const notes = [
    `${r.cartes.length} cartes en ${r.pagesLues} page${r.pagesLues > 1 ? "s" : ""}`,
    station.villages ? `${listings.length} dans les villages de la station` : null,
    r.manquantes.length && !r.raison ? `${r.manquantes.length} résultats du témoin sans carte` : null,
  ].filter(Boolean);
  return {
    listings,
    // Le compteur du site vaut pour toute sa station : il ne se rapporte pas à
    // une station Skitrack plus fine.
    annoncees: station.villages ? null : r.annoncees,
    note: notes.join(", "),
    ...(r.raison ? { raison: r.raison } : {}),
  };
}
