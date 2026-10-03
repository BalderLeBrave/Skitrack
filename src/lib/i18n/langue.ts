/**
 * La langue de l'interface **en cours de rendu**.
 *
 * Elle n'est pas lue dans le magasin (`useLocale`) à chaque appel : le serveur
 * rend toujours en français, et le navigateur doit hydrater le même texte. La
 * coquille de l'application (`Langue`, `__root.tsx`) la pose ici une fois
 * montée, puis remonte l'arbre : tout ce qui écrit un texte, composant ou
 * fonction de `lib`, le relit alors dans la bonne langue sans avoir à
 * s'abonner au magasin.
 */

import type { Locale } from "./catalog.ts";

let enCours: Locale = "fr";

export function langue(): Locale {
  return enCours;
}

export function poserLangue(l: Locale): void {
  enCours = l;
}

/** La langue des nombres et des dates (`Intl`) : l'anglais britannique, qui écrit les dates jour d'abord. */
export function langueIntl(): "fr-FR" | "en-GB" {
  return enCours === "en" ? "en-GB" : "fr-FR";
}
