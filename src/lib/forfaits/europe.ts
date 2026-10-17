/**
 * Le budget des forfaits d'un domaine européen hors France, pour le séjour.
 *
 * Le relevé mondial (`monde/vues.ts`) ne publie que trois durées : la
 * journée, six jours et la saison, chacune en adulte et en enfant. Le séjour
 * en compte autant que de jours de ski (`joursDuSejour`) :
 *
 * - un jour : la journée ;
 * - six jours : le forfait six jours ;
 * - deux à cinq jours : autant de journées, additionnées (« 4 journées ») ;
 * - plus de six : le forfait six jours, plus une journée par jour de plus.
 *
 * Rien n'est estimé : chaque terme est un prix publié, dans sa devise. Un
 * forfait de deux à cinq jours vendu par la station coûte souvent moins que
 * les journées additionnées ; la mention le dit.
 */

import { tr, trN } from "../i18n/tr.ts";
import type { ForfaitVue } from "../monde/vues.ts";
import { coutForfaits } from "./cout.ts";
import type { BudgetForfaits } from "./prixSejour.ts";

/** Le prix d'un forfait de `jours` jours, adulte ou enfant, et sa durée écrite. */
export function prixEurope(
  f: ForfaitVue,
  jours: number,
  qui: "Adulte" | "Enfant",
): { prix: number; duree: string } | null {
  const m = f.matrice;
  if (!m || jours < 1) return null;
  const jour = m[`jour${qui}`]?.prix ?? null;
  const six = m[`sixJours${qui}`]?.prix ?? null;
  if (jours === 1) return jour != null ? { prix: jour, duree: tr("1 jour") } : null;
  if (jours === 6 && six != null) return { prix: six, duree: tr("6 jours") };
  if (jours > 6 && six != null && jour != null) {
    return {
      prix: six + jour * (jours - 6),
      duree: trN(jours - 6, "6 jours + {n} journée", "6 jours + {n} journées"),
    };
  }
  if (jour == null) return null;
  return { prix: jour * jours, duree: trN(jours, "{n} journée", "{n} journées") };
}

/** Le budget du groupe, ou `null` sans tarif publié ou sans jour de ski. */
export function budgetEurope(
  f: ForfaitVue | null,
  jours: number | null,
  adultes: number,
  enfants: number,
): BudgetForfaits | null {
  if (!f?.devise || !jours) return null;
  const a = prixEurope(f, jours, "Adulte");
  if (!a) return null;
  const e = prixEurope(f, jours, "Enfant");
  // L'enfant ne compte à son tarif que pour la même durée que l'adulte.
  const enfant = e && e.duree === a.duree ? e.prix : null;
  const additionnees = jours > 1 && !(jours === 6 && f.matrice?.sixJoursAdulte);
  const source = f.misAJour
    ? tr("tarif publié le {date}", { date: f.misAJour })
    : tr("tarif publié");
  return {
    ...coutForfaits(a.prix, enfant, adultes, enfants, f.devise),
    libelle: tr("Forfaits {duree}", { duree: a.duree }),
    duree: a.duree,
    periode: additionnees ? `${source}, ${tr("journées additionnées")}` : source,
    periodeCourte: source,
    manque: null,
  };
}
