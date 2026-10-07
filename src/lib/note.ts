/**
 * Les notes d'avis, toutes ramenées sur 5. **Une seule conversion**, ici :
 * aucun collecteur ni écran ne divise une note de son côté.
 *
 * - Échelle 5 : la note telle quelle. Échelle 10 : divisée par 2 (9,6 / 10 →
 *   4,8 / 5). Échelle 100 (pourcentage) : divisée par 20 (80 → 4,0).
 * - Une décimale, arrondie au demi supérieur : 4,86 → 4,9 ; 4,84 → 4,8 ; 4,85
 *   → 4,9.
 * - Échelle inconnue ou absente, note absente, non numérique, négative, nulle
 *   ou au-dessus de son échelle : `null`. On ne devine pas une échelle, et on
 *   n'invente pas un zéro : une note de 0 est celle d'une annonce sans avis.
 *
 * L'écran, les filtres et le tri ne lisent que la note sur 5 ; la note brute
 * et son échelle ne se gardent que pour contrôle, jamais affichées. Un seul
 * affichage : « 4,8 / 5 · 120 avis ».
 *
 * Module pur, chargé tel quel par `node --experimental-strip-types`.
 */

import { tr, trN } from "./i18n/tr.ts";
import { langueIntl } from "./i18n/langue.ts";

/** Les échelles qu'une source peut écrire. */
export type EchelleNote = 5 | 10 | 100;

export const ECHELLES_NOTE: readonly EchelleNote[] = [5, 10, 100];

/** Une échelle reconnue, ou `null`. */
export function echelleNote(e: unknown): EchelleNote | null {
  return e === 5 || e === 10 || e === 100 ? e : null;
}

/** Arrondi à une décimale, le demi vers le haut, sans l'erreur binaire qui
 *  fait de 4,85 × 10 un 48,4999… */
export function arrondiUneDecimale(x: number): number {
  return Math.round(Number((x * 10).toFixed(6))) / 10;
}

/** Une note publiée, lue comme un nombre : « 9,6 » et « 9.6 » valent 9,6. */
function nombre(note: unknown): number | null {
  if (typeof note === "number") return Number.isFinite(note) ? note : null;
  if (typeof note !== "string") return null;
  const t = note.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * La note sur 5, une décimale, ou `null`. Voir l'en-tête : une échelle
 * inconnue, une note hors de ses bornes ou nulle ne donnent rien.
 */
export function noterSur5(note: unknown, echelle: unknown): number | null {
  const e = echelleNote(echelle);
  const n = nombre(note);
  if (e == null || n == null) return null;
  if (n <= 0 || n > e) return null;
  return arrondiUneDecimale((n * 5) / e);
}

/** « 4,8 / 5 » (« 4.8 / 5 » en anglais). `null` sans note. */
export function noteSur5Lbl(noteSur5: number | null | undefined): string | null {
  if (noteSur5 == null || !Number.isFinite(noteSur5) || noteSur5 <= 0 || noteSur5 > 5) return null;
  const n = new Intl.NumberFormat(langueIntl(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(noteSur5);
  return tr("{note} / 5", { note: n });
}

/**
 * « 4,8 / 5 · 120 avis », « 4,8 / 5 » sans compte publié. Sans note, rien :
 * un nombre d'avis seul n'est pas une note, et 0 avis n'en fait pas une.
 */
export function noteEtAvisLbl(
  noteSur5: number | null | undefined,
  nombre?: number | null,
): string | null {
  const note = noteSur5Lbl(noteSur5);
  if (!note) return null;
  if (nombre == null || !Number.isInteger(nombre) || nombre <= 0) return note;
  return trN(nombre, "{note} · {n} avis", "{note} · {n} avis", { note });
}
