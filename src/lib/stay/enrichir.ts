/**
 * Ce qu'on peut encore lire sur une annonce déjà construite, sans relancer
 * un collecteur : titre, URL, type, galerie, identifiant Airbnb dans une photo.
 *
 * Le GPS Gîtes et l'accès ski se posent dans `searchStay`, qui connaît la
 * station. Ici, rien n'est estimé : on ne fait que poser ce que la source
 * a déjà écrit, ailleurs que dans le champ dédié. Capacité, chambres,
 * pièces, cabine et type passent par `qualifierLogement`, qui dit la source
 * de chaque valeur (`capacitySource`, `bedroomsSource`).
 */

import type { Listing } from "../listings.ts";
import { airbnbIdOf } from "./airbnbId.ts";
import { galerieOf } from "./completude.ts";
import { qualifierLogement } from "./logement.ts";
import { purgerTarifFigé } from "./tarif.ts";
import { titreDepuisUrl, titreEstFichier } from "./titre.ts";

export { airbnbIdOf };

export function enrichirListing(l: Listing): Listing {
  const title = titreEstFichier(l.title) ? (titreDepuisUrl(l.url) ?? l.title) : l.title;
  const qualifie = qualifierLogement({ ...l, title });
  const photo = l.photo ?? galerieOf(l)[0] ?? null;
  const airbnbId = l.source === "Airbnb" ? airbnbIdOf(l) : null;
  const url = l.url ?? (airbnbId ? `https://www.airbnb.fr/rooms/${airbnbId}` : null);
  const platformId = l.platformId ?? airbnbId ?? null;
  // Le montant de la centrale est le loyer aux dates demandées, pas le
  // total payé : la taxe de séjour s'ajoute au paiement. L'étiquette
  // « à partir de » du gabarit n'en fait pas un tarif d'appel.
  const priceIndicative = l.source === "Centrale" && l.total > 0 ? null : (l.priceIndicative ?? null);
  const next = {
    ...qualifie,
    photo,
    url,
    platformId,
    priceIndicative,
  };
  return purgerTarifFigé(next);
}
