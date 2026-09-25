/**
 * Interroger la centrale d'une station.
 *
 * Une station, une centrale, au plus. Ce n'est pas une plateforme qu'on
 * interroge partout : c'est l'office de tourisme de l'endroit, et il n'y en a
 * qu'un. Le rattachement vient de `registre.ts`, qui le tient du relevé du
 * 19 août 2026.
 *
 * **Rendre compte plutôt que se taire.** Une recherche qui ne ramène rien doit
 * dire laquelle des quatre raisons c'était : la station n'a pas de centrale
 * relevée, la centrale n'a pas encore de connecteur, son connecteur sait déjà
 * qu'il ne peut pas l'interroger, ou l'appel a échoué. Un zéro sans motif se
 * lit comme « pas de logement disponible », ce qui serait faux.
 */

import type { Listing } from "@/lib/listings";
import { couverture, phraseCouverture } from "./couverture";
import { connecteurPour } from "./hotes";
import { etatDuMoteur } from "./moteurs/etat";
import { chercherIngenieHote } from "./moteurs/ingenie.server";
import { ficheCentrale } from "./registre";
import type { ContexteCentrale, MoteurCentrale, ResultatCentrale } from "./types";
import type { LiveSearchInput } from "../types";

/** Origine de la centrale, à partir de l'URL relevée. */
function origine(url: string, host: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return `https://${host}`;
  }
}

/**
 * Ce qu'on peut dire d'une centrale sans connecteur.
 *
 * Le moteur suffit à expliquer le silence, parce que l'empêchement lui
 * appartient et non à la centrale : `moteurs/etat.ts` tient la phrase de
 * chacun, du sondage du 13 septembre 2026. C'est plus utile qu'un « non pris
 * en charge », qui laisse croire à un oubli.
 *
 * Ce qui n'est **pas** repris ici : le verdict `robots.txt` du relevé. On le
 * lit à l'exécution et on n'en arrête aucune centrale. La phrase du moteur
 * dit ce qui empêche encore, quand ce n'est pas un Disallow.
 */
function sansConnecteur(moteur: MoteurCentrale): string {
  return etatDuMoteur(moteur);
}

/**
 * La phrase complète, nom de la centrale compris.
 *
 * Elle est fabriquée ici et nulle part ailleurs : l'écran l'affiche telle
 * quelle, sans rien y ajouter. Les motifs des connecteurs sont donc écrits
 * comme des suites de phrase, jamais comme des phrases entières, et aucun ne
 * recommence par « Centrale ».
 */
function phrase(nom: string, suite: string): string {
  return `Centrale ${nom} : ${suite}`;
}

/**
 * Une ligne de journal par recherche : combien de logements ont leur point,
 * leur capacité, leurs chambres. Aucune requête de plus ; c'est la mesure qui
 * dit, moteur par moteur, ce qui manque encore.
 */
function noterCouverture(host: string, moteur: MoteurCentrale, listings: readonly Listing[]): void {
  if (listings.length === 0) return;
  console.info(`[centrale] ${host} (${moteur}) : ${phraseCouverture(couverture(listings))}`);
}

export async function chercherCentrale(input: LiveSearchInput): Promise<ResultatCentrale> {
  const fiche = ficheCentrale(input.stationId);
  if (!fiche) {
    return {
      listings: [],
      host: null,
      nom: null,
      moteur: null,
      interrogee: false,
      raison: "Cette station n'a pas de centrale de réservation officielle au relevé du 19 août 2026.",
    };
  }

  const commun = { host: fiche.host, nom: fiche.nom, moteur: fiche.moteur };
  const connecteur = connecteurPour(fiche.host);
  const ctx: ContexteCentrale = { ...input, base: origine(fiche.url, fiche.host) };

  if (!connecteur?.chercher && fiche.moteur === "Ingénie") {
    const listings: Listing[] = await chercherIngenieHote(ctx, fiche.nom, fiche.host);
    noterCouverture(fiche.host, fiche.moteur, listings);
    return {
      ...commun,
      listings,
      interrogee: true,
      raison: listings.length === 0 ? phrase(fiche.nom, "rien de disponible à ces dates pour ce groupe.") : null,
    };
  }

  if (!connecteur) {
    return {
      ...commun,
      listings: [],
      interrogee: false,
      raison: phrase(fiche.nom, sansConnecteur(fiche.moteur)),
    };
  }
  if (!connecteur.chercher) {
    return {
      ...commun,
      listings: [],
      interrogee: false,
      raison: phrase(fiche.nom, connecteur.indisponible ?? sansConnecteur(fiche.moteur)),
    };
  }

  const listings: Listing[] = await connecteur.chercher(ctx);
  noterCouverture(fiche.host, fiche.moteur, listings);
  return {
    ...commun,
    listings,
    interrogee: true,
    raison: listings.length === 0 ? phrase(fiche.nom, "rien de disponible à ces dates pour ce groupe.") : null,
  };
}
