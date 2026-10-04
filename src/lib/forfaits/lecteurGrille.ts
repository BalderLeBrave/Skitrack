/**
 * La lecture d'une grille de tarifs dans des lignes de texte structuré
 * (`texteStructure.ts`), quelle que soit la page d'où elles viennent.
 *
 * Ce que le lecteur suit en avançant dans les lignes :
 *
 * - la **période** en cours : un titre ou une ligne de dates (« Hiver
 *   2026-2027 » puis « Du 12 décembre 2026 au 23 avril 2027 »), une
 *   définition (« Haute saison : du 19/12/26 au 02/01/27… ») rappelée plus bas
 *   par une ligne « HAUTE SAISON », ou une colonne de tableau datée ;
 * - le **périmètre** en cours : un titre qui nomme le domaine relié ou la
 *   station seule, d'après les repères donnés par la configuration ;
 * - les **colonnes** du tableau en cours : catégories (« Adulte 19-64 ans »),
 *   périodes, canal (« Public », « No Souci », « Internet ») ;
 * - la **section** : ce qui n'est pas un forfait de ski (piéton, assurance,
 *   luge) est écarté ; ce qui est un forfait sous condition (tribu, samedi,
 *   prévente) est gardé, avec sa restriction.
 *
 * Une ligne de tableau dont la première cellule est une durée (« 6 jours »,
 * « Journée », « 4 heures ») donne un tarif par colonne chiffrée. Une ligne de
 * texte qui enchaîne une durée et des prix (« 1 jour 75,70 € 62,00 € » dans un
 * PDF) aussi, rangée dans les catégories de la dernière ligne d'en-tête.
 *
 * Rien n'est deviné : une cellule qui porte plusieurs prix sans dire lequel
 * est lequel est signalée et laissée ; une colonne sans catégorie aussi.
 *
 * Chargé tel quel par `node --experimental-strip-types` : aucun alias `@/`.
 */

import { agesDepuisTexte, dureeDepuisLibelle } from "./migration.ts";
import { periodeDepuisTexte, plier, saisonsCitees, type Plage } from "./periodesFr.ts";
import type { Canal, CategorieTarif, Duree, Tarif } from "./tarifsPeriode.ts";

export type PeriodeTexte = { libelle: string; plages: Plage[] };

export type TarifLu = {
  /** La clé du périmètre reconnu, `null` pour celui par défaut. */
  perimetre: string | null;
  periode: PeriodeTexte | null;
  tarif: Tarif;
  /** L'indice de la ligne d'où sort le tarif. */
  ligne: number;
};

export type Lecture = {
  tarifs: TarifLu[];
  /** Les saisons écrites sur la page (« 2026-27 »). */
  saisons: string[];
  /** Ce qui n'a pas pu être lu sans deviner. */
  problemes: string[];
};

export type ReperePerimetre = { cle: string; motif: RegExp };

export type OptionsLecture = {
  saison: string;
  perimetres?: readonly ReperePerimetre[];
  devise?: string;
};

/* ---------- Mots-clés ---------- */

/** Ce qui n'est pas un forfait de ski alpin. « Montée » (un ticket pour une
 *  seule montée) se lit en début de mot : les « remontées mécaniques » sont
 *  le sujet même d'une page de forfaits. */
const HORS_SUJET =
  /pieton|raquette|telebourg|assurance|carre neige|\bluge|vtt|debutant|premieres? traces?|\btapis|\bmontee|aller simple|aller-retour|\ba\/r\b|\bticket|navette|parking|consigne|bons? cadeau|handi|\bcmi\b|invalidit|mobilite reduite|nocturne|snowpark|ski de fond|nordique|\bbaby\b|\bbebe|bambin|front de neige|telesiege seul|carte (?:rechargeable|support)|caution/;

