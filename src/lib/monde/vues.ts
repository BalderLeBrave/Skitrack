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
  source: "skiinfo" | "skiresort" | "officiel";
  /** Le slug de la fiche d'où vient l'image, pour qu'un doute se vérifie. */
  cle: string;
  nom: string | null;
  km: number;
  url: string;
  /** La légende du site, quand il en donne une : « Vue sur Verbier ». */
  titre: string | null;
  servi: boolean;
};

export type ForfaitVue = {
  source: "skiinfo" | "skiresort";
  cle: string;
  nom: string | null;
  km: number;
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

const distance = (km: number): string =>
  km < 0.1 ? "au même point" : `à ${km.toFixed(1).replace(".", ",")} km`;

const SITE: Record<"skiinfo" | "skiresort" | "officiel", string> = {
  skiinfo: "Skiinfo",
  skiresort: "skiresort.fr",
  officiel: "le site officiel de la station",
};

/** Ce qu'on écrit sous une photo : d'où elle vient, et à quelle distance. */
export function mentionPhoto(p: PhotoVue): string {
  const legende = p.titre ? ` — « ${p.titre} »` : "";
  // Le site officiel *est* celui du domaine : il n'y a pas de fiche voisine à
  // nommer ni de distance à donner. Écrire « à 0 km » laisserait croire à une
  // mesure là où il y a une identité.
  if (p.source === "officiel") return `Photo publiée par ${SITE.officiel} (${p.cle})${legende}`;
  return `Photo ${SITE[p.source]}${legende}, fiche « ${p.nom ?? p.cle} », ${distance(p.km)}`;
}

/** Ce qu'on écrit à côté d'un prix, pour qu'il se lise sans ouvrir le code. */
export function mentionForfait(f: ForfaitVue): string {
  const quoi =
    f.source === "skiinfo"
      ? `grille de ${f.lignes.length} forfait${f.lignes.length > 1 ? "s" : ""}`
      : "un seul tarif publié";
  const maj = f.misAJour ? `, mis à jour le ${f.misAJour}` : "";
  const dev = f.deviseSource === "pays" ? " ; devise déduite du pays, le site n'écrit qu'un symbole" : "";
  // Une contradiction se dit, elle ne se corrige pas : on ne sait pas laquelle
  // des deux sources a tort, et trancher reviendrait à réécrire l'une d'elles.
  const ecart = f.deviseDuPays
    ? ` ; le site publie en ${f.devise} alors que le pays est en ${f.deviseDuPays}`
    : "";
  return `${SITE[f.source]} — ${quoi}${maj}, fiche « ${f.nom ?? f.cle} », ${distance(f.km)}${dev}${ecart}`;
}
