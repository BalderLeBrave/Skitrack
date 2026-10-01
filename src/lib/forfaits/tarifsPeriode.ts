/**
 * La grille tarifaire d'un forfait, période par période.
 *
 * Le modèle d'origine (`types.ts`) portait trois nombres par domaine (1 jour
 * adulte, 6 jours adulte, 6 jours enfant), sans date : le même prix pour un
 * séjour de décembre et un séjour de février. Or les stations publient leurs
 * tarifs par période (avant-saison, vacances de Noël, cœur de saison, fin de
 * saison…), avec des libellés et des bornes qui changent d'une station à
 * l'autre.
 *
 * Ce module décrit ce que l'on sait d'un forfait :
 *
 * - une **saison** (« 2026-27 »), découpée en **périodes** datées, chacune avec
 *   son libellé tel que publié ;
 * - dans chaque période, les **tarifs** par durée (1 jour, 6 jours, 7 jours,
 *   saison, partie de journée…) et par catégorie (adulte, enfant, senior,
 *   tranches d'âge telles que publiées) ;
 * - le **périmètre** du forfait : la station seule ou le domaine relié. Méribel
 *   seul et Les 3 Vallées sont deux grilles distinctes, qui coexistent sur la
 *   même station ;
 * - l'**URL source**, la **date du relevé** et un **niveau de confiance**.
 *
 * Rien ici ne calcule un prix : c'est le rôle de la résolution par dates.
 *
 * Chargé tel quel par `node --experimental-strip-types` : aucun alias `@/`.
 */

/**
 * La confiance qu'on peut avoir dans une grille.
 *
 * - `haute` : relevée sur la page officielle, pour la saison qu'elle annonce,
 *   contrôles de plausibilité passés ;
 * - `moyenne` : page officielle sans dates explicites, ou agrégateur qui date
 *   ses tarifs pour la saison en cours ;
 * - `faible` : prix repris d'un ancien relevé sans période (migration), d'une
 *   saison antérieure, ou d'un agrégateur qui ne date rien.
 */
export type Confiance = "haute" | "moyenne" | "faible";

/** D'où vient la grille. */
export type OrigineGrille =
  "officiel" | "catalogue" | "skiinfo" | "skiresort" | "bergfex" | "skipass" | "saisie";

/**
 * Le forfait vendu : celui de la station seule, ou celui du domaine qu'elle
 * relie. Les deux existent souvent (Méribel vend le sien et Les 3 Vallées),
 * et une station peut porter une grille de chaque sorte.
 */
export type Perimetre = {
  type: "station" | "domaine";
  /** Clé stable : deux grilles d'une même saison et d'un même périmètre sont
   *  deux versions de la même chose. */
  cle: string;
  /** « Les 3 Vallées », « Val Thorens – Orelle ». */
  nom: string;
};

/**
 * La durée d'un forfait, telle qu'on sait la lire.
 *
 * - `jours` : un nombre de jours de ski publié (1, 2, 6, 7, 12…) ;
 * - `semaine` : « Forfait semaine », sans nombre de jours. Six ou sept selon
 *   les stations : la source ne le dit pas, le modèle non plus ;
 * - `partielle` : moins d'une journée (demi-journée, 4 heures, « à partir de
 *   12:30 ») ;
 * - `saison` : le forfait saison ;
 * - `autre` : une montée, un aller simple, un produit piéton.
 */
export type Duree =
  | { type: "jours"; jours: number }
  | { type: "semaine" }
  | { type: "partielle"; heures: number | null; des: string | null }
  | { type: "saison" }
  | { type: "autre" };

/** Les catégories, ramenées à une clé commune. Le libellé publié (« Enfant
 *  5-12 ») voyage à côté : la clé sert à comparer, le libellé à afficher. */
export type CategorieTarif =
  "adulte" | "enfant" | "junior" | "etudiant" | "senior" | "famille" | "autre";

/** Le canal du prix. Le prix de référence est le prix public en caisse ; un
 *  prix en ligne ou « à partir de » en est un autre. */
export type Canal = "caisse" | "en-ligne" | "non-precise";

export type Tarif = {
  duree: Duree;
  /** Tel que publié : « 6 Jours », « Forfait semaine », « 4 Heures ». */
  libelleDuree: string;
  categorie: CategorieTarif;
  /** Tel que publié : « Enfant 5-12 », « Adultes ». */
  libelleCategorie: string;
  /** Les bornes d'âge publiées, quand elles sont en années d'âge. */
  ages: { min: number | null; max: number | null } | null;
  prix: number;
  devise: string;
  canal: Canal;
  /**
   * Ce qui restreint le produit, tel que publié : « le week-end ». Un tarif
   * restreint n'est pas le tarif ordinaire de la même durée.
   */
  restriction: string | null;
  /** Une estimation du catalogue, pas un prix : affichable comme telle,
   *  jamais comptée dans un coût. */
  estime?: true;
};