const RESTRICTIONS: [RegExp, string][] = [
  [
    /vente flash|early|prevente|pre-?primeur|\bprimeur|reservez|anticip|meilleur prix|a l'avance|j-\d+/,
    "achat anticipé",
  ],
  // « Livret de famille » est une pièce justificative, pas un tarif famille.
  [/tribu|(?<!livret de )famil|family|groupe|\bduo\b|couple/, "tribu ou famille"],
  [/samedi|dimanche|week-?end/, "jour de la semaine"],
  [
    /non[- ]?consecutifs?|\d+\s*x\s*\d|liberte|\bflex\b|a la carte|\d\/7\b|temporis/,
    "jours non consécutifs",
  ],
  [/annuel|hiver \+ ete|ete \+ hiver/, "annuel"],
  [/supp\b|supp\.|supplementaire|prolongation|extension/, "complément"],
  [/\bpromo|\bhappy\b|dernieres? neiges|premieres? neiges/, "promotion"],
];

/** Ce qui dit qu'une section parle bien de forfaits de ski. */
const SKI = /journee|\d+\s*jours?\b|sejour|\d+\s*h\b|\bsaison\b/;

const MOTS_PERIODE =
  /saison|periode|vacances|opening|closing|avant-?premiere|pre-?ouverture|ouverture|fermeture|noel|fevrier|printemps|paques|hiver|haute|basse|moyenne|fin d'annee/;

const CATEGORIE =
  /(?<!\p{L})(?:tout public|tarif unique|tarif normal|plein tarif|tarif plein|normal|adultes?|enfants?|juniors?|jeunes?|ados?|adolescents?|[ée]tudiants?|s[ée]niors?|v[ée]t[ée]rans?|vermeil|[âa]ge d.or|a[îi]n[ée]s?|family|famille|tribu)(?!\p{L})/giu;

/** « VétéranFAMILY », « Tout publicTarif unique » : deux mots collés par la
 *  mise en page, séparés au changement de casse. */
const decoller = (s: string) => s.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2");

function categorieDe(mot: string): CategorieTarif {
  const m = plier(mot);
  if (/tout public|tarif unique|tarif normal|plein tarif|tarif plein|normal|adulte/.test(m))
    return "adulte";
  if (/enfant/.test(m)) return "enfant";
  if (/junior|jeune|ado/.test(m)) return "junior";
  if (/etudiant/.test(m)) return "etudiant";
  if (/senior|veteran|vermeil|age d.or|aine/.test(m)) return "senior";
  return "famille";
}

type CategorieLue = {
  categorie: CategorieTarif;
  libelle: string;
  ages: { min: number | null; max: number | null } | null;
};

/** Les bornes d'âge écrites dans un bout de texte. */
function agesDans(texte: string): { min: number | null; max: number | null } | null {
  const t = plier(texte);
  let m = /(\d{1,3})\s*(?:a|-|\/)\s*(\d{1,3})\s*(?:ans)?/.exec(t);
  if (m) return agesDepuisTexte(`${m[1]}-${m[2]}`);
  m =
    /(\d{1,3})\s*ans\s*(?:et\s*(?:\+|plus)|\+|et au-dela)/.exec(t) ??
    /(?:\+|plus de)\s*(\d{1,3})\s*ans/.exec(t) ??
    /(\d{1,3})\s*\+/.exec(t);
  if (m) return agesDepuisTexte(`${m[1]}+`);
  m = /(?:moins de|-)\s*(\d{1,3})\s*ans/.exec(t);
  if (m) return { min: null, max: Number(m[1]) };
  return null;
}

/** Toutes les bornes d'âge d'un texte, dans l'ordre. */
function agesEnOrdre(texte: string): { min: number | null; max: number | null }[] {
  const t = plier(texte);
  const out: { min: number | null; max: number | null }[] = [];
  const re =
    /(\d{1,3})\s*(?:a|-|\/)\s*(\d{1,3})(?:\s*ans)?|(\d{1,3})\s*ans\s*(?:et\s*(?:\+|plus)|\+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const a = m[3] ? agesDepuisTexte(`${m[3]}+`) : agesDepuisTexte(`${m[1]}-${m[2]}`);
    if (a) out.push(a);
  }
  return out;
}

/** Le tarif de base, sans catégorie écrite : « Tout public », « Tarif
 *  unique », « Tarif normal » (La Pierre Saint-Martin), « Plein tarif ». Il se
 *  lit comme le tarif adulte, et son libellé le dit. */
const GENERIQUE = /tout public|tarif unique|tarif normal|plein tarif|tarif plein|\bnormal\b/i;

