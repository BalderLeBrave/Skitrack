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
import { connecteurPour } from "./hotes";
import { ficheCentrale } from "./registre";
import type { ContexteCentrale, ResultatCentrale } from "./types";
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
 * Le relevé de l'audit suffit à nommer le moteur et à rappeler ce que son
 * `robots.txt` disait. C'est plus utile qu'un « non pris en charge » : le
 * lecteur voit que la centrale est connue, et pourquoi elle est muette.
 */
function sansConnecteur(nom: string, moteur: string, robots: string | null): string {
  const laQuelle = moteur === "inconnu" ? "dont le moteur n'a pas été identifié" : `sur moteur ${moteur}`;
  // Le verdict relevé porte sur la page d'accueil de la centrale, pas sur une
  // recherche datée. Le dire autrement ferait croire qu'il suffirait d'écrire
  // le connecteur, alors que plusieurs moteurs ferment nommément leurs pages
  // de recherche. La distinction tient en trois mots, et elle compte.
  const permission = robots ? ` Son robots.txt, pour sa page d'accueil, était « ${robots} » au relevé.` : "";
  return `Centrale ${nom}, ${laQuelle} : aucun connecteur écrit à ce jour.${permission}`;
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
  if (!connecteur) {
    return {
      ...commun,
      listings: [],
      interrogee: false,
      raison: sansConnecteur(fiche.nom, fiche.moteur, fiche.robotsReleve),
    };
  }
  if (!connecteur.chercher) {
    return {
      ...commun,
      listings: [],
      interrogee: false,
      raison: connecteur.indisponible ?? sansConnecteur(fiche.nom, fiche.moteur, fiche.robotsReleve),
    };
  }

  const ctx: ContexteCentrale = { ...input, base: origine(fiche.url, fiche.host) };
  const listings: Listing[] = await connecteur.chercher(ctx);
  return {
    ...commun,
    listings,
    interrogee: true,
    raison: listings.length === 0 ? `${fiche.nom} n'a rien de disponible à ces dates pour ce groupe.` : null,
  };
}
