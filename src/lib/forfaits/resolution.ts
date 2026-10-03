/**
 * Le prix d'un forfait pour un séjour donné : `resolvePassPrice`.
 *
 * Une grille (`tarifsPeriode.ts`) dit ce qu'une station publie, période par
 * période. Ce module répond à la question de l'écran : pour ce séjour, dans
 * cette station, combien coûte le forfait, et d'où vient ce prix ?
 *
 * ## Les règles, telles que décidées
 *
 * - **Jours de ski : les nuits moins une** (7 nuits, 6 jours de ski, l'usage
 *   des stations), à partir du lendemain de l'arrivée. `joursSki` permet une
 *   autre valeur.
 * - **Le forfait du domaine relié** par défaut (Portes du Soleil plutôt
 *   qu'Avoriaz seul), celui de la station à défaut ; `perimetre` et
 *   `perimetreCle` permettent de choisir. Une station qui n'appartient à
 *   aucun domaine relié n'a qu'un forfait, quel que soit le nom que lui
 *   donne sa source.
 * - **Le prix public en caisse** d'abord, puis le prix dont le canal n'est pas
 *   dit, puis le prix en ligne.
 * - **Une estimation n'est jamais un prix**, un tarif restreint (« le
 *   week-end », « famille ») n'est pas le tarif ordinaire : aucun des deux
 *   n'est retenu.
 * - **« Forfait semaine » vaut 6 jours.**
 * - **L'enfant sans tarif enfant publié prend le tarif junior** qui commence à
 *   12 ans au plus (« Juniors de 5 à 17 ans »), et c'est signalé.
 * - **Bornes incluses** : une période « du 19 décembre au 8 janvier » couvre
 *   le 19 et le 8.
 * - **Deux périodes qui se chevauchent : la plus courte l'emporte** (« Noël »
 *   plutôt que « haute saison »).
 * - **Séjour à cheval sur deux périodes** : au prorata des jours de ski passés
 *   dans chacune quand chacune publie la durée retenue ; sinon le prix de la
 *   période qui compte le plus de jours. Dans les deux cas, le drapeau
 *   `surDeuxPeriodes` est levé.
 * - **Durée absente de la grille** : la durée immédiatement supérieure
 *   publiée (5 jours de ski, forfait 6 jours), et c'est signalé. Une station
 *   qui ne vend pas de forfait semaine (la journée seule, ou 1 et 2 jours
 *   comme La Schlucht) : les journées additionnées (6 jours de ski, 6 × la
 *   journée), chacune au prix de sa période, en dernier recours, et c'est
 *   signalé.
 * - **Grille d'une saison antérieure** : utilisée, signalée, fiabilité faible.
 *   Les jours du séjour y sont reportés à la même date de cette saison-là.
 *   Au-delà de trois saisons (`AGE_MAX_SAISONS`), elle n'est plus reprise :
 *   le prix est « non publié ».
 * - **Sans dates de séjour** : le 6 jours adulte de la période qui contient la
 *   date du jour, à défaut de la plus proche, période affichée.
 *
 * Fonction pure : les grilles et la date du jour sont passées par l'appelant.
 *
 * Chargé tel quel par `node --experimental-strip-types` : aucun alias `@/`.
 */

import { montantCents } from "../devises.ts";
import { tr, trN } from "../i18n/tr.ts";
import {
  saisonDeJour,
  type Canal,
  type CategorieTarif,
  type Confiance,
  type GrilleTarifaire,
  type OrigineGrille,
  type Perimetre,
  type Periode,
  type Tarif,
} from "./tarifsPeriode.ts";

/* ---------- Entrées ---------- */

/** Les dates d'un séjour, AAAA-MM-JJ : le jour d'arrivée, le jour du départ. */
export type DatesSejour = { arrivee: string; depart: string };

export type OptionsResolution = {
  /** Toutes les grilles connues : officielles, migrées, saisies. Le
   *  résolveur choisit celle qui s'applique. */
  grilles: readonly GrilleTarifaire[];
  /** La date du jour, AAAA-MM-JJ : elle sert quand le séjour n'a pas de dates. */
  aujourdhui: string;
  /** Adulte par défaut. */
  categorie?: CategorieTarif;
  /** Le type de forfait voulu : le domaine relié par défaut. */
  perimetre?: Perimetre["type"];
  /** Un forfait précis (« domaine:portes-du-soleil »), avant tout autre. */
  perimetreCle?: string;
  /** Le nombre de jours de ski, quand il n'est pas les nuits moins une. */
  joursSki?: number;
};

/* ---------- Sorties ---------- */

/** La fiabilité d'un prix résolu : la confiance de sa grille, abaissée par ce
 *  que la résolution a dû supposer. */
export type Fiabilite = Confiance;

