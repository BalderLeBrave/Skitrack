/**
 * Le contrat d'un connecteur de centrale.
 *
 * **Un fichier par centrale.** C'est la règle d'architecture, et elle a une
 * raison : un connecteur qui casse ne doit pas emporter les autres. Chaque
 * fichier ne porte que ce qui lui est propre — son hôte, le chemin de sa
 * recherche, les particularités de son gabarit.
 *
 * **Un module par moteur**, que ces fichiers importent. Les centrales ne sont
 * pas soixante-sept sites différents : ce sont quelques moteurs mutualisés
 * sous autant d'habillages (`docs/centrales/audit.md`, § 3). Recopier
 * l'analyseur d'Open System dans sept fichiers le ferait diverger à la
 * première correction.
 *
 * Les deux règles tiennent ensemble : l'isolement porte sur la centrale, la
 * logique sur le moteur.
 */

import type { Listing } from "@/lib/listings";
import type { LiveSearchInput } from "../types";

/**
 * Les moteurs relevés par l'audit. `inconnu` est un constat, pas un défaut.
 *
 * `MSEM` s'appelait `Ublo` au relevé du 13 septembre 2026, et c'était une
 * erreur de nom : Ublo est le gestionnaire de contenu qui fabrique le site, et
 * il ne vend rien. Ce qui vend est « Mon Séjour En Montagne », chargé à part.
 * Les tableaux de `docs/centrales/audit.md` gardent l'ancien nom ; sa section 9
 * explique pourquoi.
 */
export type MoteurCentrale =
  | "Open System"
  | "MSEM"
  | "Ingénie"
  | "Diffusio"
  | "Deskline / Feratel"
  | "Elloha"
  | "inconnu";

/** Ce qu'un connecteur reçoit : la demande, et l'origine de sa centrale. */
export type ContexteCentrale = LiveSearchInput & {
  /** Origine de la centrale, sans barre finale. */
  base: string;
};

export type Connecteur = {
  /** L'hôte, tel que `centrales.data.json` l'écrit. C'est la clé du registre. */
  host: string;
  nom: string;
  moteur: MoteurCentrale;
  /**
   * Pourquoi cette centrale n'est pas interrogée, quand elle ne l'est pas.
   *
   * Un connecteur sans `chercher` n'est pas un oubli : c'est une centrale dont
   * on sait qu'on ne peut pas l'interroger, et la phrase dit pourquoi. Elle
   * remonte telle quelle dans le rapport de source, pour que l'écran puisse
   * l'écrire au lieu de laisser un vide.
   */
  indisponible?: string;
  /** Rend les annonces disponibles aux dates demandées. Total de séjour, jamais
   *  un « à partir de » : le dépôt refuse les seconds. */
  chercher?: (ctx: ContexteCentrale) => Promise<Listing[]>;
};

/** Ce qu'une recherche de centrale rend, avec de quoi l'expliquer. */
export type ResultatCentrale = {
  listings: Listing[];
  /** Hôte interrogé, ou qui aurait dû l'être. */
  host: string | null;
  nom: string | null;
  moteur: MoteurCentrale | null;
  /**
   * La centrale a-t-elle été appelée ?
   *
   * Distingue les deux zéros, qui ne veulent pas dire la même chose : une
   * centrale appelée qui n'a rien de libre à ces dates, et une centrale qu'on
   * n'a pas appelée du tout. Le premier zéro est un renseignement, le second
   * une lacune, et l'écran ne doit pas les confondre.
   */
  interrogee: boolean;
  /** Phrase prête à lire quand rien n'a été relevé. `null` si tout va bien. */
  raison: string | null;
};
