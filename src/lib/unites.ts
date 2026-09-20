/**
 * Convertir et écrire une mesure. Frère de `devises.ts`, et pour la même
 * raison : le dépôt n'avait qu'une unité, et il ne le disait nulle part — il
 * l'écrivait, `« m »` et `« km »` collés au nombre à onze endroits.
 *
 * ## Ce qui se convertit, et ce qui ne se convertit pas
 *
 * Une longueur devient une longueur : mètres, kilomètres, pieds, milles. Une
 * surface devient une surface : hectares, acres, kilomètres carrés. **Une
 * longueur ne devient jamais une surface**, et `convertir()` rend `null`
 * plutôt que d'inventer un facteur.
 *
 * Ce refus n'est pas théorique, il vient du relevé : Skiinfo publie le domaine
 * de Zermatt en **358,3 km de pistes** et celui de Vail en **2 152 hectares**
 * de terrain skiable. Les deux s'appellent « domaine skiable » et ne mesurent
 * pas la même chose. Un convertisseur complaisant afficherait « 2 152 ha =
 * 21,5 km », ce qui ne veut rien dire.
 *
 * C'est la même règle que `memeDevise` : on ne mélange pas deux unités de
 * compte au motif qu'elles s'écrivent avec des chiffres.
 *
 * ## Ce que le dépôt affiche par défaut
 *
 * Le métrique, **y compris aux États-Unis**. C'est un choix, l'audit du 18
 * septembre le pose en toutes lettres, et ce module ne le change pas : il rend
 * seulement possible d'en changer, écran par écran, sans réécrire onze
 * formateurs.
 */

import { decimal, entier } from "./nombres.ts";

export type Dimension = "longueur" | "surface";

export type Unite = "m" | "km" | "ft" | "mi" | "ha" | "acre" | "km2";

/** Une mesure ne voyage jamais sans son unité : les deux sont une seule valeur,
 *  comme un total et sa devise. */
export type Mesure = { valeur: number; unite: Unite };

type Def = { dimension: Dimension; enBase: number; symbole: string; decimales: number };

/**
 * Chaque unité, sa dimension, et ce qu'elle vaut dans l'unité de base de cette
 * dimension — le mètre pour les longueurs, le mètre carré pour les surfaces.
 *
 * Les facteurs sont les définitions exactes, pas des approximations : le mille
 * international vaut 1 609,344 m depuis 1959, et l'acre 4 046,856 422 4 m².
 */
const UNITES: Record<Unite, Def> = {
  m: { dimension: "longueur", enBase: 1, symbole: "m", decimales: 0 },
  km: { dimension: "longueur", enBase: 1_000, symbole: "km", decimales: 1 },
  ft: { dimension: "longueur", enBase: 0.3048, symbole: "ft", decimales: 0 },
  mi: { dimension: "longueur", enBase: 1_609.344, symbole: "mi", decimales: 1 },
  ha: { dimension: "surface", enBase: 10_000, symbole: "ha", decimales: 0 },
  acre: { dimension: "surface", enBase: 4_046.8564224, symbole: "acres", decimales: 0 },
  km2: { dimension: "surface", enBase: 1_000_000, symbole: "km²", decimales: 1 },
};

export function dimensionDe(u: Unite): Dimension {
  return UNITES[u].dimension;
}

/** Deux mesures parlent-elles de la même grandeur ? La question se pose avant
 *  toute conversion, toute comparaison et toute somme. */
export function memeDimension(a: Unite | null | undefined, b: Unite | null | undefined): boolean {
  if (!a || !b) return false;
  return UNITES[a]?.dimension === UNITES[b]?.dimension;
}

/**
 * Convertit une mesure, ou rend `null` si les dimensions diffèrent.
 *
 * Le `null` est la réponse juste, pas un échec : demander des kilomètres à
 * partir d'hectares est une question qui n'a pas de réponse.
 */
export function convertir(m: Mesure, vers: Unite): Mesure | null {
  if (!memeDimension(m.unite, vers)) return null;
  const base = m.valeur * UNITES[m.unite].enBase;
  return { valeur: base / UNITES[vers].enBase, unite: vers };
}

/** La valeur seule, dans l'unité demandée. `null` si la question n'a pas de sens. */
export function en(m: Mesure, vers: Unite): number | null {
  return convertir(m, vers)?.valeur ?? null;
}

/**
 * Les deux systèmes, et l'unité que chacun emploie pour une dimension donnée.
 *
 * L'altitude reste à part : elle se dit en mètres ou en pieds, jamais en
 * kilomètres ni en milles, quel que soit le système.
 */
export type Systeme = "metrique" | "imperial";

const PAR_SYSTEME: Record<Systeme, { longueur: Unite; surface: Unite; altitude: Unite }> = {
  metrique: { longueur: "km", surface: "ha", altitude: "m" },
  imperial: { longueur: "mi", surface: "acre", altitude: "ft" },
};

/** L'unité d'un système pour une dimension — « altitude » étant traitée comme
 *  le cas particulier qu'elle est. */
export function uniteDe(systeme: Systeme, quoi: "longueur" | "surface" | "altitude"): Unite {
  return PAR_SYSTEME[systeme][quoi];
}

/** Bascule une mesure dans le système demandé, en gardant sa dimension. */
export function dansLeSysteme(m: Mesure, systeme: Systeme): Mesure {
  const cible = uniteDe(systeme, dimensionDe(m.unite) === "surface" ? "surface" : "longueur");
  return convertir(m, cible) ?? m;
}

/**
 * Écrit une mesure : « 358,3 km », « 2 152 acres », « 1 620 m ».
 *
 * Le nombre de décimales suit l'unité — on n'écrit pas une altitude au
 * centimètre ni une distance de piste au mètre — et le nombre lui-même passe
 * par `nombres.ts`, comme les sommes d'argent.
 */
export function mesure(m: Mesure | null | undefined, decimales?: number): string {
  if (!m || !Number.isFinite(m.valeur)) return "–";
  const d = UNITES[m.unite];
  const n = (decimales ?? d.decimales) === 0 ? entier(m.valeur) : decimal(m.valeur, decimales ?? d.decimales);
  return `${n} ${d.symbole}`;
}

/** Comme `mesure`, mais rend `null` plutôt que « – » : l'écran écrit alors
 *  l'absence en toutes lettres, ce que les écrans v7 préfèrent. */
export function mesureN(m: Mesure | null | undefined, decimales?: number): string | null {
  return m && Number.isFinite(m.valeur) ? mesure(m, decimales) : null;
}

/** Écrit une mesure après l'avoir basculée dans le système demandé. */
export function mesureDans(m: Mesure | null | undefined, systeme: Systeme): string {
  return m ? mesure(dansLeSysteme(m, systeme)) : "–";
}

/** Une altitude, dans le système demandé. Mètres ou pieds, jamais autre chose. */
export function altitude(m: number | null | undefined, systeme: Systeme = "metrique"): string {
  if (m == null) return "–";
  return mesure(convertir({ valeur: m, unite: "m" }, uniteDe(systeme, "altitude")));
}