/**
 * Les catégories d'une cellule d'en-tête, chacune avec ses âges.
 *
 * « Enfant / Sénior 8 - 18 et 65 - 74 ans » porte deux catégories et deux
 * tranches : autant de tranches que de catégories, elles se rangent dans
 * l'ordre. Sinon chaque catégorie prend les âges écrits après elle.
 */
export function categoriesDans(texte: string): CategorieLue[] {
  const brut = decoller(texte).replace(/\s+/g, " ").trim();
  const trouves: { debut: number; mot: string }[] = [];
  CATEGORIE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CATEGORIE.exec(brut))) trouves.push({ debut: m.index, mot: m[0] });
  const cats: CategorieLue[] = [];
  trouves.forEach((c, i) => {
    const segment = brut
      .slice(c.debut, trouves[i + 1]?.debut ?? brut.length)
      .replace(/[*\s/]+$/, "")
      .trim();
    const cat = {
      categorie: categorieDe(c.mot),
      libelle: segment || c.mot,
      ages: agesDans(segment.slice(c.mot.length)),
    };
    const prec = cats[cats.length - 1];
    // « Tout public Tarif unique » : une seule catégorie, dite deux fois.
    if (prec && GENERIQUE.test(prec.libelle) && GENERIQUE.test(cat.libelle))
      prec.libelle = `${prec.libelle} ${cat.libelle}`;
    else cats.push(cat);
  });
  const ages = agesEnOrdre(brut);
  if (cats.length > 1 && ages.length === cats.length) {
    cats.forEach((c, i) => {
      c.ages = ages[i];
      if (!/\d/.test(c.libelle))
        c.libelle = `${c.libelle} ${ages[i].min ?? ""}${ages[i].max != null ? `-${ages[i].max}` : "+"}`;
    });
  }
  for (const c of cats) c.libelle = c.libelle.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  return cats;
}

/**
 * Les catégories d'une ligne d'en-tête en texte (PDF) : les mots d'abord, les
 * âges ensuite, dans le même ordre (« Adulte Junior Vétéran … 18-74 ans 5-17
 * ans 75 ans et + »).
 */
function categoriesEnLigne(texte: string): CategorieLue[] {
  const cats = categoriesDans(texte).map((c) => ({
    ...c,
    libelle: c.libelle.split(/\s/)[0],
    ages: null as CategorieLue["ages"],
  }));
  const t = plier(texte);
  const ages: CategorieLue["ages"][] = [];
  const re = /(\d{1,3})\s*-\s*(\d{1,3})\s*ans|(\d{1,3})\s*ans\s*et\s*(?:\+|plus)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)))
    ages.push(m[3] ? { min: Number(m[3]), max: null } : agesDepuisTexte(`${m[1]}-${m[2]}`));
  const sansFamille = cats.filter((c) => c.categorie !== "famille");
  if (ages.length && ages.length <= sansFamille.length)
    ages.forEach((a, i) => (sansFamille[i].ages = a));
  return cats;
}

/* ---------- Prix ---------- */

type PrixLu = { valeur: number; barre: boolean; parentheses: boolean };

const PRIX = /(\d{1,3}(?:[ \u00a0\u202f.]\d{3})+|\d+)(?:[,.](\d{1,2}))?\s*(?:€|eur\b|euros?\b)/gi;

function nombre(entier: string, decimales: string | undefined): number {
  const n = Number(entier.replace(/[ \u00a0\u202f.]/g, ""));
  return decimales ? n + Number(decimales.padEnd(2, "0")) / 100 : n;
}

export function prixDans(texte: string): PrixLu[] {
  const out: PrixLu[] = [];
  PRIX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRIX.exec(texte))) {
    const avant = texte.slice(0, m.index);
    const barre = (avant.match(/~~/g)?.length ?? 0) % 2 === 1;
    const ouverte = avant.lastIndexOf("(");
    const fermee = avant.lastIndexOf(")");
    out.push({ valeur: nombre(m[1], m[2]), barre, parentheses: ouverte > fermee });
  }
  return out;
}

/**
 * Le prix public d'une cellule. Un prix barré à côté d'une promotion est le
 * prix public ; un prix entre parenthèses est une remise (« (43,20 €)* ») ;
 * plusieurs prix sans marque ne se départagent pas.
 */