export type Periode = {
  /** Tel que publié : « Vacances de Noël », « 20.12.25 - 03.01.26 ». Une
   *  période migrée sans date s'appelle « Saison entière ». */
  libelle: string;
  /** AAAA-MM-JJ, bornes incluses. */
  debut: string;
  fin: string;
  /** La période couvre toute la saison faute de dates publiées. */
  saisonEntiere: boolean;
  tarifs: Tarif[];
};

export type GrilleTarifaire = {
  id: string;
  /** « 2026-27 », comme `saisonDe` (`grille.ts`). */
  saison: string;
  perimetre: Perimetre;
  /** Les stations du référentiel que ce forfait couvre. */
  stationIds: string[];
  periodes: Periode[];
  source: {
    origine: OrigineGrille;
    url: string | null;
    /** Ce qu'on écrit sous le prix : d'où il vient, en clair. */
    libelle: string;
  };
  /** Date du relevé (AAAA-MM-JJ ou ISO complet), `null` si inconnue. */
  scrapeLe: string | null;
  confiance: Confiance;
  /** Ce qui a été supposé ou repris, dit en toutes lettres. */
  notes: string[];
};

/** Le libellé d'une période sans dates publiées. */
export const LIBELLE_SAISON_ENTIERE = "Saison entière";

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * La saison d'un jour : « 2026-27 ». Elle bascule le 1ᵉʳ août, comme
 * `saisonDe` de `grille.ts` : un relevé de septembre appartient à la saison
 * qui s'ouvre. Même règle, écrite sur une date AAAA-MM-JJ pour ne dépendre
 * d'aucun fuseau.
 */
export function saisonDeJour(iso: string): string | null {
  const m = ISO.exec(iso);
  if (!m) return null;
  const a = Number(m[1]);
  const debut = Number(m[2]) >= 8 ? a : a - 1;
  return `${debut}-${String((debut + 1) % 100).padStart(2, "0")}`;
}

/** Les bornes d'une saison : du 1ᵉʳ août au 31 juillet suivant. */
export function bornesSaison(saison: string): { debut: string; fin: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(saison);
  if (!m) return null;
  const a = Number(m[1]);
  if (String((a + 1) % 100).padStart(2, "0") !== m[2]) return null;
  return { debut: `${a}-08-01`, fin: `${a + 1}-07-31` };
}

/** Une période « saison entière » : les tarifs connus, sans date publiée. */
export function periodeSaisonEntiere(saison: string, tarifs: Tarif[]): Periode | null {
  const b = bornesSaison(saison);
  if (!b) return null;
  return {
    libelle: LIBELLE_SAISON_ENTIERE,
    debut: b.debut,
    fin: b.fin,
    saisonEntiere: true,
    tarifs,
  };
}

/** Les grilles qui couvrent une station, tous périmètres confondus. */
export function grillesDeStation(
  stationId: string,
  grilles: readonly GrilleTarifaire[],
): GrilleTarifaire[] {
  return grilles.filter((g) => g.stationIds.includes(stationId));
}

/**
 * Ce qui ne va pas dans une grille, avant de l'écrire.
 *
 * Contrôle de forme seulement : saison lisible, périodes ordonnées et
 * contenues dans la saison, prix positifs, au moins un tarif. La plausibilité
 * des montants relève du relevé.
 */
export function anomaliesGrille(g: GrilleTarifaire): string[] {
  const out: string[] = [];
  const b = bornesSaison(g.saison);
  if (!b) out.push(`saison illisible : ${g.saison}`);
  if (!g.periodes.length) out.push("aucune période");
  for (const p of g.periodes) {
    const nom = `période « ${p.libelle} »`;
    if (!ISO.test(p.debut) || !ISO.test(p.fin)) out.push(`${nom} : date illisible`);
    else if (p.debut > p.fin) out.push(`${nom} : début après la fin`);
    else if (b && (p.debut < b.debut || p.fin > b.fin))
      out.push(`${nom} : hors de la saison ${g.saison}`);
    if (!p.tarifs.length) out.push(`${nom} : aucun tarif`);
    for (const t of p.tarifs) {
      if (!(Number.isFinite(t.prix) && t.prix > 0))
        out.push(`${nom} : prix non positif (${t.libelleDuree}, ${t.libelleCategorie})`);
      if (!t.devise) out.push(`${nom} : devise absente (${t.libelleDuree}, ${t.libelleCategorie})`);
    }
  }
  return out;
}

/** Le fichier des grilles migrées. */
export type FichierGrilles = {
  genere: string;
  regle: string;
  grilles: GrilleTarifaire[];
};
