/**
 * Praz de Lys – Sommand.
 *
 * L'audit du 13 septembre 2026 y voyait un widget Alliance. Le 9 octobre 2026
 * la page des meublés publie autre chose : un formulaire Elloha, publication
 * `45c11789-a844-4213-9dd5-f5964cc227e2` sur reservation.elloha.com.
 *
 * La recherche est datée (StartDate, Duration). Le montant est étiqueté
 * « à partir de ». Sept nuits à partir du 6 février 2027, puis quatorze :
 * plusieurs meublés de Taninges affichent 1 € puis 2 €, ou 7 € puis 14 €.
 * Une chambre d'hôtes passe de 592,20 € à 1 234,80 €, ce qui n'est pas le
 * double. Restreindre à la commune publiée « LE PRAZ DE LYS » (code 74927)
 * ne rend aucun logement. Ce n'est pas un total de séjour.
 */

import type { Connecteur } from "../types";

export const prazDeLys: Connecteur = {
  host: "www.prazdelys-sommand.com",
  nom: "Praz de Lys – Sommand",
  moteur: "Elloha",
  indisponible:
    "la recherche datée est Elloha, publication 45c11789-a844-4213-9dd5-f5964cc227e2. Le montant est étiqueté « à partir de ». Du 6 février 2027, des meublés affichent 1 € ou 7 € pour sept nuits, et une chambre d'hôtes ne double pas quand on passe à quatorze nuits. Ce n'est pas un total de séjour. Relevé du 9 octobre 2026.",
};
