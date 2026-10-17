import { paysByCode } from "../geo/pays.ts";
import type { LiveSearchInput } from "./types";

/** Le pays à écrire après le nom de la station dans une recherche de site
 *  (« Ischgl, Autriche ») : la France quand la recherche n'en dit rien. */
export function paysDeRecherche(input: Pick<LiveSearchInput, "country">): string {
  return paysByCode(input.country ?? "FR")?.nomFr ?? "France";
}
