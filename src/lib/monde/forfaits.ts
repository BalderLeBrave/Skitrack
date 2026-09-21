/**
 * Le prix du forfait d'un domaine, **dans sa devise**.
 *
 * ## La règle, en une phrase
 *
 * Quatre-vingt-quatorze francs suisses s'écrivent « 94,00 CHF ». Pas « environ
 * 99 € ».
 *
 * skiresort.fr publie les deux : le prix local, et une conversion qu'il marque
 * lui-même « env. », sans dire ni son taux ni sa date. Le relevé garde les
 * deux ; ce module ne rend que le premier. Une conversion sans taux daté est
 * exactement la valeur estimée que le dépôt s'interdit, et `devises.ts` a été
 * généralisé pour qu'aucun écran n'ait besoin d'en fabriquer une.
 *
 * ## Ce que le rattachement vaut
 *
 * Il vient de la position, à cinq kilomètres au plus, en appariement glouton —
 * une fiche ne sert qu'un domaine. La distance voyage avec le prix, parce
 * qu'elle en dit la valeur : un forfait rattaché à 4,8 km n'est pas le forfait
 * du domaine avec la même certitude qu'un forfait rattaché à 200 m.
 *
 * ## Ce qui manque, et pourquoi
 *
 * Deux mille cinq cent dix-neuf fiches portent un prix, mais seules 1 618 ont
 * une position chez skiresort : le site ne publie pas de coordonnées pour tous
 * ses domaines, et un prix sans point ne se rattache à rien. Ces neuf cents
 * prix existent dans `forfaits.json` et n'ont pas de domaine. C'est une limite
 * de la source, pas une perte.
 */

import { montant } from "../devises.ts";

export type MontantReleve = {
  /** La chaîne publiée, sans retouche : « SFr. 94,- ». */
  brut: string;
  valeur: number | null;
  /** ISO 4217, ou `null` si le symbole n'a pas été reconnu. */
  devise: string | null;
};

export type ForfaitDomaine = {
  slug: string;
  nom: string | null;
  km: number;
  /** « Forfait journalier Haute saison », tel que le site l'écrit. */
  libelle: string | null;
  adultes: MontantReleve | null;
  jeunes: MontantReleve | null;
  enfants: MontantReleve | null;
};

export type ReleveForfaits = {
  calcule: string;
  quoi: string;
  regle: string;
  rayonKm: number;
  releve: string;
  domaines: number;
  rattaches: number;
  avertissement: string;
  forfaits: Record<string, ForfaitDomaine>;
};

let enCours: Promise<ReleveForfaits> | null = null;

/** Le relevé, chargé à la demande. */
export function releveForfaits(): Promise<ReleveForfaits> {
  enCours ??= import("./data/forfaitsDomaines.json", { with: { type: "json" } }).then(
    (m) => m.default as ReleveForfaits,
  );
  return enCours;
}

/**
 * Le montant écrit pour l'écran, ou `null`.
 *
 * `null` dès qu'il manque la valeur **ou** la devise. Écrire « 300 » sans dire
 * de quoi serait pire que de ne rien écrire : le lecteur y mettrait la sienne.
 */
export function prix(m: MontantReleve | null | undefined): string | null {
  if (!m || m.valeur == null || !m.devise) return null;
  return montant(m.valeur, m.devise);
}

/** Ce qu'on écrit à côté du prix, pour qu'il se lise sans ouvrir le code. */
export function mentionForfait(f: ForfaitDomaine): string {
  const d = f.km < 0.1 ? "au même point" : `à ${f.km.toFixed(1).replace(".", ",")} km`;
  const quoi = f.libelle ? `« ${f.libelle} »` : "forfait";
  return `skiresort.fr — ${quoi}, fiche « ${f.nom ?? f.slug} », ${d}`;
}