export type PeriodeDuSejour = {
  libelle: string;
  debut: string;
  fin: string;
  saisonEntiere: boolean;
  /** Les jours de ski du séjour passés dans cette période. */
  jours: number;
  /** Le prix de la durée retenue dans cette période ; `null` si elle ne la
   *  publie pas (le prix est alors celui de la période majoritaire). */
  prix: number | null;
};

/**
 * Comment le prix est calculé : le forfait d'une période, le prorata de
 * plusieurs, celui de la période majoritaire, ou la somme des journées quand
 * aucun forfait assez long n'est publié.
 */
export type Calcul = "une-periode" | "prorata" | "periode-majoritaire" | "journees";

export type PrixResolu = {
  statut: "resolu";
  /** Le prix d'un forfait, pour une personne, arrondi au centime. */
  prix: number;
  devise: string;
  /** La période retenue : celle qui compte le plus de jours de ski. */
  periode: { libelle: string; debut: string; fin: string; saisonEntiere: boolean };
  /** Toutes les périodes touchées par le séjour, dans l'ordre des dates. */
  periodes: PeriodeDuSejour[];
  calcul: Calcul;
  duree: {
    /** Les jours de ski du séjour. */
    demandee: number;
    /** La durée du forfait retenu. */
    retenue: number;
    /** Tel que publié : « 6 jours », « Forfait semaine ». */
    libelle: string;
  };
  /** Les jours de ski, AAAA-MM-JJ, `null` sans dates de séjour. */
  joursSki: { premier: string; dernier: string } | null;
  /** La catégorie du tarif retenu, telle que publiée : « junior » quand il
   *  répond à une demande enfant (voir `drapeaux.categorieRepli`). */
  categorie: { cle: CategorieTarif; libelle: string };
  canal: Canal;
  perimetre: Perimetre;
  grille: {
    id: string;
    saison: string;
    source: GrilleTarifaire["source"];
    scrapeLe: string | null;
    confiance: Confiance;
  };
  fiabilite: Fiabilite;
  drapeaux: {
    /** Le séjour touche deux périodes ou plus. */
    surDeuxPeriodes: boolean;
    /** La durée du séjour n'est pas publiée : durée supérieure retenue. */
    dureeSuperieure: boolean;
    /** La grille est d'une saison antérieure à celle du séjour. */
    saisonAnterieure: boolean;
    /** Le prix vient d'une période « Saison entière » : sans date publiée. */
    saisonEntiere: boolean;
    /** Des jours de ski tombent hors de toute période publiée : la plus
     *  proche a été prise. */
    horsPeriodes: boolean;
    /** Sans dates de séjour : 6 jours, période de la date du jour. */
    sansDates: boolean;
    /** Le type de forfait voulu n'a pas de grille : l'autre a été pris. */
    perimetreRepli: boolean;
    /** L'enfant demandé, sans tarif enfant publié : le tarif junior qui le
     *  couvre a été pris (`categorieDeLaGrille`). */
    categorieRepli: boolean;
    /** Aucun forfait de plusieurs jours publié : les journées additionnées,
     *  chacune au prix de sa période. */
    journeesAdditionnees: boolean;
  };
  /** Ce qui a été supposé, en clair, pour l'écran. */
  notes: string[];
};

export type EchecResolution = {
  /** `grille-ancienne` : la seule grille connue a plus de `AGE_MAX_SAISONS`
   *  saisons ; son prix n'est pas repris (« non publié »). */
  statut:
    | "grille-absente"
    | "grille-ancienne"
    | "categorie-absente"
    | "duree-absente"
    | "dates-invalides";
  detail: string;
  /** Les catégories que la grille publie, quand la voulue manque. */
  categoriesDisponibles?: CategorieTarif[];
  /** Les durées publiées (en jours), quand aucune n'est assez longue. */
  dureesDisponibles?: number[];
  /** Une estimation existe pour ce forfait : affichable comme telle, jamais
   *  comptée. */
  estimation?: { prix: number; devise: string; libelle: string };
};

export type Resolution = PrixResolu | EchecResolution;

/* ---------- Dates ---------- */

const JOUR_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const temps = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Le nombre de jours de `a` à `b` (négatif si `b` est avant). */
export function ecartJours(a: string, b: string): number {
  return Math.round((temps(b) - temps(a)) / JOUR_MS);
}

export function ajouterJours(iso: string, n: number): string {
  return new Date(temps(iso) + n * JOUR_MS).toISOString().slice(0, 10);
}

const dateValide = (iso: string) =>
  ISO.test(iso) && !Number.isNaN(temps(iso)) && ajouterJours(iso, 0) === iso;

/** Le même jour, `n` années plus tôt ou plus tard ; le 29 février devient le 28. */
export function decalerAnnees(iso: string, n: number): string {
  const a = Number(iso.slice(0, 4)) + n;
  const md = iso.slice(5);
  const bissextile = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  return `${a}-${md === "02-29" && !bissextile ? "02-28" : md}`;
}

