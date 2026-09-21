/**
 * Ce qu'un domaine sait montrer : sa photo et son forfait.
 *
 * Remplace `photos.ts` et `forfaits.ts`, qui lisaient deux fichiers issus de
 * deux appariements séparés. Rien ne garantissait qu'ils tombent sur la même
 * fiche : un domaine pouvait afficher la photo d'une station et le prix d'une
 * autre, à quatre kilomètres de là, et l'écran les présentait ensemble sans
 * que rien ne le dise.
 *
 * ## Les trois règles que ce module tient
 *
 * 1. **Un prix reste dans sa devise.** skiresort publie une conversion en
 *    euros qu'il marque lui-même « env. », sans taux ni date. Elle n'entre pas
 *    ici. `devises.ts` sait écrire les quinze devises du relevé.
 * 2. **Une transformation d'image ne s'invente pas.** Elle n'est appliquée
 *    qu'aux hôtes dont on l'a vérifiée.
 * 3. **Une photo vers un hôte muet est une absence**, pas une image cassée.
 *
 * ## Ce que les sources ne donnent pas
 *
 * **Aucune ne publie de prix par période dans la saison.** Un forfait de
 * décembre coûte souvent moins cher qu'un forfait de février ; ni Skiinfo ni
 * skiresort ne l'écrit — vérifié sur Zermatt, Tignes et Les Arcs. Ce que
 * Skiinfo distingue, c'est la **semaine et le week-end**, et c'est relevé tel
 * quel, comme deux lignes.
 */

import { montant } from "../devises.ts";

export type Categorie = { nom: string; ages: string | null };
export type LigneForfait = { libelle: string; prix: (number | null)[] };

export type PhotoVue = {
  source: "skiinfo" | "skiresort" | "bergfex" | "officiel";
  /** Le slug de la fiche d'où vient l'image, pour qu'un doute se vérifie. */
  cle: string;
  nom: string | null;
  km: number;
  /** Le rattachement a-t-il été corroboré par le nom ? */
  parLeNom?: true;
  url: string;
  /** La légende du site, quand il en donne une : « Vue sur Verbier ». */
  titre: string | null;
  servi: boolean;
};

export type ForfaitVue = {
  source: "skiinfo" | "skiresort" | "bergfex";
  cle: string;
  nom: string | null;
  km: number;
  /** Le rattachement a-t-il été corroboré par le nom ? */
  parLeNom?: true;
  devise: string | null;
  deviseSource: string | null;
  /** La devise du pays, quand elle contredit celle que la page publie. */
  deviseDuPays: string | null;
  misAJour: string | null;
  categories: Categorie[];
  lignes: LigneForfait[];
  saison: {
    libelle: string;
    validite: string | null;
    categories: Categorie[];
    prix: (number | null)[];
  } | null;
  /**
   * Les grilles **datées**, une par plage de dates.
   *
   * Seule bergfex en publie. C'est ce qui permet de dire qu'un forfait de
   * décembre ne coûte pas celui de février — Kitzsteinhorn vaut 74 € du
   * 27 novembre au 18 décembre et 82 € du 19 décembre au 12 mars.
   *
   * Une plage, pas un tableau : le site publie parfois plusieurs tableaux sous
   * la même plage — points, saison, cartes diverses —, et les compter comme
   * des périodes ferait croire à une variation qui n'existe pas.
   */
  periodes: PeriodeVue[] | null;
};

export type PeriodeVue = {
  /** « 19.12.26 - 12.03.27 », telle que le site l'écrit. */
  dates: string;
  categories: string[];
  lignes: LigneForfait[];
};

export type ReleveVues = {
  calcule: string;
  quoi: string;
  regle: string;
  rayonKm: number;
  avertissement: string;
  domaines: number;
  avecPhoto: number;
  avecForfait: number;
  vues: Record<string, { photo: PhotoVue | null; forfait: ForfaitVue | null }>;
};

let enCours: Promise<ReleveVues> | null = null;

