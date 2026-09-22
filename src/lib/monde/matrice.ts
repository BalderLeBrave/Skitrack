/**
 * Les six tarifs qu'on demande à un domaine : journée, six jours et saison,
 * adulte et enfant.
 *
 * L'écran n'en montrait qu'un — la journée adulte —, alors que les grilles
 * déjà moissonnées en portent bien davantage : Skiinfo publie quatre classes
 * d'âge et un bloc saison, bergfex une ligne par durée jusqu'à douze jours.
 * Ce module lit ces grilles et en tire la matrice, **sans jamais calculer un
 * prix** : une case vide reste vide, elle n'est pas déduite d'une autre.
 *
 * ## Ce qu'une case porte
 *
 * Le montant, et de quoi le juger : le libellé de la ligne et le nom de la
 * colonne **tels que la source les écrit**, sa provenance, et la plage de
 * dates quand la source date ses tarifs. C'est ce qui permet de voir qu'un
 * « 6 jours » vient d'une ligne « Forfait semaine » chez l'un et « 6 Jours »
 * chez l'autre — deux produits voisins, pas identiques, et le lecteur le
 * sait parce que c'est écrit.
 *
 * ## Deux règles qui évitent de mentir
 *
 * **Zéro n'est pas un prix.** Skiinfo remplit de `0` les cases qu'il ne
 * publie pas ; les prendre pour des tarifs donnerait des forfaits gratuits.
 * Tout montant nul ou négatif est lu comme une absence.
 *
 * **Enfant n'est pas junior.** Les grilles distinguent Enfant, Junior,
 * Sénior ; seule la colonne enfant est lue comme telle. Un junior à 14 ans
 * n'est pas l'enfant à 6 ans, et les confondre ferait varier le prix
 * annoncé au gré de la source.
 */

export type Poste = "jourAdulte" | "jourEnfant" | "sixJoursAdulte" | "sixJoursEnfant" | "saisonAdulte" | "saisonEnfant";

export type SourceTarif = "bergfex" | "skiinfo" | "skiresort" | "officiel" | "proprietaire";

export type CaseTarif = {
  prix: number;
  /** Le libellé de la ligne, tel que la source l'écrit. */
  libelle: string;
  /** Le nom de la colonne, tel que la source l'écrit. */
  categorie: string;
  source: SourceTarif;
  /** La plage de dates, quand la source date ses tarifs (bergfex). */
  dates?: string;
};

export type MatriceForfait = Record<Poste, CaseTarif | null>;

export const POSTES: Poste[] = [
  "jourAdulte",
  "jourEnfant",
  "sixJoursAdulte",
  "sixJoursEnfant",
  "saisonAdulte",
  "saisonEnfant",
];

/** Une grille de tarifs, ramenée à ce que la matrice a besoin de lire. */
export type Grille = {
  source: SourceTarif;
  /** La devise de la grille ; une grille d'une autre devise n'est pas lue. */
  devise: string | null;
  categories: string[];
  lignes: { libelle: string; prix: (number | null)[] }[];
  /** Le bloc saison de Skiinfo : ses propres colonnes, une seule ligne. */
  saison?: { categories: string[]; prix: (number | null)[] } | null;
  /** La plage de dates de cette grille, quand elle en a une. */
  dates?: string | null;
  /**
   * Des montants déjà nommés, sans grille — le tableau rempli à la main, qui
   * porte une colonne par poste.
   */
  nommes?: Partial<Record<Poste, { prix: number; libelle: string }>>;
};

