/**
 * Les médianes de « Par station », recomptées à la lecture.
 *
 * Un relevé enregistré garde son nombre de logements et sa médiane tels qu'au
 * jour du relevé. Ceux d'avant le rattachement par station comptaient aussi
 * les logements des stations voisines et reliées : un logement des Arcs dans
 * la médiane de La Plagne, et dans celle des Arcs. Un comparateur ne compare
 * pas une telle médiane à celle d'un relevé d'aujourd'hui.
 *
 * Chaque relevé réussi dont les annonces sont lues se recompte donc sur ses
 * seules annonces, rejugées sur le référentiel du jour (`annoncesLues`), avec
 * la règle des cartes de « Par budget » (`annonceMontree`) : une médiane ne
 * compte jamais un logement sans carte. Rien n'est écrit, rien ne change de
 * relevé ; le prochain relevé de la station remplace le résultat.
 */

import { annonceMontree, mediane, type AnnonceRetenue, type Resultat } from "./calcul.ts";
import { cleDuLogement } from "../stay/poserReleve.ts";

/**
 * Le nombre de logements et la médiane d'un relevé, sur ce que sa station
 * montre : une offre tarifée (`annonceMontree`). Un logement compte une fois,
 * par son offre la moins chère : les offres qui partagent un `logement` (le
 * regroupement du relevé) ou un bien (`cleDuLogement` : deux copies d'une même
 * annonce, les deux formules d'un bien, même dans un relevé d'avant ces
 * marques), comme « Par budget » les réunit en une carte (`logementsReleves`).
 */
export function recompter(annonces: readonly AnnonceRetenue[]): { n: number; med: number | null } {
  const parent = new Map<string, string>();
  const racine = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  const totaux: [string, number][] = [];
  for (const a of annonces) {
    if (!(a.total > 0) || !annonceMontree(a)) continue;
    // Sans marque, l'offre est son propre logement (`regrouper` marque une
    // offre seule de son identifiant).
    const noeuds = [`bien\n${cleDuLogement(a)}`, `logement\n${a.logement ?? a.id}`];
    for (const k of noeuds) if (!parent.has(k)) parent.set(k, k);
    parent.set(racine(noeuds[1]!), racine(noeuds[0]!));
    totaux.push([noeuds[0]!, a.total]);
  }
  const parLogement = new Map<string, number>();
  for (const [k, total] of totaux) {
    const r = racine(k);
    const deja = parLogement.get(r);
    if (deja == null || total < deja) parLogement.set(r, total);
  }
  return { n: parLogement.size, med: mediane([...parLogement.values()]) };
}

/**
 * Les résultats tels que « Par station » les montre : chaque relevé réussi
 * dont les annonces sont lues (`annonces`), recompté (`recompter`). Un relevé
 * dont les annonces manquent garde son résultat : on ne sait pas ce qu'il
 * garde.
 */
export function resultatsALaLecture(
  annonces: ReadonlyMap<string, readonly AnnonceRetenue[]>,
  resultats: Readonly<Record<string, Resultat>>,
): Record<string, Resultat> {
  let res: Record<string, Resultat> | null = null;
  for (const [cle, liste] of annonces) {
    const r = resultats[cle];
    if (r?.etat !== "fait") continue;
    const { n, med } = recompter(liste);
    if (n === r.n && med === r.med) continue;
    res ??= { ...resultats };
    res[cle] = { ...r, n, med };
  }
  return res ?? (resultats as Record<string, Resultat>);
}
