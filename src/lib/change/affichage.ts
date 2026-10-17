/**
 * La devise dans laquelle l'écran écrit les prix, et les taux qui l'y mènent.
 *
 * Un prix est relevé dans sa devise et y reste : les calculs, les totaux et
 * les comparaisons se font dans la devise de la source (`memeDevise`). Seul
 * l'affichage convertit, quand le lecteur a choisi une devise
 * (`DeviseApp`), au taux de référence de la Banque centrale européenne du
 * jour publié. Un montant converti s'écrit précédé de « ≈ » : c'est une
 * conversion, pas le prix publié.
 *
 * Posée comme la langue (`langue.ts`) : la coquille la pose pendant le rendu
 * et remonte l'arbre quand elle change. Hors navigateur (serveur, tests),
 * rien n'est posé et rien n'est converti.
 */

/** Taux de référence BCE : combien d'unités de la devise pour un euro. */
export type TauxBce = { date: string; parEuro: Record<string, number> };

let devise: string | null = null;
let taux: TauxBce | null = null;

export function poserAffichage(d: string | null, t: TauxBce | null): void {
  devise = d;
  taux = t;
}

export function deviseAffichage(): string | null {
  return devise;
}

export function tauxAffichage(): TauxBce | null {
  return taux;
}

function parEuro(t: TauxBce, code: string): number | null {
  if (code === "EUR") return 1;
  const v = t.parEuro[code];
  return typeof v === "number" && v > 0 ? v : null;
}

/**
 * La somme convertie dans la devise d'affichage, ou `null` quand il n'y a
 * rien à convertir : aucune devise choisie, la même devise, ou un taux que la
 * BCE ne publie pas (le prix reste alors dans sa devise).
 */
export function convertir(n: number, depuis: string, t = taux, vers = devise): number | null {
  if (!vers || !t) return null;
  const a = depuis.toUpperCase();
  const b = vers.toUpperCase();
  if (a === b) return null;
  const ra = parEuro(t, a);
  const rb = parEuro(t, b);
  if (ra == null || rb == null) return null;
  return (n / ra) * rb;
}

/** Lit le fichier quotidien de la BCE (`eurofxref-daily.xml`). */
export function lireTauxBce(xml: string): TauxBce | null {
  const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  if (!date) return null;
  const parEuro: Record<string, number> = {};
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    const v = Number(m[2]);
    if (Number.isFinite(v) && v > 0) parEuro[m[1]] = v;
  }
  return Object.keys(parEuro).length ? { date, parEuro } : null;
}

/** Les devises proposées au lecteur : l'euro, puis celles que la BCE publie. */
export const DEVISES_PROPOSEES = [
  "EUR",
  "GBP",
  "USD",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "CAD",
  "AUD",
  "JPY",
] as const;
