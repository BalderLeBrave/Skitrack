/**
 * Les grilles mises de côté par le relevé, en attente d'une décision.
 *
 * Une grille qu'un témoin (Skiinfo, skiresort.fr) contredit de plus de moitié
 * n'est pas servie : elle attend dans `grillesMisesDeCote.json` qu'on la
 * valide (elle rejoint alors les grilles officielles) ou qu'on l'écarte (le
 * prix précédent reste). La décision est gardée avec l'empreinte des prix : le
 * relevé suivant qui relit la même grille l'applique sans redemander ; une
 * grille qui a changé repasse en relecture.
 *
 * Fonctions pures, partagées par le relevé et le serveur.
 */

import type { GrilleTarifaire } from "./tarifsPeriode.ts";
import type { Confrontation } from "./verification.ts";

export type Verdict = "validee" | "ecartee";

export type GrilleARelire = {
  grille: GrilleTarifaire;
  /** Les confrontations en alerte, telles que le relevé les a faites. */
  confrontations: Confrontation[];
  misDeCoteLe: string;
};

export type Decision = { verdict: Verdict; empreinte: string; le: string };

export type FichierARelire = {
  aRelire: GrilleARelire[];
  decisions: Record<string, Decision>;
};

export const FICHIER_A_RELIRE_VIDE: FichierARelire = { aRelire: [], decisions: {} };

/** Ce qui fait le prix d'une grille : ses périodes et ses tarifs, sans la date du relevé. */
export function empreinte(g: GrilleTarifaire): string {
  const texte = JSON.stringify(
    g.periodes.map((p) => [
      p.debut,
      p.fin,
      p.tarifs.map((t) => [t.libelleDuree, t.categorie, t.prix, t.restriction]),
    ]),
  );
  let h = 5381;
  for (let i = 0; i < texte.length; i++) h = ((h << 5) + h + texte.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** La décision déjà prise sur cette grille, si ses prix n'ont pas changé. */
export function decisionDe(f: FichierARelire, g: GrilleTarifaire): Verdict | null {
  const d = f.decisions[g.id];
  return d && d.empreinte === empreinte(g) ? d.verdict : null;
}

/** Le fichier après une décision : la grille sort de la liste, la décision reste. */
export function decider(
  f: FichierARelire,
  id: string,
  verdict: Verdict,
  le: string,
): FichierARelire {
  const item = f.aRelire.find((x) => x.grille.id === id);
  if (!item) return f;
  return {
    aRelire: f.aRelire.filter((x) => x.grille.id !== id),
    decisions: { ...f.decisions, [id]: { verdict, empreinte: empreinte(item.grille), le } },
  };
}

/** Écrit un fichier de grilles une grille par ligne, comme le relevé. */
export function ecrireGrilles(entete: Record<string, unknown>, grilles: GrilleTarifaire[]): string {
  const tete = JSON.stringify(entete).slice(0, -1);
  return `${tete}${tete.length > 1 ? "," : ""}"grilles":[\n${grilles.map((g) => JSON.stringify(g)).join(",\n")}\n]}\n`;
}