/** Le relevé, chargé à la demande : un écran qui n'affiche rien n'en paie pas
 *  le poids. Même porte que `releveDem()`. */
export function releveVues(): Promise<ReleveVues> {
  enCours ??= import("./data/vuesDomaines.json", { with: { type: "json" } }).then(
    (m) => m.default as ReleveVues,
  );
  return enCours;
}

/** Les hôtes dont on a vérifié qu'ils acceptent les paramètres de taille. */
const TRANSFORME = new Set(["cdn.bfldr.com"]);

/**
 * L'adresse à mettre dans un `src`, à la largeur voulue.
 *
 * Mesuré le 21 septembre 2026 sur `cdn.bfldr.com`, même image : 2 157 ko en
 * PNG, 312 ko en WebP, 61 ko en WebP à 640 px. Servir l'adresse publiée telle
 * quelle dans une liste de cent lignes ferait deux cents mégaoctets.
 *
 * Sur un hôte dont on n'a pas vérifié les paramètres — `www.skiresort.fr` sert
 * déjà des images de 933 px, ce qui convient —, l'adresse sort **inchangée** :
 * inventer une transformation qu'il ignore rendrait au mieux l'image entière,
 * au pire une erreur.
 */
export function vignette(url: string, largeurPx: number): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (!TRANSFORME.has(u.host)) return url;
  u.searchParams.set("format", "webp");
  u.searchParams.set("width", String(Math.round(largeurPx)));
  u.searchParams.set("auto", "webp");
  return u.toString();
}

/** La photo d'un domaine, prête à afficher, ou `null`. */
export function photoDuDomaine(
  releve: ReleveVues,
  id: string,
  largeurPx = 400,
): { src: string; source: PhotoVue } | null {
  const p = releve.vues[id]?.photo;
  if (!p || !p.servi) return null;
  return { src: vignette(p.url, largeurPx), source: p };
}

export function forfaitDuDomaine(releve: ReleveVues, id: string): ForfaitVue | null {
  return releve.vues[id]?.forfait ?? null;
}

/**
 * Le prix d'une case de la grille, écrit pour l'écran, ou `null`.
 *
 * `null` dès qu'il manque la valeur **ou** la devise. Écrire « 300 » sans dire
 * de quoi serait pire que de ne rien écrire : le lecteur y mettrait la sienne.
 */
export function prix(valeur: number | null | undefined, devise: string | null): string | null {
  if (valeur == null || !devise) return null;
  return montant(valeur, devise);
}

/**
 * La ligne « journée » de la grille, celle qu'on montre en premier.
 *
 * Skiinfo nomme la sienne « Forfait journée » ; skiresort, « Forfait
 * journalier Haute saison ». On cherche donc le mot, pas l'égalité — et on se
 * rabat sur la première ligne, qui est la plus courte durée partout.
 */
export function ligneJournee(f: ForfaitVue): LigneForfait | null {
  const jour = f.lignes.find((l) => /journ[ée]/i.test(l.libelle) && !/week-end/i.test(l.libelle));
  return jour ?? f.lignes[0] ?? null;
}

/** L'indice de la colonne « adulte », ou le dernier à défaut : les grilles
 *  rangent les classes du plus jeune au plus âgé, l'adulte n'est jamais en
 *  tête. */
export function colonneAdulte(f: ForfaitVue): number {
  const i = f.categories.findIndex((c) => /adulte/i.test(c.nom));
  return i >= 0 ? i : Math.max(0, f.categories.length - 1);
}

/**
 * Comment se dit un rattachement.
 *
 * Au-delà du rayon de base, il a fallu que **le nom corrobore** : Hochkönig et
 * la fiche `hochkoenig` sont à sept kilomètres et sont la même station. Le
 * dire change ce que le lecteur doit en penser — sept kilomètres sans le nom
 * seraient douteux, sept kilomètres avec le nom ne le sont pas.
 */
