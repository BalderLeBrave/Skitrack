/**
 * La voie de récupération retenue pour chaque domaine, et son historique
 * d'échecs.
 *
 * Face à un HTTP 403, l'ancien relevé enchaînait les huit chemins candidats,
 * encaissait huit refus, et recommençait au tour suivant de la file — une
 * reprise en boucle contre un site qui vient de dire non. Le registre ci-dessous
 * garde par domaine **la voie retenue** :
 *
 * - `auto` : la page tarifs se lit, le relevé automatique continue ;
 * - `ouverte` : une source en données ouvertes est utilisée à la place ;
 * - `manuelle` : la source refuse les robots (403, ou `Disallow` dans son
 *   robots.txt). Rien n'est contourné : l'écran ouvre le lien officiel et
 *   propose la saisie assistée.
 *
 * Trois échecs consécutifs désactivent la source jusqu'à réactivation manuelle.
 * C'est une règle pure, testée sans réseau.
 */

export type Voie = "auto" | "ouverte" | "manuelle";

/** Une tentative, telle que le journal la garde. */
export type Tentative = {
  at: string;
  url: string;
  issue: "ok" | "refus" | "robots" | "panne" | "illisible";
  statut: number | null;
  message: string;
};

export const JOURNAL_MAX = 12;

export type EtatSource = {
  slug: string;
  voie: Voie;
  /** Échecs consécutifs. Remis à zéro par un relevé réussi. */
  echecs: number;
  /** Désactivée jusqu'à réactivation manuelle. */
  desactivee: boolean;
  /** La page qui a fonctionné, ou celle qu'il faut ouvrir à la main. */
  url: string | null;
  /** Dernière cause technique, pour le journal et le détail repliable. */
  cause: string | null;
  /** Horodatage de la dernière tentative. */
  tenteA: string | null;
  /** Le journal des tentatives, par station. La cause technique y vit ; elle
   *  n'a rien à faire dans le libellé principal. */
  journal: Tentative[];
};

/** Ajoute une tentative au journal, borné. */
export function noter(e: EtatSource, t: Tentative): EtatSource {
  return { ...e, journal: [t, ...e.journal].slice(0, JOURNAL_MAX) };
}

export const ECHECS_AVANT_ARRET = 3;

export function sourceNeuve(slug: string, url: string | null = null): EtatSource {
  return { slug, voie: "auto", echecs: 0, desactivee: false, url, cause: null, tenteA: null, journal: [] };
}

/** Le relevé a abouti : la voie reste automatique, le compteur repart à zéro. */
export function succes(e: EtatSource, url: string, quand: string): EtatSource {
  return { ...e, voie: "auto", echecs: 0, desactivee: false, url, cause: null, tenteA: quand };
}

/**
 * La source refuse les robots — 403, ou `Disallow` dans son robots.txt.
 *
 * Ce n'est pas un échec à réessayer : c'est une voie fermée. On bascule sur la
 * saisie assistée et on **ne relance pas** la source automatique.
 */
export function refuse(e: EtatSource, url: string | null, cause: string, quand: string): EtatSource {
  return { ...e, voie: "manuelle", echecs: 0, desactivee: false, url: url ?? e.url, cause, tenteA: quand };
}

/** Un échec ordinaire : réseau, page illisible, tarif introuvable. */
export function echec(e: EtatSource, cause: string, quand: string): EtatSource {
  const echecs = e.echecs + 1;
  return { ...e, echecs, desactivee: echecs >= ECHECS_AVANT_ARRET, cause, tenteA: quand };
}

/** Réactivation manuelle : le compteur repart, la voie automatique reprend. */
export function reactiver(e: EtatSource): EtatSource {
  return { ...e, echecs: 0, desactivee: false, voie: e.voie === "manuelle" ? "manuelle" : "auto" };
}

/** Peut-on tenter un relevé automatique ? */
export function tentable(e: EtatSource): boolean {
  return !e.desactivee && e.voie === "auto";
}

/** L'issue d'une tentative, en toutes lettres : le journal affichait les
 *  valeurs internes (« panne », « illisible »). */
export const TENTATIVE_LBL: Record<Tentative["issue"], string> = {
  ok: "tarif lu",
  refus: "accès refusé par le site",
  robots: "page interdite par le site (robots.txt)",
  panne: "page injoignable",
  illisible: "tarif introuvable dans la page",
};

/** Ce que l'écran écrit pour la voie retenue. */
export const VOIE_LBL: Record<Voie, string> = {
  auto: "relevé automatique",
  ouverte: "données ouvertes",
  manuelle: "saisie assistée",
};
