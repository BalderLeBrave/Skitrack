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
 * **Ce qui est commun l'est vraiment** : `foldName` vient de `carte.ts`,
 * `dansPlage` de `plage.ts`, comme pour la France. La règle de la fourchette
 * sur une valeur mesurée est donc la même règle, pas une seconde écriture, et
 * le tri va dans les deux sens avec `parMesure`, comme ailleurs.
 */

import { foldName } from "../carte.ts";
import { aTraduire } from "../i18n/tr.ts";
import { dansPlage, type Echelle, type Plage } from "../plage.ts";
import { parMesure, parTexte, type Sens } from "../tri.ts";
import type { Repartition } from "./couleurs.ts";
import type { DomaineMonde } from "./monde.ts";

export type FiltresMonde = {
  /** Km de pistes de descente. */
  km: Plage;
  /** Sommet, en mètres. */
  sommetM: Plage;
  /** Dénivelé du domaine, en mètres. */
  denivM: Plage;
  /** Remontées. */
  remontees: Plage;
  /**
   * N'afficher que les domaines dont la répartition par couleur est connue.
   *
   * Le contraire de combler : le filtre rend l'absence visible et manipulable
   * au lieu de la masquer derrière une valeur inventée.
   */
  avecCouleurs: boolean;
  /** Part du noir, en pourcentage de la répartition. */
  noirPct: Plage;
};

export const AUCUN_FILTRE: FiltresMonde = {
  km: null,
  sommetM: null,
  denivM: null,
  remontees: null,
  avecCouleurs: false,
  noirPct: null,
};

export type CleMonde = "km" | "sommetM" | "denivM" | "remontees" | "noirPct";

/** Les fourchettes et leurs échelles. Seule table de ces échelles. La borne
 *  haute au bout de l'échelle veut dire « et plus ». */
export const SEUILS_MONDE: {
  k: CleMonde;
  label: string;
  court: string;
  b: Echelle;
  pas: number;
  unite: string;
}[] = [
  { k: "km", label: aTraduire("Kilomètres de pistes"), court: "km", b: [0, 300], pas: 10, unite: "km" },
  { k: "sommetM", label: aTraduire("Sommet"), court: aTraduire("sommet"), b: [0, 4000], pas: 100, unite: "m" },
  { k: "denivM", label: aTraduire("Dénivelé"), court: aTraduire("dénivelé"), b: [0, 2000], pas: 100, unite: "m" },
  { k: "remontees", label: aTraduire("Remontées"), court: aTraduire("remontées"), b: [0, 60], pas: 5, unite: "" },
  { k: "noirPct", label: aTraduire("Part de pistes noires"), court: aTraduire("noir"), b: [0, 50], pas: 5, unite: "%" },
];

const ECHELLE_MONDE = Object.fromEntries(SEUILS_MONDE.map((s) => [s.k, s.b])) as Record<CleMonde, Echelle>;

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
  if (!dansPlage(d.km, f.km, ECHELLE_MONDE.km)) return false;
  if (!dansPlage(d.maxM, f.sommetM, ECHELLE_MONDE.sommetM)) return false;
  if (!dansPlage(denivele(d), f.denivM, ECHELLE_MONDE.denivM)) return false;
  if (!dansPlage(d.lifts, f.remontees, ECHELLE_MONDE.remontees)) return false;
  const r = repartitions?.get(d.id);
  if (f.avecCouleurs && !r) return false;
  if (!dansPlage(r?.pct.noir, f.noirPct, ECHELLE_MONDE.noirPct)) return false;
  return true;
}

/** Combien de critères sont actifs. Sert le compteur du bouton « Filtres ». */
export function filtresActifs(f: FiltresMonde): number {
  let n = 0;
  for (const s of SEUILS_MONDE) if (f[s.k] != null) n++;
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
  ["km", aTraduire("km de pistes")],
  ["sommet", aTraduire("sommet")],
  ["deniv", aTraduire("dénivelé")],
  ["remontees", aTraduire("remontées")],
  ["nom", aTraduire("nom")],
];

/** Le sens de départ : le plus grand d'abord, le nom de A à Z. */
export const SENS_MONDE: Record<TriMonde, Sens> = {
  km: -1,
  sommet: -1,
  deniv: -1,
  remontees: -1,
  nom: 1,
};

/**
 * Le tri, mesuré d'abord, dans le sens demandé (par défaut, celui du critère).
 *
 * Un domaine dont le champ trié n'est pas relevé passe **après** tous ceux qui
 * le portent, quel que soit le sens du tri. Le traiter comme un zéro le
 * placerait en fin de liste croissante et en tête de liste décroissante, ce
 * qui laisserait croire à une mesure nulle ; le pousser au bout dans les deux
 * cas dit qu'il n'y a rien à comparer. À égalité, le nom de A à Z.
 */
export function trier(
  domaines: readonly DomaineMonde[],
  tri: TriMonde,
  sens: Sens = SENS_MONDE[tri],
): DomaineMonde[] {
  const out = [...domaines];
  if (tri === "nom") {
    return out.sort((a, b) => parTexte(a.nom, b.nom, sens));
  }
  const valeur = (d: DomaineMonde): number | null =>
    tri === "km" ? d.km : tri === "sommet" ? d.maxM : tri === "deniv" ? denivele(d) : d.lifts;
  return out.sort(
    (a, b) => parMesure(valeur(a), valeur(b), sens) || a.nom.localeCompare(b.nom, "fr"),
  );
}