const distance = (km: number, parLeNom?: true): string => {
  if (km < 0.1) return "au même point";
  const d = `à ${km.toFixed(1).replace(".", ",")} km`;
  return parLeNom ? `${d}, rapprochée par le nom` : d;
};

const SITE: Record<"skiinfo" | "skiresort" | "bergfex" | "officiel", string> = {
  skiinfo: "Skiinfo",
  skiresort: "skiresort.fr",
  bergfex: "bergfex",
  officiel: "le site officiel de la station",
};

/** Ce qu'on écrit sous une photo : d'où elle vient, et à quelle distance. */
export function mentionPhoto(p: PhotoVue): string {
  const legende = p.titre ? ` — « ${p.titre} »` : "";
  // Le site officiel *est* celui du domaine : il n'y a pas de fiche voisine à
  // nommer ni de distance à donner. Écrire « à 0 km » laisserait croire à une
  // mesure là où il y a une identité.
  if (p.source === "officiel") return `Photo publiée par ${SITE.officiel} (${p.cle})${legende}`;
  return `Photo ${SITE[p.source]}${legende}, fiche « ${p.nom ?? p.cle} », ${distance(p.km, p.parLeNom)}`;
}

/**
 * Le tarif d'une journée pour chaque période, adulte.
 *
 * Rend une entrée par plage de dates, dans l'ordre où le site les publie.
 * Vide quand la source ne date pas ses tarifs — ce qui est le cas de toutes
 * sauf bergfex.
 */
export function journeeParPeriode(f: ForfaitVue): { dates: string; prix: number | null }[] {
  if (!f.periodes?.length) return [];
  return f.periodes.map((p) => {
    const ligne =
      p.lignes.find((l) => /^1\s/.test(l.libelle) && !/\d{1,2}:\d{2}/.test(l.libelle)) ?? p.lignes[0];
    const i = p.categories.findIndex((c) => /adulte|erwachsen/i.test(c));
    return { dates: p.dates, prix: ligne?.prix[i >= 0 ? i : 0] ?? null };
  });
}

/**
 * La fourchette d'un forfait journée, quand elle varie selon la période.
 *
 * `null` quand il n'y a qu'un prix : écrire « 74 à 74 € » n'apprendrait rien.
 * Le but est de dire d'un coup d'œil que **le prix dépend de la date**, ce
 * qu'un montant unique cache.
 */
export function fourchetteJournee(f: ForfaitVue): { bas: number; haut: number } | null {
  const prix = journeeParPeriode(f)
    .map((p) => p.prix)
    .filter((p): p is number => p != null);
  if (prix.length < 2) return null;
  const bas = Math.min(...prix);
  const haut = Math.max(...prix);
  return haut > bas ? { bas, haut } : null;
}

/** Ce qu'on écrit à côté d'un prix, pour qu'il se lise sans ouvrir le code. */
export function mentionForfait(f: ForfaitVue): string {
  const plages = f.periodes?.length ?? 0;
  const quoi =
    plages > 1
      ? `${plages} périodes tarifaires datées`
      : f.source === "bergfex"
        ? "une grille datée"
        : f.source === "skiinfo"
          ? `grille de ${f.lignes.length} forfait${f.lignes.length > 1 ? "s" : ""}`
          : "un seul tarif publié";
  const maj = f.misAJour ? `, mis à jour le ${f.misAJour}` : "";
  const dev = f.deviseSource === "pays" ? " ; devise déduite du pays, le site n'écrit qu'un symbole" : "";
  // Une contradiction se dit, elle ne se corrige pas : on ne sait pas laquelle
  // des deux sources a tort, et trancher reviendrait à réécrire l'une d'elles.
  const ecart = f.deviseDuPays
    ? ` ; le site publie en ${f.devise} alors que le pays est en ${f.deviseDuPays}`
    : "";
  return `${SITE[f.source]} — ${quoi}${maj}, fiche « ${f.nom ?? f.cle} », ${distance(f.km, f.parLeNom)}${dev}${ecart}`;
}