const plier = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Le montant publié, ou `null` : zéro veut dire « non publié », pas gratuit. */
function montant(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

const ADULTE = /^(adulte|adultes|adult|adults|erwachsene[rn]?|dospel|dorosly|vuxen|aikuinen|voksen|odrasli)$/;
// `enfant` seulement : ni junior, ni jeune, ni étudiant — ce ne sont pas les
// mêmes âges, et la source les publie séparément pour cette raison.
const ENFANT = /^(enfant|enfants|child|children|kind|kinder|deti|dzieci|barn|lapsi|djeca|otroci)$/;

/** L'indice de la colonne demandée, ou `-1`. */
export function colonne(categories: readonly string[], qui: "adulte" | "enfant"): number {
  const motif = qui === "adulte" ? ADULTE : ENFANT;
  return categories.findIndex((c) => motif.test(plier(String(c ?? "")).replace(/\s*\(.*\)$/, "")));
}

// Les libellés d'une journée entière. Une demi-journée, une soirée ou un
// tarif « à partir de 12:30 » n'en sont pas, ni le tarif du week-end, qui est
// un autre produit.
const JOUR = [
  /^forfait journee$/,
  /^forfait journalier/,   // skiresort : « Forfait journalier Haute saison »
  /^1 jours?$/,
  /^1 tag$/,
  /^day (ticket|pass)$/,
  /^tageskarte$/,
];
const HEURE = /\d{1,2}\s*[:h]\s*\d{2}|demi|1\/2|heures?|hours?|soir|nuit|week-?end|apres-?midi|matin/;
// Six jours chez bergfex, « semaine » chez Skiinfo : deux produits voisins,
// jamais confondus en silence — le libellé publié voyage avec le montant.
const SIX_JOURS = [/^6 jours?$/, /^forfait semaine$/, /^6 tage$/, /^(6|six)[- ]day/, /^wochenkarte$/];
const SAISON = [/^passeport saisonnier$/, /^saison(karte)?$/, /^forfait saison$/, /^season (pass|ticket)$/, /saisonkarte/];

function trouverLigne(grille: Grille, motifs: RegExp[]): { libelle: string; prix: (number | null)[] } | null {
  for (const m of motifs) {
    const l = grille.lignes.find((x) => {
      const p = plier(x.libelle);
      return m.test(p) && !HEURE.test(p);
    });
    if (l) return l;
  }
  return null;
}

function depuisLigne(
  grille: Grille,
  motifs: RegExp[],
  qui: "adulte" | "enfant",
): CaseTarif | null {
  const i = colonne(grille.categories, qui);
  if (i < 0) return null;
  const ligne = trouverLigne(grille, motifs);
  const prix = montant(ligne?.prix[i]);
  if (!ligne || prix === null) return null;
  return {
    prix,
    libelle: ligne.libelle,
    categorie: String(grille.categories[i]),
    source: grille.source,
    ...(grille.dates ? { dates: grille.dates } : {}),
  };
}

function depuisSaison(grille: Grille, qui: "adulte" | "enfant"): CaseTarif | null {
  const s = grille.saison;
  if (!s) return null;
  const i = colonne(s.categories, qui);
  const prix = montant(s.prix[i]);
  if (i < 0 || prix === null) return null;
  return {
    prix,
    libelle: "Forfait saison",
    categorie: String(s.categories[i]),
    source: grille.source,
    ...(grille.dates ? { dates: grille.dates } : {}),
  };
}

/** Ce qu'une grille publie pour un poste donné. */
export function caseDe(grille: Grille, poste: Poste): CaseTarif | null {
  const nomme = grille.nommes?.[poste];
  if (nomme && montant(nomme.prix) !== null) {
    return { prix: nomme.prix, libelle: nomme.libelle, categorie: poste.endsWith("Enfant") ? "Enfant" : "Adulte", source: grille.source };
  }
  const qui = poste.endsWith("Enfant") ? "enfant" : "adulte";
  if (poste.startsWith("jour")) return depuisLigne(grille, JOUR, qui);
  if (poste.startsWith("sixJours")) return depuisLigne(grille, SIX_JOURS, qui);
  return depuisSaison(grille, qui) ?? depuisLigne(grille, SAISON, qui);
}

/**
 * La matrice d'un domaine : pour chaque poste, la première grille qui le
 * publie, dans l'ordre donné.
 *
 * Les grilles d'une autre devise sont écartées : mettre côte à côte des
 * couronnes et des euros dans un même tableau ferait lire un prix pour un
 * autre. Une grille sans devise connue n'est pas lue non plus.
 */
export function matriceDe(grilles: readonly Grille[], devise: string | null): MatriceForfait {
  const lisibles = grilles.filter((g) => g.devise !== null && g.devise === devise);
  const out = {} as MatriceForfait;
  for (const poste of POSTES) {
    out[poste] = null;
    for (const g of lisibles) {
      const c = caseDe(g, poste);
      if (c) {
        out[poste] = c;
        break;
      }
    }
  }
  return out;
}

/** Combien de cases sur six sont remplies. */
export function remplies(m: MatriceForfait | null | undefined): number {
  return m ? POSTES.filter((p) => m[p]).length : 0;
}

/** La matrice est-elle vide ? Une matrice vide ne vaut pas la peine d'être écrite. */
export function vide(m: MatriceForfait): boolean {
  return remplies(m) === 0;
}