export function prixDeCellule(texte: string): { prix: number | null; ambigu: boolean } {
  const tous = prixDans(texte);
  if (!tous.length) return { prix: null, ambigu: false };
  const barres = tous.filter((p) => p.barre);
  if (barres.length === 1) return { prix: barres[0].valeur, ambigu: false };
  const clairs = tous.filter((p) => !p.barre && !p.parentheses);
  if (clairs.length === 1) return { prix: clairs[0].valeur, ambigu: false };
  if (!clairs.length) return { prix: null, ambigu: false };
  return { prix: null, ambigu: true };
}

/* ---------- Canal ---------- */

type CanalColonne = Canal | "exclu" | null;

function canalDans(texte: string): CanalColonne {
  const t = plier(texte);
  if (/no souci|abonn|adherent|membre|carte (?:club|fidelite)/.test(t)) return "exclu";
  if (/(?<!tout )public|caisse|guichet|point de vente/.test(t)) return "caisse";
  if (/internet|\bweb\b|en ligne/.test(t)) return "en-ligne";
  return null;
}

/* ---------- Lignes ---------- */

const estTitre = (l: string) => /^#{1,6}\s/.test(l);

/** Le niveau d'un intertitre écrit comme un paragraphe : sous tous les titres. */
const NIVEAU_INTERTITRE = 7;
/** Le bandeau d'une page de PDF (« LES MENUIRES ST MARTIN SKI PASS 2026 - 2027 ») :
 *  il tient jusqu'à la page suivante, les intertitres « TARIFS » ne le referment pas. */
const NIVEAU_BANDEAU = 6.5;
/** Un bloc ouvert par `# Page N` : la page d'un PDF. */
const PAGE_PDF = /^page \d+$/i;

/**
 * Une ligne courte, sans chiffre ni prix, qui fait office de titre : précédée
 * d'une marque (« ► Menthières ») ou tout en capitales (« SÉJOUR »).
 */