/**
 * Les jours de ski d'un séjour : les nuits moins une, à partir du lendemain de
 * l'arrivée. Avec `joursSki` : ce nombre-là, commencé le jour même de
 * l'arrivée s'il ne tient pas après. `null` si les dates ne se lisent pas.
 */
export function joursDeSki(d: DatesSejour, joursSki?: number): string[] | null {
  if (!dateValide(d.arrivee) || !dateValide(d.depart)) return null;
  const nuits = ecartJours(d.arrivee, d.depart);
  if (nuits < 1) return null;
  const n =
    joursSki != null && Number.isFinite(joursSki)
      ? Math.min(Math.max(1, Math.round(joursSki)), nuits + 1)
      : Math.max(1, nuits - 1);
  const premier = n <= nuits - 1 ? ajouterJours(d.arrivee, 1) : d.arrivee;
  return Array.from({ length: n }, (_, i) => ajouterJours(premier, i));
}

/* ---------- Tarifs utilisables ---------- */

const ORDRE_CANAL: Record<Canal, number> = { caisse: 0, "non-precise": 1, "en-ligne": 2 };

/** « Forfait semaine » : 6 jours de ski. */
export const JOURS_SEMAINE = 6;

/** La durée d'un tarif en jours de ski ; « Forfait semaine » vaut 6 jours. */
export function joursDuTarif(t: Tarif): number | null {
  if (t.duree.type === "jours") return t.duree.jours;
  if (t.duree.type === "semaine") return JOURS_SEMAINE;
  return null;
}

/** Un tarif qui peut entrer dans un prix : ordinaire, publié, chiffré. */
const utilisable = (t: Tarif) =>
  t.restriction == null && !t.estime && t.prix > 0 && joursDuTarif(t) != null;

/**
 * Le tarif d'une période pour une catégorie et une durée exacte : le prix en
 * caisse d'abord ; à canal égal, un « 6 jours » écrit plutôt qu'un « Forfait
 * semaine », puis l'ordre de la grille.
 */
function tarifExact(p: Periode, accepte: Accepte, jours: number): Tarif | null {
  const candidats = p.tarifs.filter(
    (t) => utilisable(t) && accepte(t) && joursDuTarif(t) === jours,
  );
  candidats.sort(
    (a, b) =>
      ORDRE_CANAL[a.canal] - ORDRE_CANAL[b.canal] ||
      Number(a.duree.type === "semaine") - Number(b.duree.type === "semaine"),
  );
  return candidats[0] ?? null;
}

/** Les durées (en jours) qu'une période publie pour une catégorie. */
function dureesPubliees(p: Periode, accepte: Accepte): number[] {
  const out = new Set<number>();
  for (const t of p.tarifs) if (utilisable(t) && accepte(t)) out.add(joursDuTarif(t)!);
  return [...out].sort((a, b) => a - b);
}

/** Ce qui fait qu'un tarif vaut pour la catégorie demandée. */
type Accepte = (t: Tarif) => boolean;

/**
 * L'âge jusqu'auquel un tarif « junior » couvre l'enfant : un junior qui
 * commence à 5 ans (« Juniors de 5 à 17 ans ») est le prix de l'enfant, un
 * junior qui commence à 13 ans ne l'est pas.
 */
export const AGE_MIN_JUNIOR_POUR_ENFANT = 12;

/**
 * La catégorie à lire dans une grille. L'enfant demandé à une grille qui ne
 * publie aucun tarif enfant prend le tarif junior, quand ce junior commence à
 * 12 ans au plus ou ne dit pas ses âges : c'est ainsi que nombre de petites
 * stations nomment le prix de l'enfant (Ascou, Camurac, Les Monts d'Olmes :
 * « Juniors de 5 à 17 ans »). La reprise est signalée.
 */
export function categorieDeLaGrille(
  g: GrilleTarifaire,
  categorie: CategorieTarif,
): { accepte: Accepte; repli: boolean } {
  const exacte: Accepte = (t) => t.categorie === categorie;
  const publie = (a: Accepte) => g.periodes.some((p) => dureesPubliees(p, a).length > 0);
  if (categorie !== "enfant" || publie(exacte)) return { accepte: exacte, repli: false };
  const junior: Accepte = (t) =>
    t.categorie === "junior" && (t.ages?.min == null || t.ages.min <= AGE_MIN_JUNIOR_POUR_ENFANT);
  return publie(junior) ? { accepte: junior, repli: true } : { accepte: exacte, repli: false };
}

/** La plus courte durée publiée qui couvre `jours`. */
function dureeCouvrante(durees: readonly number[], jours: number): number | null {
  return durees.find((d) => d >= jours) ?? null;
}

