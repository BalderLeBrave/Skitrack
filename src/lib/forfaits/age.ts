/**
 * Ce qu'un écran écrit à propos d'un tarif — en **trois champs séparés**.
 *
 * Un seul libellé empilait tout : « tarif non à jour, relevé le 11/08/2026 :
 * HTTP 403, forfait à confirmer ». Quatre informations de nature différente,
 * sans hiérarchie, dont un code HTTP que personne ne peut utiliser.
 *
 * Séparées :
 *
 * - **fraîcheur** — la date du dernier relevé réussi, et son ancienneté dite
 *   simplement. C'est ce qui se lit en premier ;
 * - **fiabilité** — tarif confirmé, à confirmer, saisi à la main, estimé, ou
 *   jamais obtenu ;
 * - **cause technique** — le code, le message d'erreur. Elle ne paraît que
 *   dans un détail repliable ou dans le journal, jamais dans le libellé
 *   principal.
 *
 * Règle qui gouverne le reste : **un tarif ancien reste affiché avec sa date**
 * plutôt que remplacé par une erreur ; **un tarif jamais obtenu invite à le
 * saisir**, il n'affiche pas un code HTTP.
 */

import { montant } from "../devises.ts";
import type { ForfaitRow } from "./types.ts";

/**
 * Un tarif de forfait, dans la devise de son domaine.
 *
 * Le nom `formatEuroTarif` mentait dès qu'un tarif suisse existait ; il reste
 * comme raccourci, parce que des écrans l'emploient, mais il ne décrit plus
 * la règle.
 */
export function formatTarif(n: number | null | undefined, devise = "EUR"): string {
  return montant(n, devise);
}

/** L'euro, cas particulier de `formatTarif`. */
export function formatEuroTarif(n: number | null | undefined): string {
  return formatTarif(n, "EUR");
}

export type Fiabilite = "confirme" | "a-confirmer" | "manuel" | "estime" | "jamais";

export const FIABILITE_LBL: Record<Fiabilite, string> = {
  confirme: "tarif confirmé",
  "a-confirmer": "tarif à confirmer",
  manuel: "tarif saisi manuellement",
  estime: "estimation, hors coût officiel",
  jamais: "tarif à saisir",
};

export type EtatTarif = {
  /** « relevé le 11/08/2026 · il y a un mois », ou `null` si jamais relevé. */
  fraicheur: string | null;
  fiabilite: Fiabilite;
  fiabiliteLbl: string;
  /** Cause technique. Détail repliable et journal seulement. */
  cause: string | null;
  /** Le tarif porte-t-il un montant ? */
  chiffre: boolean;
};

const JOUR_MS = 86_400_000;

/** L'ancienneté, en clair, sans précision trompeuse. */
export function anciennete(atMs: number, now = Date.now()): string {
  const d = Math.max(0, now - atMs);
  if (d < 3_600_000) return "il y a moins d'une heure";
  if (d < JOUR_MS) return `il y a ${Math.max(1, Math.round(d / 3_600_000))} h`;
  const jours = Math.round(d / JOUR_MS);
  if (jours === 1) return "hier";
  if (jours < 30) return `il y a ${jours} jours`;
  const mois = Math.round(jours / 30);
  if (mois < 12) return `il y a ${mois} mois`;
  const ans = Math.round(mois / 12);
  return ans <= 1 ? "il y a un an" : `il y a ${ans} ans`;
}

function dateFr(atMs: number): string {
  return new Date(atMs).toLocaleDateString("fr-FR");
}

export function etatTarif(row: ForfaitRow, now = Date.now()): EtatTarif {
  const chiffre = row.j1 != null || row.j6 != null;
  const at = row.fetchedAt ? Date.parse(row.fetchedAt) : NaN;
  const fraicheur = Number.isFinite(at)
    ? `relevé le ${dateFr(at)} · ${anciennete(at, now)}`
    : null;
  const cause = row.lastError ?? null;

  if (row.status === "manuel" || row.locked) {
    return { fraicheur, fiabilite: "manuel", fiabiliteLbl: FIABILITE_LBL.manuel, cause: null, chiffre };
  }
  if (row.status === "estimé") {
    return { fraicheur: null, fiabilite: "estime", fiabiliteLbl: FIABILITE_LBL.estime, cause, chiffre };
  }
  if (!chiffre) {
    // Jamais obtenu : on invite à saisir. Le code HTTP part au détail.
    return { fraicheur: null, fiabilite: "jamais", fiabiliteLbl: FIABILITE_LBL.jamais, cause, chiffre };
  }
  if (row.status === "ok") {
    return { fraicheur, fiabilite: "confirme", fiabiliteLbl: FIABILITE_LBL.confirme, cause: null, chiffre };
  }
  // « stale » ou « erreur » avec un montant : le montant reste, avec sa date.
  return { fraicheur, fiabilite: "a-confirmer", fiabiliteLbl: FIABILITE_LBL["a-confirmer"], cause, chiffre };
}

/** La seule fraîcheur, pour les écrans qui n'ont la place que d'une ligne. */
export function formatForfaitAge(row: ForfaitRow, now = Date.now()): string {
  const e = etatTarif(row, now);
  return e.fraicheur ?? e.fiabiliteLbl;
}

export function forfaitConfirmLabel(row: ForfaitRow, now = Date.now()): string | null {
  const e = etatTarif(row, now);
  return e.fiabilite === "confirme" ? null : e.fiabiliteLbl;
}