function intertitre(texte: string): boolean {
  if (texte.length > 50 || /\d|€/.test(texte)) return false;
  if (/^[►▶→•]\s*\S/.test(texte)) return true;
  return /\p{Lu}{4}/u.test(texte) && !/\p{Ll}/u.test(texte);
}
const niveauTitre = (l: string) => /^(#{1,6})\s/.exec(l)?.[1].length ?? 0;
const sansDieses = (l: string) => l.replace(/^#{1,6}\s*/, "").trim();
const estLigneTableau = (l: string) => l.startsWith("|");
const cellules = (l: string) =>
  l
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** Une ligne qui ne dit presque que des dates : « Du 21 au 27 novembre 2026 ». */
function ligneDeDates(ligne: string): boolean {
  if (ligne.length > 160) return false;
  const reste = plier(ligne)
    .replace(/\d+/g, " ")
    .replace(
      /\b(?:du|au|et|le|la|l'|les|de|des|a|partir|jusqu'?au|jusqu|samedi|dimanche|lundi|mardi|mercredi|jeudi|vendredi|janv\w*|fevr?\w*|mars|avr\w*|mai|juin|juil\w*|aout|sept\w*|oct\w*|nov\w*|dec\w*|inclus|ouverture|fermeture|fin|saison|station)\b/g,
      " ",
    )
    .replace(/[^a-z]+/g, " ")
    .trim();
  return reste.split(" ").filter((w) => w.length > 2).length <= 5;
}

type Section = { niveau: number; texte: string };

type Colonne = { categories: CategorieLue[]; periode: PeriodeTexte | null; canal: CanalColonne };

type Tableau = {
  colonnes: Colonne[];
  /** La catégorie commune au tableau : « Tarif Adulte ». */
  categorie: CategorieLue | null;
  /** La ligne d'en-tête précédente, quand elle ne portait que des périodes. */
  periodes: { cellules: string[]; periodes: (PeriodeTexte | null)[] } | null;
  /** Une sous-section dans le tableau (« FORFAIT TRIBU »). */
  section: string | null;
  /** La période posée par une ligne du tableau (« HAUTE SAISON »). */
  periode: PeriodeTexte | null;
};

/**
 * Les tarifs d'une page, ligne par ligne.
 */
export function lireGrille(lignes: readonly string[], options: OptionsLecture): Lecture {
  const { saison } = options;
  const devise = options.devise ?? "EUR";
  const reperes = options.perimetres ?? [];
  const tarifs: TarifLu[] = [];
  const problemes: string[] = [];
  const definitions = new Map<string, PeriodeTexte>();

  const titres: Section[] = [];
  let perimetre: { cle: string; niveau: number } | null = null;
  let periode: (PeriodeTexte & { niveau: number }) | null = null;
  let enAttente: Section | null = null;
  let tableau: Tableau | null = null;
  let enteteTexte: CategorieLue[] | null = null;
  // Un en-tête de PDF écrit une catégorie par ligne (« Adulte », « 18/74ans »,
  // « Adult », « Enfant »…) : les catégories s'empilent jusqu'à la première
  // ligne qui n'en est pas une.
  let pileEntete: CategorieLue[] = [];
  // La page de PDF en cours. Sa ligne de dates peut suivre les tarifs qu'elle
  // date (mise en page en colonnes) : une page qui n'en porte qu'une la donne,
  // à la fin de la page, aux tarifs restés sans période.
  let bloc: { page: boolean; debut: number; periodes: PeriodeTexte[] } = { page: false, debut: 0, periodes: [] };
  const finirBloc = () => {
    if (!bloc.page || bloc.periodes.length !== 1) return;
    const per = bloc.periodes[0];
    for (let k = bloc.debut; k < tarifs.length; k++) tarifs[k].periode ??= { libelle: per.libelle, plages: per.plages };
  };

  const periodeDe = (texte: string): PeriodeTexte | null => {
    const p = periodeDepuisTexte(texte, saison);
    if (p) return { libelle: texte.replace(/\s+/g, " ").trim(), plages: p.plages };
    const def = definitions.get(cleDefinition(texte));
    return def ?? null;
  };

  const contexte = () => {
    const pile = [
      ...titres.map((t) => t.texte),
      ...(tableau?.section ? [tableau.section] : []),
    ].map(plier);
    // « FORFAITS 3H - JOURNÉE - ÉTUDIANT - PREMIÈRES TRACES » parle aussi de
    // la journée : la section n'est écartée que si elle ne parle que d'autre
    // chose. Les lignes hors sujet le restent une à une.
    const horsSujet = pile.some((t) => HORS_SUJET.test(t) && !SKI.test(t));
    let restriction: string | null = null;
    for (const t of pile)
      for (const [re, r] of RESTRICTIONS) if (!restriction && re.test(t)) restriction = r;
    let categorie: CategorieLue | null = null;
    for (const t of [
      ...titres.map((x) => x.texte),
      ...(tableau?.section ? [tableau.section] : []),
    ]) {
      const c = categoriesDans(t);
      if (c.length === 1) categorie = c[0];
    }
    let canal: CanalColonne = null;
    for (const t of pile) canal = canalDans(t) ?? canal;
    return { horsSujet, restriction, categorie, canal };
  };

  const emettre = (
    i: number,
    libelle: string,
    duree: Duree,
    restriction: string | null,
    cat: CategorieLue,
    prix: number,
    canal: Canal,
    per: PeriodeTexte | null,
  ) => {
    tarifs.push({
      perimetre: perimetre?.cle ?? null,
      periode: per ? { libelle: per.libelle, plages: per.plages } : null,
      ligne: i,
      tarif: {
        duree,
        libelleDuree: libelle.replace(/[*\s]+$/, "").trim(),
        categorie: cat.categorie,
        libelleCategorie: cat.libelle.replace(/[*\s]+$/, "").trim(),
        ages: cat.ages,
        prix,
        devise,
        canal,
        restriction,
      },
    });
  };

  /** La durée et la restriction d'un libellé de ligne ; `null` s'il est hors sujet. */
  const produit = (libelle: string, restrictionSection: string | null) => {
    const p = plier(libelle);
    if (HORS_SUJET.test(p)) return null;
    const { duree, restriction } = dureeDepuisLibelle(libelle);
    if (duree.type === "autre") return null;
    let r = restrictionSection ?? restriction;
    for (const [re, x] of RESTRICTIONS) if (!r && re.test(p)) r = x;
    return { duree, restriction: r };
  };

  lignes.forEach((ligne, i) => {
    /* ----- Titre ----- */
    if (estTitre(ligne)) {
      const niveau = niveauTitre(ligne);
      const texte = sansDieses(ligne);
      finirBloc();
      bloc = { page: PAGE_PDF.test(texte), debut: tarifs.length, periodes: [] };
      while (titres.length && titres[titres.length - 1].niveau >= niveau) titres.pop();
      titres.push({ niveau, texte });
      tableau = null;
      enteteTexte = null;
      const repere = reperes.find((r) => r.motif.test(plier(texte)));
      if (repere) perimetre = { cle: repere.cle, niveau };
      else if (perimetre && niveau <= perimetre.niveau) perimetre = null;
      const plieTitre = plier(texte);
      const vente = HORS_SUJET.test(plieTitre) || RESTRICTIONS[0][0].test(plieTitre);
      const per = vente ? null : periodeDepuisTexte(texte, saison);
      if (per) {
        periode = { libelle: texte, plages: per.plages, niveau };
        enAttente = null;
      } else {
        if (periode && niveau <= periode.niveau) periode = null;
        if (enAttente && niveau <= enAttente.niveau) enAttente = null;
        if (!repere && !vente && MOTS_PERIODE.test(plieTitre)) enAttente = { niveau, texte };
      }
      return;
    }

    /* ----- Tableau ----- */
    if (estLigneTableau(ligne)) {
      const c = cellules(ligne);
      if (!c.some(Boolean)) return;
      const ctx = contexte();
      tableau ??= { colonnes: [], categorie: null, periodes: null, section: null, periode: null };
      const t = tableau;
      const pleines = c.map((x, j) => (x ? j : -1)).filter((j) => j >= 0);
      const chiffrees = c.slice(1).some((x) => prixDans(x).length > 0);

      // Une ligne d'une seule cellule, ou dont la première cellule est une
      // période : un intertitre du tableau.
      // Une ligne qui nomme une période définie plus haut (« HAUTE SAISON »,
      // sans chiffre), ou une ligne d'une seule cellule sans prix : un
      // intertitre du tableau.
      const perLigne = /\d/.test(c[0]) && pleines.length > 1 ? null : periodeDe(c[0]);
      if (c[0] && perLigne && MOTS_PERIODE.test(plier(c[0]))) {
        t.periode = perLigne;
        return;
      }
      if (c[0] && pleines.length === 1 && !chiffrees) {
        t.section = sansDieses(c[0]);
        return;
      }

      if (!chiffrees) {
        // Une ligne d'en-tête : catégories, périodes, canaux par colonne.
        const colonnes: Colonne[] = c.map((x) => {
          const canal = canalDans(x);
          const periode =
            x && canal !== "exclu" && MOTS_PERIODE.test(plier(x))
              ? (periodeDe(x) ?? { libelle: x, plages: [] })
              : null;
          return { categories: categoriesDans(x), periode, canal };
        });
        const tete = categoriesDans(c[0]);
        const avecCategories = colonnes.slice(1).filter((x) => x.categories.length).length;
        const avecPeriodes = colonnes.slice(1).filter((x) => x.periode).length;
        if (!avecCategories && avecPeriodes) {
          t.periodes = { cellules: c, periodes: colonnes.map((x) => x.periode) };
          t.colonnes = colonnes;
          t.categorie = tete.length === 1 ? tete[0] : null;
          return;
        }
        if (t.periodes && avecCategories) {
          // Les périodes de la ligne précédente couvrent chacune plusieurs
          // colonnes de catégories.
          const precedentes = t.periodes.periodes;
          if (t.periodes.cellules.length === c.length) {
            colonnes.forEach((col, j) => (col.periode = precedentes[j] ?? col.periode));
          } else {
            const pers = precedentes.slice(1).filter((p): p is PeriodeTexte => !!p);
            const cats = colonnes
              .map((x, j) => (j > 0 && x.categories.length ? j : -1))
              .filter((j) => j > 0);
            if (pers.length && cats.length % pers.length === 0) {
              const g = cats.length / pers.length;
              cats.forEach((j, k) => (colonnes[j].periode = pers[Math.floor(k / g)]));
            }
          }
          t.periodes = null;
        }
        t.categorie = !avecCategories && tete.length === 1 ? tete[0] : null;
        if (avecCategories || colonnes.some((x) => x.canal) || t.categorie) t.colonnes = colonnes;
        return;
      }

      // Une ligne chiffrée : une durée, puis un prix par colonne.
      if (ctx.horsSujet) return;
      const libelle = c[0];
      if (!libelle) return;
      const restrictionSection =
        [...RESTRICTIONS].find(([re]) => re.test(plier(t.section ?? "")))?.[1] ?? ctx.restriction;
      const p = produit(libelle, restrictionSection);
      if (!p) return;
      const catsLigne = categoriesDans(libelle).filter((x) => x.categorie !== "famille");
      const colonnesChiffrees = c.slice(1).filter((x) => prixDans(x).length).length;
      c.forEach((cellule, j) => {
        if (j === 0 || !cellule) return;
        const { prix, ambigu } = prixDeCellule(cellule);
        if (ambigu) {
          problemes.push(
            `ligne ${i + 1} : plusieurs prix dans une cellule, sans dire lequel (« ${libelle} »)`,
          );
          return;
        }
        if (prix == null) return;
        const col = t.colonnes[j];
        const canal = col?.canal ?? ctx.canal;
        if (canal === "exclu") return;
        let cats: CategorieLue[] = catsLigne.length ? catsLigne : (col?.categories ?? []);
        // Une colonne « Tarif unique » sous un titre « Forfaits étudiants » :
        // la catégorie est celle du titre.
        if (cats.length && cats.every((x) => GENERIQUE.test(x.libelle)) && ctx.categorie)
          cats = [ctx.categorie];
        if (!cats.length && t.categorie) cats = [t.categorie];
        if (!cats.length && ctx.categorie) cats = [ctx.categorie];
        if (!cats.length && colonnesChiffrees === 1)
          cats = [{ categorie: "adulte", libelle: "Tarif unique", ages: null }];
        if (!cats.length) {
          problemes.push(`ligne ${i + 1} : colonne ${j + 1} sans catégorie (« ${libelle} »)`);
          return;
        }
        const per = col?.periode ?? t.periode ?? periode;
        for (const cat of cats) {
          const restriction =
            p.restriction ?? (cat.categorie === "famille" ? "tribu ou famille" : null);
          emettre(i, libelle, p.duree, restriction, cat, prix, canal ?? "non-precise", per);
        }
      });
      return;
    }

    /* ----- Texte ----- */
    tableau = null;
    const texte = ligne.trim();
    const plie = plier(texte);

    // Un intertitre écrit comme un paragraphe : « ► Menthières », « SÉJOUR ».
    // Il ouvre la section d'un périmètre quand il le nomme, et referme sinon
    // celle qu'un intertitre semblable avait ouverte. Un vrai titre les
    // referme toutes deux.
    if (intertitre(texte)) {
      const repere = reperes.find((r) => r.motif.test(plie));
      if (repere) perimetre = { cle: repere.cle, niveau: NIVEAU_INTERTITRE };
      else if (perimetre?.niveau === NIVEAU_INTERTITRE) perimetre = null;
    } else if (bloc.page && texte.length <= 60 && !/€/.test(texte) && !/\p{Ll}/u.test(texte)) {
      const repere = reperes.find((r) => r.motif.test(plie));
      if (repere) perimetre = { cle: repere.cle, niveau: NIVEAU_BANDEAU };
    }

    // Une définition : « Haute saison : du 19/12/26 au 02/01/27… ».
    const def = /^([^:]{2,60}?)\s*:\s*(.+)$/.exec(texte);
    if (def && MOTS_PERIODE.test(plier(def[1]))) {
      const per = periodeDepuisTexte(def[2], saison);
      if (per) {
        definitions.set(cleDefinition(def[1]), { libelle: def[1].trim(), plages: per.plages });
        return;
      }
    }

    // Une ligne de dates : elle date la période annoncée par le titre.
    const perTexte = prixDans(texte).length ? null : periodeDepuisTexte(texte, saison);
    if (
      perTexte &&
      ligneDeDates(texte) &&
      (!perTexte.ouverte || enAttente || MOTS_PERIODE.test(plie))
    ) {
      const niveau = titres[titres.length - 1]?.niveau ?? 0;
      periode = enAttente
        ? { libelle: enAttente.texte, plages: perTexte.plages, niveau: enAttente.niveau }
        : { libelle: texte, plages: perTexte.plages, niveau };
      enAttente = null;
      if (bloc.page) bloc.periodes.push(periode);
      return;
    }

    // Une ligne d'en-tête en texte : plusieurs catégories, aucun prix.
    const catsTexte = categoriesEnLigne(texte);
    if (catsTexte.length >= 2 && !prixDans(texte).length) {
      enteteTexte = catsTexte;
      pileEntete = [];
      return;
    }
    if (bloc.page && !prixDans(texte).length && texte.length <= 30) {
      const seule = catsTexte.length === 1 ? catsTexte[0] : null;
      if (seule) {
        // « Vétéran » puis sa traduction « Veteran » : une seule colonne.
        const derniere = pileEntete[pileEntete.length - 1];
        if (!derniere || derniere.categorie !== seule.categorie) pileEntete.push(seule);
        if (pileEntete.length >= 2) enteteTexte = [...pileEntete];
        return;
      }
      const derniere = pileEntete[pileEntete.length - 1];
      // « 18/74ans », « 75 ans + », et sa traduction « 18/74 years ».
      if (derniere && /^\d{1,2}\s*(?:[/-]\s*\d{1,2}\s*)?(?:ans|years?)\s*\+?$/i.test(texte.trim())) {
        derniere.ages ??= agesDans(texte.replace(/years?/i, "ans"));
        if (pileEntete.length >= 2) enteteTexte = [...pileEntete];
        return;
      }
      // Une traduction courte (« Adult », « Child ») ne referme pas l'en-tête.
      if (!/\d/.test(texte) && texte.length <= 15) return;
    }
    pileEntete = [];

    // Des suites « durée, prix… » (PDF, cartes, paragraphes).
    const ctx = contexte();
    if (ctx.horsSujet || !prixDans(texte).length) return;
    const suite =
      /(?<![\d-]\s?)(?<!\d\s?x\s?)(\d{1,2}\s*(?:jours?|j)\b|\d{1,2}\s*heures?|(?:1\/2|demi-?)\s*journee|journee)\s*(?:(adultes?|enfants?|juniors?|seniors?|etudiants?)\s*)?[:=]?\s*((?:\d{1,3}(?:[ .]\d{3})?(?:[,.]\d{1,2})?\s*(?:€|eur\b)\s*){1,6})/g;
    let m: RegExpExecArray | null;
    // Les PDF bilingues doublent la durée : « 1 jour | 1day 75,70 € ».
    const plieUni = plie.replace(/\s*\|\s*\d{1,2}\s*(?:days?|hours?)\b/g, "");
    while ((m = suite.exec(plieUni))) {
      const p = produit(m[1], ctx.restriction);
      if (!p) continue;
      const valeurs = prixDans(m[3]).map((x) => x.valeur);
      // Une catégorie écrite entre la durée et le prix (« 1 jour adulte :
      // 66 € ») l'emporte ; sinon, les colonnes de la dernière ligne d'en-tête.
      const cats: CategorieLue[] = m[2]
        ? categoriesDans(m[2])
        : (enteteTexte ?? (ctx.categorie ? [ctx.categorie] : []));
      if (!cats.length) {
        problemes.push(`ligne ${i + 1} : « ${m[0].trim()} » sans catégorie`);
        continue;
      }
      valeurs.slice(0, cats.length).forEach((v, k) => {
        const cat = cats[k];
        const restriction =
          p.restriction ?? (cat.categorie === "famille" ? "tribu ou famille" : null);
        emettre(
          i,
          m![1],
          p.duree,
          restriction,
          cat,
          v,
          ctx.canal && ctx.canal !== "exclu" ? ctx.canal : "non-precise",
          periode,
        );
      });
    }
  });
  finirBloc();

  return { tarifs, saisons: saisonsCitees(lignes.join("\n")), problemes };
}

/** La clé d'une définition de période : « Haute saison » et « HAUTE SAISON ». */
function cleDefinition(texte: string): string {
  return plier(texte)
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