/* ---------- Choix de la grille ---------- */

const ORDRE_ORIGINE: Record<OrigineGrille, number> = {
  officiel: 0,
  saisie: 1,
  catalogue: 2,
  bergfex: 3,
  skiinfo: 4,
  skiresort: 5,
  skipass: 6,
};
const RANG_CONFIANCE: Record<Confiance, number> = { haute: 0, moyenne: 1, faible: 2 };

/**
 * La station fait-elle partie d'un domaine relié à d'autres stations ? Sinon,
 * une grille qui ne couvre qu'elle est son forfait, qu'une source l'appelle
 * domaine ou station (Ascou, Camurac) : la préférence de périmètre ne les
 * départage pas.
 */
export function domaineRelie(stationId: string, grilles: readonly GrilleTarifaire[]): boolean {
  return grilles.some(
    (g) =>
      g.perimetre.type === "domaine" && g.stationIds.length > 1 && g.stationIds.includes(stationId),
  );
}

/** La grille vaut-elle le forfait voulu ? Le même type, ou, pour une station
 *  hors de tout domaine relié, une grille qui ne couvre qu'elle. */
function equivalent(g: GrilleTarifaire, voulu: Perimetre["type"], relie: boolean): boolean {
  return g.perimetre.type === voulu || (!relie && g.stationIds.length === 1);
}

/**
 * Les grilles d'une station qui peuvent valoir pour la saison visée, de la
 * meilleure à la moins bonne : le forfait voulu d'abord (domaine par défaut,
 * quand la station appartient à un domaine relié), puis la saison visée avant
 * les antérieures (la plus récente d'abord), puis la confiance, l'origine
 * (officielle, saisie, catalogue, agrégateurs), les périodes datées, et le
 * domaine le plus grand. Une grille d'une saison postérieure ne vaut pas pour
 * ce séjour.
 */
