/**
 * La répartition des pistes par couleur, et **d'où elle vient**.
 *
 * Trois sources la décrivent, et elles ne disent pas la même chose avec la
 * même précision. L'ordre ci-dessous n'est pas une préférence de goût : il va
 * du mesuré au dérivé, et chaque cran perd quelque chose qu'il faut pouvoir
 * lire à l'arrivée.
 *
 * | Rang | Source | Ce qu'elle donne |
 * | --- | --- | --- |
 * | 1 | OpenSkiMap | quatre couleurs, comptées sur les tronçons cartographiés |
 * | 2 | Skiinfo | quatre couleurs, en pourcentages publiés par la station |
 * | 3 | skiresort.fr | **trois niveaux** — « Faciles » fond le vert et le bleu |
 *
 * ## Le troisième cran, et ce qu'il coûte
 *
 * skiresort classe en Faciles, Moyennes, Difficiles. Pour en tirer quatre
 * couleurs il faut partager « Faciles » entre vert et bleu, ce que cette
 * source ne permet pas de savoir.
 *
 * Le partage se fait donc à la **part du vert mesurée dans le pays** —
 * `partVerte.json`, calculée sur les domaines dont OpenSkiMap a relevé les
 * quatre couleurs. Ce n'est pas un partage arbitraire : les écarts suivent des
 * conventions nationales tranchées, l'Autriche à 5 % et la Norvège à 57 %, et
 * un partage uniforme à cinquante-cinquante serait faux presque partout.
 *
 * **Cela reste une estimation**, et c'est pourquoi `partage` vaut alors
 * `"estime"`. Une valeur estimée qui ne se dit pas estimée est pire qu'une
 * absence : l'absence se voit.
 */

import partVerte from "./data/partVerte.json" with { type: "json" };

export type QuatreCouleurs = { vert: number; bleu: number; rouge: number; noir: number };

export type SourceCouleurs = "openskimap" | "skiinfo" | "skiresort";

export type Repartition = {
  /** En pourcentage du total, arrondi à l'entier. */
  pct: QuatreCouleurs;
  source: SourceCouleurs;
  /**
   * `mesure` : les quatre couleurs viennent de la source telle quelle.
   * `estime` : le vert et le bleu ont été séparés d'un seul nombre, à la part
   * du pays. Le reste — rouge, noir — reste mesuré dans les deux cas.
   */
  partage: "mesure" | "estime";
  /** La part employée, et sur combien de domaines elle a été mesurée. Nulles
   *  quand `partage` vaut `mesure`, puisque rien n'a été partagé. */
  partVerte: number | null;
  partVerteDomaines: number | null;
};

const PAYS = partVerte.pays as Record<string, { part: number; domaines: number }>;

/**
 * La part du vert à retenir pour un pays.
 *
 * Un pays dont trop peu de domaines sont mesurés n'a pas de part à lui : on
 * prend alors la part mondiale, et l'effectif qui l'accompagne dit d'où elle
 * sort. Remonter au continent serait plus fin ; ce serait aussi prétendre que
 * l'Europe a une convention, alors que l'Autriche est à 5 % et la Norvège à
 * 57 %.
 */
export function partVerteDuPays(cc: string | null | undefined): { part: number; domaines: number } {
  const p = cc ? PAYS[cc.toUpperCase()] : undefined;
  return p ?? partVerte.monde;
}

function enPourcents(c: QuatreCouleurs): QuatreCouleurs {
  const t = c.vert + c.bleu + c.rouge + c.noir;
  if (t <= 0) return { vert: 0, bleu: 0, rouge: 0, noir: 0 };
  return {
    vert: Math.round((c.vert / t) * 100),
    bleu: Math.round((c.bleu / t) * 100),
    rouge: Math.round((c.rouge / t) * 100),
    noir: Math.round((c.noir / t) * 100),
  };
}

/** Rang 1 — les tronçons comptés par OpenSkiMap. */
export function depuisOpenSkiMap(
  counts: { green: number; blue: number; red: number; black: number } | null | undefined,
): Repartition | null {
  if (!counts) return null;
  const c = { vert: counts.green, bleu: counts.blue, rouge: counts.red, noir: counts.black };
  if (c.vert + c.bleu + c.rouge + c.noir < 1) return null;
  return { pct: enPourcents(c), source: "openskimap", partage: "mesure", partVerte: null, partVerteDomaines: null };
}

/** Rang 2 — les pourcentages publiés par Skiinfo, déjà en quatre couleurs. */
export function depuisSkiinfo(
  pct: { vertes: number; bleues: number; rouges: number; noires: number } | null | undefined,
): Repartition | null {
  if (!pct) return null;
  const c = { vert: pct.vertes, bleu: pct.bleues, rouge: pct.rouges, noir: pct.noires };
  if (c.vert + c.bleu + c.rouge + c.noir < 1) return null;
  return { pct: enPourcents(c), source: "skiinfo", partage: "mesure", partVerte: null, partVerteDomaines: null };
}

/**
 * Rang 3 — les trois niveaux de skiresort, le vert et le bleu séparés à la
 * part du pays.
 *
 * Les kilomètres servent de poids : ce sont eux que la source publie. Le
 * résultat est un pourcentage de kilomètres, là où les rangs 1 et 2 comptent
 * des pistes — deux échelles voisines qui ne se confondent pas, et c'est une
 * raison de plus pour que `source` voyage avec la valeur.
 */
export function depuisSkiresort(
  km: { faciles: number | null; moyennes: number | null; difficiles: number | null } | null | undefined,
  pays: string | null | undefined,
): Repartition | null {
  if (!km) return null;
  const f = km.faciles ?? 0;
  const m = km.moyennes ?? 0;
  const d = km.difficiles ?? 0;
  if (f + m + d <= 0) return null;
  const { part, domaines } = partVerteDuPays(pays);
  return {
    pct: enPourcents({ vert: f * part, bleu: f * (1 - part), rouge: m, noir: d }),
    source: "skiresort",
    partage: "estime",
    partVerte: part,
    partVerteDomaines: domaines,
  };
}

/**
 * La meilleure répartition disponible, et ce qu'elle vaut.
 *
 * `null` quand aucune source ne dit rien : l'écran affiche alors l'absence,
 * il ne la comble pas.
 */
export function repartition(entrees: {
  openskimap?: { green: number; blue: number; red: number; black: number } | null;
  skiinfo?: { vertes: number; bleues: number; rouges: number; noires: number } | null;
  skiresort?: { faciles: number | null; moyennes: number | null; difficiles: number | null } | null;
  pays?: string | null;
}): Repartition | null {
  return (
    depuisOpenSkiMap(entrees.openskimap) ??
    depuisSkiinfo(entrees.skiinfo) ??
    depuisSkiresort(entrees.skiresort, entrees.pays) ??
    null
  );
}

/** Ce qu'on écrit à l'écran à côté d'une répartition, pour que sa valeur se
 *  lise sans aller ouvrir le code. */
export function mentionSource(r: Repartition | null): string | null {
  if (!r) return null;
  if (r.source === "openskimap") return "relevé OpenSkiMap";
  if (r.source === "skiinfo") return "publié par la station (Skiinfo)";
  const pct = Math.round((r.partVerte ?? 0) * 100);
  return `skiresort.fr — vert et bleu séparés à ${pct} %, part mesurée sur ${r.partVerteDomaines} domaines du pays`;
}
