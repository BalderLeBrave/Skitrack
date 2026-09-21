/**
 * Les prédicats de recherche des domaines mondiaux.
 *
 * Frère de `lib/filtres.ts`, qui fait le même travail sur les 320 stations
 * françaises. Les deux ne fusionnent pas, et ce n'est pas un oubli : un
 * `Station` porte un village, un massif, un forfait et une photo, un
 * `DomaineMonde` porte un pays, une région et des tronçons. Les champs
 * filtrables ne sont pas les mêmes, et un prédicat commun devrait tous les
 * rendre facultatifs — c'est-à-dire ne plus rien garantir.
 *
 * **Ce qui est commun l'est vraiment** : `atLeast` et `foldName` viennent de
 * `carte.ts`, comme pour la France. La règle du seuil sur une valeur mesurée
 * est donc la même règle, pas une seconde écriture.
 */

import { atLeast, foldName } from "../carte.ts";
import type { Repartition } from "./couleurs.ts";
import type { DomaineMonde } from "./monde.ts";

export type FiltresMonde = {
  /** Km de pistes de descente, au minimum. */
  km: number;
  /** Sommet, au minimum, en mètres. */
  sommetM: number;
  /** Dénivelé du domaine, au minimum, en mètres. */
  denivM: number;
  /** Remontées, au minimum. */
  remontees: number;
  /**
   * N'afficher que les domaines dont la répartition par couleur est connue.
   *
   * Le contraire de combler : le filtre rend l'absence visible et manipulable
   * au lieu de la masquer derrière une valeur inventée.
   */
  avecCouleurs: boolean;
  /** Part du noir, au minimum, en pourcentage de la répartition. */
  noirPct: number;
};

export const AUCUN_FILTRE: FiltresMonde = {
  km: 0,
  sommetM: 0,
  denivM: 0,
  remontees: 0,
  avecCouleurs: false,
  noirPct: 0,
};

/** Les curseurs et leurs bornes. Seule table de ces bornes. */
export const SEUILS_MONDE: {
  k: "km" | "sommetM" | "denivM" | "remontees" | "noirPct";
  label: string;
  court: string;
  max: number;
  step: number;
  unite: string;
}[] = [
  { k: "km", label: "Km de pistes", court: "km", max: 300, step: 10, unite: "km" },
  { k: "sommetM", label: "Sommet", court: "sommet", max: 4000, step: 100, unite: "m" },
  { k: "denivM", label: "Dénivelé", court: "dénivelé", max: 2000, step: 100, unite: "m" },
  { k: "remontees", label: "Remontées", court: "remontées", max: 60, step: 5, unite: "" },
  { k: "noirPct", label: "Part du noir", court: "noir", max: 50, step: 5, unite: "%" },
];

/**
 * Le dénivelé du domaine, ou `null`.
 *
 * Il se calcule, il ne se relève pas — et il ne se calcule que si les **deux**
 * altitudes sont mesurées. Prendre `(maxM ?? 0) - (minM ?? 0)` rendrait un
 * dénivelé de 2 400 m pour un domaine dont seul le sommet est connu.
 */
export function denivele(d: DomaineMonde): number | null {
  if (d.minM == null || d.maxM == null) return null;
  return d.maxM - d.minM;
}

/**
 * Le domaine passe-t-il les filtres ?
 *
 * `repartitions` est la table rendue par `repartitionsDesDomaines()` : une clé
 * absente y vaut « couleurs non connues », et les deux critères de couleur
 * écartent alors le domaine plutôt que de le compter à zéro.
 */
export function passeFiltres(
  d: DomaineMonde,
  f: FiltresMonde,
  repartitions?: ReadonlyMap<string, Repartition>,
): boolean {
  if (!atLeast(d.km, f.km)) return false;
  if (!atLeast(d.maxM, f.sommetM)) return false;
  if (!atLeast(denivele(d), f.denivM)) return false;
  if (!atLeast(d.lifts, f.remontees)) return false;
  const r = repartitions?.get(d.id);
  if (f.avecCouleurs && !r) return false;
  if (f.noirPct && !atLeast(r?.pct.noir, f.noirPct)) return false;
  return true;
}

/** Combien de critères sont actifs. Sert le compteur du bouton « Filtres ». */
export function filtresActifs(f: FiltresMonde): number {
  let n = 0;
  for (const s of SEUILS_MONDE) if (f[s.k]) n++;
  if (f.avecCouleurs) n++;
  return n;
}

/**
 * La recherche par nom.
 *
 * Elle porte aussi sur la région et la localité : « Tyrol » ou « Hokkaido »
 * sont ce qu'on tape quand on ne connaît pas le nom du domaine. La comparaison
 * est celle de `foldName`, donc sans accents ni casse, pour que « quebec »
 * trouve Québec.
 */
export function chercher(domaines: readonly DomaineMonde[], q: string): DomaineMonde[] {
  const t = foldName(q);
  if (!t) return [...domaines];
  return domaines.filter((d) =>
    [d.nom, d.region, d.localite].some((v) => v && foldName(v).includes(t)),
  );
}

export type TriMonde = "nom" | "km" | "sommet" | "deniv" | "remontees";

export const TRIS_MONDE: [TriMonde, string][] = [
  ["km", "km de pistes"],
  ["sommet", "sommet"],
  ["deniv", "dénivelé"],
  ["remontees", "remontées"],
  ["nom", "nom"],
];

/**
 * Le tri, mesuré d'abord.
 *
 * Un domaine dont le champ trié n'est pas relevé passe **après** tous ceux qui
 * le portent, quel que soit le sens du tri. Le traiter comme un zéro le
 * placerait en fin de liste croissante et en tête de liste décroissante, ce
 * qui laisserait croire à une mesure nulle ; le pousser au bout dans les deux
 * cas dit qu'il n'y a rien à comparer.
 */
export function trier(domaines: readonly DomaineMonde[], tri: TriMonde): DomaineMonde[] {
  const out = [...domaines];
  if (tri === "nom") {
    return out.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }
  const valeur = (d: DomaineMonde): number | null =>
    tri === "km" ? d.km : tri === "sommet" ? d.maxM : tri === "deniv" ? denivele(d) : d.lifts;
  return out.sort((a, b) => {
    const va = valeur(a);
    const vb = valeur(b);
    if (va == null && vb == null) return a.nom.localeCompare(b.nom, "fr");
    if (va == null) return 1;
    if (vb == null) return -1;
    return vb - va || a.nom.localeCompare(b.nom, "fr");
  });
}