export function grillesCandidates(
  stationId: string,
  saison: string,
  options: Pick<OptionsResolution, "grilles" | "perimetre" | "perimetreCle">,
): GrilleTarifaire[] {
  const voulu = options.perimetre ?? "domaine";
  const relie = domaineRelie(stationId, options.grilles);
  const prefere = (g: GrilleTarifaire) => equivalent(g, voulu, relie);
  const datees = (g: GrilleTarifaire) => g.periodes.filter((p) => !p.saisonEntiere).length;
  return options.grilles
    .filter((g) => g.stationIds.includes(stationId) && g.saison <= saison)
    .slice()
    .sort(
      (a, b) =>
        Number(b.perimetre.cle === options.perimetreCle) -
          Number(a.perimetre.cle === options.perimetreCle) ||
        Number(prefere(b)) - Number(prefere(a)) ||
        (a.saison < b.saison ? 1 : a.saison > b.saison ? -1 : 0) ||
        RANG_CONFIANCE[a.confiance] - RANG_CONFIANCE[b.confiance] ||
        ORDRE_ORIGINE[a.source.origine] - ORDRE_ORIGINE[b.source.origine] ||
        datees(b) - datees(a) ||
        b.stationIds.length - a.stationIds.length ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/* ---------- Périodes ---------- */

const longueur = (p: Periode) => ecartJours(p.debut, p.fin);

/** La distance d'un jour à une période : 0 dedans, bornes incluses. */
function distance(jour: string, p: Periode): number {
  if (jour < p.debut) return ecartJours(jour, p.debut);
  if (jour > p.fin) return ecartJours(p.fin, jour);
  return 0;
}

const plusCourte = (liste: readonly Periode[]) =>
  liste.reduce((m, p) =>
    longueur(p) < longueur(m) || (longueur(p) === longueur(m) && p.debut > m.debut) ? p : m,
  );

/**
 * La période d'un jour : celle qui le contient (bornes incluses), la plus
 * courte si plusieurs se chevauchent ; à défaut, la plus proche (à égale
 * distance, celle qui vient après : la saison qui s'ouvre plutôt que celle
 * qui s'achève).
 *
 * `preferee` départage d'abord : parmi les périodes qui contiennent le jour,
 * celles qui publient le forfait cherché passent avant les autres (une
 * « vente flash » d'un jour ne masque pas le 6 jours de la haute saison) ; et
 * c'est parmi elles qu'on cherche la plus proche.
 */
export function periodeDuJour(
  jour: string,
  periodes: readonly Periode[],
  preferee: (p: Periode) => boolean = () => true,
): { periode: Periode; dedans: boolean } | null {
  if (!periodes.length) return null;
  const dedans = periodes.filter((p) => distance(jour, p) === 0);
  if (dedans.length) {
    const prefs = dedans.filter(preferee);
    return { periode: plusCourte(prefs.length ? prefs : dedans), dedans: true };
  }
  const prefs = periodes.filter(preferee);
  const proche = (prefs.length ? prefs : periodes).reduce((m, p) => {
    const d = distance(jour, p) - distance(jour, m);
    return d < 0 || (d === 0 && p.debut > m.debut) ? p : m;
  });
  return { periode: proche, dedans: false };
}

const ABAISSE: Record<Confiance, Confiance> = {
  haute: "moyenne",
  moyenne: "faible",
  faible: "faible",
};

/* ---------- Résolution sur une grille ---------- */

type Contexte = {
  grille: GrilleTarifaire;
  categorie: CategorieTarif;
  /** Les jours de ski, reportés dans la saison de la grille. */
  jours: string[];
  /** Les jours de ski tels que demandés, pour l'affichage. */
  joursDemandes: string[] | null;
  demandee: number;
  saisonAnterieure: boolean;
  sansDates: boolean;
  perimetreRepli: boolean;
  /** Les journées additionnées sont permises : aucune grille de la station ne
   *  publie de forfait assez long (second passage de `resolvePassPrice`). */
  journees: boolean;
};

const arrondi = (n: number) => Math.round(n * 100) / 100;
const bornes = (p: Periode) => ({
  libelle: p.libelle,
  debut: p.debut,
  fin: p.fin,
  saisonEntiere: p.saisonEntiere,
});
/** Les centimes quand il y en a : « 6 × 19,70 € », pas « 19,7 € ». */
const montant = (n: number, devise: string) => montantCents(arrondi(n), devise) ?? "";

function estimation(g: GrilleTarifaire, categorie: CategorieTarif, jours: number) {
  for (const p of g.periodes) {
    const t = p.tarifs.find(
      (x) =>
        x.estime &&
        x.categorie === categorie &&
        joursDuTarif(x) != null &&
        joursDuTarif(x)! >= jours,
    );
    if (t)
      return { prix: t.prix, devise: t.devise, libelle: `${t.libelleDuree} ${t.libelleCategorie}` };
  }
  return undefined;
}

/**
 * Les journées additionnées : pour une grille qui ne vend pas de forfait
 * semaine (la journée seule à Col du Feu, aux Signaraux, à Ghisoni ; 1 et
 * 2 jours à La Schlucht), chaque jour de ski au prix de la journée de sa
 * période. `null` si la grille publie un forfait de 6 jours ou plus, ou pas
 * même la journée.
 */
function parJournees(ctx: Contexte, accepte: Accepte, categorieRepli: boolean): PrixResolu | null {
  const { grille: g, jours, demandee } = ctx;
  // Là où un forfait semaine existe, trop court pour le séjour (13 jours à
  // Châtel), additionner des journées donnerait un prix que personne ne paie.
  const plusLongue = Math.max(...g.periodes.flatMap((p) => dureesPubliees(p, accepte)), 1);
  if (plusLongue >= JOURS_SEMAINE) return null;
  const avecJournee = g.periodes.filter((p) => tarifExact(p, accepte, 1));
  if (!avecJournee.length) return null;
  const touchees = new Map<Periode, number>();
  let horsPeriodes = false;
  for (const j of jours) {
    const r = periodeDuJour(j, avecJournee)!;
    if (!r.dedans) horsPeriodes = true;
    touchees.set(r.periode, (touchees.get(r.periode) ?? 0) + 1);
  }
  if (ctx.sansDates) horsPeriodes = false;
  const liste = [...touchees.entries()].sort(([a], [b]) => (a.debut < b.debut ? -1 : 1));
  const journee = (p: Periode) => tarifExact(p, accepte, 1)!;
  // Sans dates, un seul jour représente le séjour : ses `demandee` journées.
  const facteur = ctx.sansDates ? demandee : 1;
  const prix = arrondi(liste.reduce((s, [p, n]) => s + n * facteur * journee(p).prix, 0));
  const principale = [...liste].sort(
    ([pa, ja], [pb, jb]) => jb - ja || journee(pb).prix - journee(pa).prix,
  )[0][0];
  const tarif = journee(principale);
  let fiabilite: Fiabilite = g.confiance;
  const notes = [
    tr("{debut} : {n} journées additionnées ({calcul}).", {
      debut:
        plusLongue > 1
          ? tr("Forfaits publiés jusqu'à {n} jours seulement", { n: plusLongue })
          : tr("Aucun forfait de plusieurs jours publié"),
      n: demandee,
      calcul: liste
        .map(([p, n]) => `${n * facteur} × ${montant(journee(p).prix, journee(p).devise)}`)
        .join(" + "),
    }),
  ];
  if (horsPeriodes) {
    notes.push(
      tr("Des jours de ski tombent hors des périodes publiées : la période la plus proche a été prise."),
    );
    fiabilite = ABAISSE[fiabilite];
  }
  if (ctx.saisonAnterieure) {
    notes.push(tr("Grille de la saison {saison}, antérieure au séjour : prix à confirmer.", { saison: g.saison }));
    fiabilite = "faible";
  }
  const saisonEntiere = liste.some(([p]) => p.saisonEntiere);
  if (saisonEntiere) notes.push(tr("Prix publié sans période : il vaut pour la saison entière."));
  if (categorieRepli)
    notes.push(
      tr("Pas de tarif enfant publié : tarif « {categorie} » retenu pour l'enfant.", { categorie: tarif.libelleCategorie }),
    );
  if (ctx.perimetreRepli)
    notes.push(
      g.perimetre.type === "station"
        ? tr("Forfait « {nom} » : aucune grille pour le forfait du domaine.", { nom: g.perimetre.nom })
        : tr("Forfait « {nom} » : aucune grille pour le forfait de la station seule.", { nom: g.perimetre.nom }),
    );
  return {
    statut: "resolu",
    prix,
    devise: tarif.devise,
    periode: bornes(principale),
    periodes: liste.map(([p, n]) => ({ ...bornes(p), jours: n * facteur, prix: journee(p).prix })),
    calcul: "journees",
    duree: { demandee, retenue: 1, libelle: tarif.libelleDuree },
    joursSki: ctx.joursDemandes
      ? { premier: ctx.joursDemandes[0], dernier: ctx.joursDemandes[ctx.joursDemandes.length - 1] }
      : null,
    categorie: { cle: tarif.categorie, libelle: tarif.libelleCategorie },
    canal: tarif.canal,
    perimetre: g.perimetre,
    grille: {
      id: g.id,
      saison: g.saison,
      source: g.source,
      scrapeLe: g.scrapeLe,
      confiance: g.confiance,
    },
    fiabilite,
    drapeaux: {
      surDeuxPeriodes: liste.length > 1,
      dureeSuperieure: false,
      saisonAnterieure: ctx.saisonAnterieure,
      saisonEntiere,
      horsPeriodes,
      sansDates: ctx.sansDates,
      perimetreRepli: ctx.perimetreRepli,
      categorieRepli,
      journeesAdditionnees: true,
    },
    notes,
  };
}

function resoudreSurGrille(ctx: Contexte): Resolution {
  const { grille: g, categorie, jours, demandee } = ctx;
  const { accepte, repli: categorieRepli } = categorieDeLaGrille(g, categorie);
  const publiees = g.periodes.filter((p) => dureesPubliees(p, accepte).length);
  if (!publiees.length) {
    const autres = new Set<CategorieTarif>();
    for (const p of g.periodes)
      for (const t of p.tarifs) if (utilisable(t)) autres.add(t.categorie);
    return {
      statut: "categorie-absente",
      detail: `${g.perimetre.nom} ${g.saison} : aucun tarif ${categorie} publié`,
      categoriesDisponibles: [...autres].sort(),
      estimation: estimation(g, categorie, demandee),
    };
  }
  const couvre = (p: Periode) => dureeCouvrante(dureesPubliees(p, accepte), demandee) != null;
  if (!publiees.some(couvre)) {
    const journees = ctx.journees ? parJournees(ctx, accepte, categorieRepli) : null;
    if (journees) return journees;
    const toutes = [...new Set(publiees.flatMap((p) => dureesPubliees(p, accepte)))].sort(
      (a, b) => a - b,
    );
    return {
      statut: "duree-absente",
      detail: `${g.perimetre.nom} ${g.saison} : aucun forfait ${categorie} de ${demandee} jour${demandee > 1 ? "s" : ""} ou plus (publiés : ${toutes.join(", ")} j)`,
      dureesDisponibles: toutes,
    };
  }

  // Chaque jour de ski dans sa période.
  const touchees = new Map<Periode, number>();
  let horsPeriodes = false;
  for (const j of jours) {
    const r = periodeDuJour(j, publiees, couvre)!;
    if (!r.dedans) horsPeriodes = true;
    touchees.set(r.periode, (touchees.get(r.periode) ?? 0) + 1);
  }
  // Sans dates, la période la plus proche de la date du jour est la règle,
  // pas un à-peu-près.
  if (ctx.sansDates) horsPeriodes = false;
  const liste = [...touchees.entries()].sort(([a], [b]) => (a.debut < b.debut ? -1 : 1));

  // La durée : la plus courte qui couvre le séjour et que chaque période
  // touchée publie. Sinon, celle de la période majoritaire, seule.
  const communes = liste
    .map(([p]) => dureesPubliees(p, accepte))
    .reduce((acc, d) => acc.filter((x) => d.includes(x)));
  const commune = dureeCouvrante(communes, demandee);
  const calcul: Calcul =
    liste.length === 1 ? "une-periode" : commune != null ? "prorata" : "periode-majoritaire";

  // La période majoritaire, parmi celles qui publient un forfait assez long :
  // le plus de jours de ski ; à égalité, la plus chère, un budget ne devant
  // pas être sous-estimé.
  const avecForfait = liste.filter(([p]) => couvre(p));
  if (!avecForfait.length) {
    const journees = ctx.journees ? parJournees(ctx, accepte, categorieRepli) : null;
    if (journees) return journees;
    const toutes = [...new Set(liste.flatMap(([p]) => dureesPubliees(p, accepte)))].sort(
      (a, b) => a - b,
    );
    return {
      statut: "duree-absente",
      detail: `${g.perimetre.nom} ${g.saison} : aucun forfait ${categorie} de ${demandee} jour${demandee > 1 ? "s" : ""} ou plus sur ces dates (publiés : ${toutes.join(", ")} j)`,
      dureesDisponibles: toutes,
    };
  }
  const prixCouvrant = (p: Periode) =>
    tarifExact(p, accepte, commune ?? dureeCouvrante(dureesPubliees(p, accepte), demandee)!)!.prix;
  const principale = [...avecForfait].sort(
    ([pa, ja], [pb, jb]) => jb - ja || prixCouvrant(pb) - prixCouvrant(pa),
  )[0][0];
  const retenue = commune ?? dureeCouvrante(dureesPubliees(principale, accepte), demandee)!;
  const tarifPrincipal = tarifExact(principale, accepte, retenue)!;
  const detail = liste.map(([p, n]) => ({
    periode: p,
    jours: n,
    tarif: tarifExact(p, accepte, retenue),
  }));
  const prix =
    calcul === "prorata"
      ? arrondi(detail.reduce((s, x) => s + (x.jours / jours.length) * x.tarif!.prix, 0))
      : arrondi(tarifPrincipal.prix);

  const dureeSuperieure = retenue > demandee;
  const saisonEntiere =
    calcul === "prorata" ? liste.some(([p]) => p.saisonEntiere) : principale.saisonEntiere;

  const notes: string[] = [];
  let fiabilite: Fiabilite = g.confiance;
  if (ctx.sansDates)
    notes.push(
      tr("Sans dates de séjour : forfait {duree} de la période « {periode} ».", {
        duree: tarifPrincipal.libelleDuree,
        periode: principale.libelle,
      }),
    );
  if (calcul === "prorata")
    notes.push(
      tr("Séjour sur {n} périodes : {detail}, au prorata des jours de ski.", {
        n: liste.length,
        detail: detail
          .map((x) =>
            tr("{n} j en « {periode} » ({prix})", {
              n: x.jours,
              periode: x.periode.libelle,
              prix: montant(x.tarif!.prix, x.tarif!.devise),
            }),
          )
          .join(", "),
      }),
    );
  if (calcul === "periode-majoritaire") {
    notes.push(
      tr(
        "Séjour sur {n} périodes qui ne publient pas le même forfait : prix de « {periode} », qui compte le plus de jours de ski.",
        { n: liste.length, periode: principale.libelle },
      ),
    );
    fiabilite = ABAISSE[fiabilite];
  }
  if (dureeSuperieure)
    notes.push(
      trN(
        demandee,
        "Pas de forfait {n} jour publié : forfait {duree} retenu.",
        "Pas de forfait {n} jours publié : forfait {duree} retenu.",
        { duree: tarifPrincipal.libelleDuree },
      ),
    );
  if (horsPeriodes) {
    notes.push(
      tr("Des jours de ski tombent hors des périodes publiées : la période la plus proche a été prise."),
    );
    fiabilite = ABAISSE[fiabilite];
  }
  if (ctx.saisonAnterieure) {
    notes.push(tr("Grille de la saison {saison}, antérieure au séjour : prix à confirmer.", { saison: g.saison }));
    fiabilite = "faible";
  }
  if (saisonEntiere) notes.push(tr("Prix publié sans période : il vaut pour la saison entière."));
  if (categorieRepli)
    notes.push(
      tr("Pas de tarif enfant publié : tarif « {categorie} » retenu pour l'enfant.", {
        categorie: tarifPrincipal.libelleCategorie,
      }),
    );
  if (ctx.perimetreRepli)
    notes.push(
      g.perimetre.type === "station"
        ? tr("Forfait « {nom} » : aucune grille pour le forfait du domaine.", { nom: g.perimetre.nom })
        : tr("Forfait « {nom} » : aucune grille pour le forfait de la station seule.", { nom: g.perimetre.nom }),
    );

  return {
    statut: "resolu",
    prix,
    devise: tarifPrincipal.devise,
    periode: bornes(principale),
    periodes: detail.map((x) => ({
      ...bornes(x.periode),
      jours: x.jours,
      prix: x.tarif?.prix ?? null,
    })),
    calcul,
    duree: { demandee, retenue, libelle: tarifPrincipal.libelleDuree },
    joursSki: ctx.joursDemandes
      ? { premier: ctx.joursDemandes[0], dernier: ctx.joursDemandes[ctx.joursDemandes.length - 1] }
      : null,
    categorie: { cle: tarifPrincipal.categorie, libelle: tarifPrincipal.libelleCategorie },
    canal: tarifPrincipal.canal,
    perimetre: g.perimetre,
    grille: {
      id: g.id,
      saison: g.saison,
      source: g.source,
      scrapeLe: g.scrapeLe,
      confiance: g.confiance,
    },
    fiabilite,
    drapeaux: {
      surDeuxPeriodes: liste.length > 1,
      dureeSuperieure,
      saisonAnterieure: ctx.saisonAnterieure,
      saisonEntiere,
      horsPeriodes,
      sansDates: ctx.sansDates,
      perimetreRepli: ctx.perimetreRepli,
      categorieRepli,
      journeesAdditionnees: false,
    },
    notes,
  };
}

/* ---------- Point d'entrée ---------- */

/** Durée de référence sans dates de séjour : le 6 jours. */
export const JOURS_SANS_DATES = 6;

/**
 * L'âge au-delà duquel une grille n'est plus reprise : trois saisons. Pour un
 * séjour en 2026-27, une grille de 2023-24 vaut encore (signalée), une de
 * 2022-23 non : le prix est « non publié ».
 */
export const AGE_MAX_SAISONS = 3;

const anneeDe = (saison: string) => Number(saison.slice(0, 4));

/**
 * Le prix applicable d'un forfait, pour une station et un séjour.
 *
 * `dates` à `null` : le 6 jours de la période qui contient `aujourdhui`, à
 * défaut de la plus proche. Le résultat dit toujours la période retenue (son
 * libellé, ses bornes), la durée, le périmètre et la fiabilité ; un échec dit
 * pourquoi (pas de grille, catégorie ou durée non publiée, dates illisibles).
 *
 * La meilleure grille qui publie le forfait demandé est retenue ; si aucune
 * ne le publie, la réponse est celle de la meilleure grille, qui dit ce qui
 * manque.
 */
export function resolvePassPrice(
  station: { id: string },
  dates: DatesSejour | null,
  options: OptionsResolution,
): Resolution {
  const categorie = options.categorie ?? "adulte";
  let jours: string[];
  let sansDates = false;
  if (dates) {
    const j = joursDeSki(dates, options.joursSki);
    if (!j)
      return {
        statut: "dates-invalides",
        detail: `dates illisibles ou séjour sans nuit : du ${dates.arrivee} au ${dates.depart}`,
      };
    jours = j;
  } else {
    if (!dateValide(options.aujourdhui))
      return {
        statut: "dates-invalides",
        detail: `date du jour illisible : ${options.aujourdhui}`,
      };
    jours = [options.aujourdhui];
    sansDates = true;
  }
  const saison = saisonDeJour(jours[0])!;
  const toutes = grillesCandidates(station.id, saison, options);
  const candidates = toutes.filter((g) => anneeDe(saison) - anneeDe(g.saison) <= AGE_MAX_SAISONS);
  if (!candidates.length) {
    const recente = toutes
      .map((g) => g.saison)
      .sort()
      .pop();
    return recente
      ? {
          statut: "grille-ancienne",
          detail: `grille la plus récente pour ${station.id} : ${recente}, plus de ${AGE_MAX_SAISONS} saisons avant ${saison}`,
        }
      : {
          statut: "grille-absente",
          detail: `aucune grille de forfait pour ${station.id} en ${saison} ni avant`,
        };
  }

  const relie = domaineRelie(station.id, options.grilles);
  const voulu = options.perimetreCle
    ? (g: GrilleTarifaire) => g.perimetre.cle === options.perimetreCle
    : (g: GrilleTarifaire) => equivalent(g, options.perimetre ?? "domaine", relie);
  const demandee = sansDates ? JOURS_SANS_DATES : jours.length;
  // Deux passages : les forfaits publiés d'abord, sur toutes les grilles ;
  // les journées additionnées ensuite, seulement si aucune grille de la
  // station ne publie de forfait assez long (la station ne vend que la
  // journée).
  let premiere: Resolution | null = null;
  for (const journees of [false, true]) {
    for (const g of candidates) {
      const ecart = anneeDe(saison) - anneeDe(g.saison);
      const r = resoudreSurGrille({
        grille: g,
        categorie,
        jours: ecart ? jours.map((j) => decalerAnnees(j, -ecart)) : jours,
        joursDemandes: sansDates ? null : jours,
        demandee,
        saisonAnterieure: ecart > 0,
        sansDates,
        perimetreRepli: !voulu(g),
        journees,
      });
      if (r.statut === "resolu") return r;
      premiere ??= r;
    }
  }
  return premiere!;
}
