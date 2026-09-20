/**
 * Écrire une somme d'argent. **Une seule implémentation.**
 *
 * L'audit du 18 septembre 2026 appelle ce sujet « le point le plus diffus » :
 * le référentiel n'avait qu'une devise, et le code ne le disait nulle part —
 * il l'écrivait. Un `€` collé au nombre dans `parcours.ts`, un autre dans
 * `forfaits/age.ts`, un `currency: "EUR"` dans `accommodation.ts`, quatre
 * `devise: "EUR"` dans `forfaits/grille.ts`. Rien n'était faux tant que toutes
 * les stations étaient françaises ; tout le devient à la première suisse.
 *
 * La règle que l'audit fixe est tenue ici : **un formateur prend la devise en
 * argument, et l'euro devient un cas particulier et non la règle.** `eur()` et
 * `formatEuroTarif()` existent toujours et ne changent pas de sortie — trente
 * appels les emploient —, mais ce sont désormais des raccourcis vers
 * `montant()`, et non l'inverse.
 *
 * ## Le symbole n'est pas écrit à la main
 *
 * Il vient de l'ICU, par `Intl.NumberFormat`, comme les noms de pays viennent
 * de CLDR dans `geo/pays.ts`. C'est ce qui évite qu'une graphie personnelle
 * s'installe : l'ICU écrit « CHF » pour le franc suisse, « $US » pour le
 * dollar américain en français, et « ¥ » pour le yen. Aucune table à tenir.
 */

import { paysByCode } from "./geo/pays.ts";
import { decimal, entier, LANGUE_NOMBRES } from "./nombres.ts";

/** Le formatage des nombres a déménagé dans `nombres.ts` : `unites.ts` en a
 *  besoin aussi, et trois copies de la même règle auraient fini par diverger
 *  sur l'espace des milliers. Réexporté ici, où des appelants le cherchent. */
export { entier, LANGUE_NOMBRES } from "./nombres.ts";

const SYMBOLES = new Map<string, string>();

/**
 * Le symbole d'une devise, tel que l'ICU l'écrit dans la langue de
 * l'interface. Une devise inconnue rend son propre code, qui est toujours
 * lisible : mieux vaut « 359 XXX » qu'un prix sans unité.
 */
export function symboleDevise(devise: string): string {
  const code = devise.toUpperCase();
  const connu = SYMBOLES.get(code);
  if (connu !== undefined) return connu;
  let symbole = code;
  try {
    const part = new Intl.NumberFormat(LANGUE_NOMBRES, { style: "currency", currency: code })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    if (part) symbole = part.value;
  } catch {
    // `Intl` refuse un code qui n'est pas de la forme ISO 4217. Le code brut
    // fait alors l'affaire, et l'écran n'affiche pas un prix nu.
  }
  SYMBOLES.set(code, symbole);
  return symbole;
}

/** `montant(1234)` → « 1 234 € ». `montant(1234, "CHF")` → « 1 234 CHF ». */
export function montant(n: number | null | undefined, devise = "EUR"): string {
  return n == null ? "–" : `${entier(n)} ${symboleDevise(devise)}`;
}

/** Comme `montant`, mais rend `null` plutôt que « – » : l'écran écrit alors
 *  l'absence en toutes lettres, ce que les écrans v7 préfèrent. */
export function montantN(n: number | null | undefined, devise = "EUR"): string | null {
  return n == null ? null : montant(n, devise);
}

/** Les centimes seulement quand il y en a. */
export function montantCents(n: number | null | undefined, devise = "EUR"): string | null {
  if (n == null) return null;
  // Les centimes ne s'écrivent que s'il y en a : « 12 € », mais « 12,50 € ».
  const nombre = n % 1 ? decimal(n, 2).replace(/,(\d)$/, ",$10") : entier(n);
  return `${nombre} ${symboleDevise(devise)}`;
}

/**
 * La devise d'un pays, ou `null` s'il n'en a pas de connue.
 *
 * Le `null` n'est pas théorique : `geo/pays.ts` laisse dehors l'Antarctique,
 * en face de qui la liste ISO 4217 écrit « No universal currency ». Un prix y
 * serait invraisemblable, mais un écran qui itère sur les pays du référentiel
 * passera par là, et il vaut mieux qu'il trouve `null` qu'un euro inventé.
 */
export function deviseDuPays(code: string | null | undefined): string | null {
  return paysByCode(code)?.devise ?? null;
}

/**
 * Deux sommes s'additionnent-elles ?
 *
 * Un total qui mêle des euros et des francs suisses ne veut rien dire, et
 * aucun taux de change ne vit dans ce dépôt — la devise est d'affichage, elle
 * n'est jamais convertie. La question se pose donc avant chaque somme.
 */
export function memeDevise(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toUpperCase() === b.toUpperCase();
}
