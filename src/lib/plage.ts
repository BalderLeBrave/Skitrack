/**
 * Les fourchettes de filtre, communes à tous les écrans.
 *
 * Un filtre chiffré est une fourchette sur une échelle : deux bornes, et
 * `null` quand il couvre toute l'échelle — il ne filtre pas. Les bornes se
 * posent au curseur (arrondies au pas) ou se tapent dans les deux champs
 * (gardées telles quelles, seulement ramenées dans l'échelle). La borne haute
 * au maximum de l'échelle ne plafonne pas : « et plus » ; la borne basse au
 * minimum n'impose pas de plancher : « jusqu'à ».
 *
 * Écrit d'abord pour « Prix par station » (`prix/calcul.ts`, qui en garde les
 * noms), sorti ici quand l'accueil, Comparer, Logements, `/carte` et `/monde`
 * ont quitté leurs seuils à une seule poignée pour des fourchettes.
 *
 * Chargé tel quel par `node --experimental-strip-types` : aucun alias `@/`.
 */

import { entier } from "./nombres.ts";
import { tr } from "./i18n/tr.ts";

/** `null` : toute l'échelle, la plage ne filtre pas. */
export type Plage = readonly [number, number] | null;
/** Les deux bouts d'un curseur. */
export type Echelle = readonly [number, number];

/**
 * Pose une poignée ; les deux ne se croisent pas. Toute l'échelle couverte,
 * la plage redevient `null`.
 *
 * Au curseur ou au clavier, la valeur s'arrondit au pas. **Tapée**
 * (`exact`), elle est gardée telle quelle : 1 850 m reste 1 850 m sur un
 * curseur qui avance de 100 en 100. Dans les deux cas, elle est ramenée dans
 * l'échelle.
 */
export function poserBorne(
  pl: Plage,
  b: Echelle,
  pas: number,
  which: 0 | 1,
  v: number,
  exact = false,
): Plage {
  if (!Number.isFinite(v)) return pl;
  const cur = pl ?? b;
  const brut = exact || !(pas > 0) ? v : Math.round(v / pas) * pas;
  const x = Math.min(b[1], Math.max(b[0], brut));
  const next: readonly [number, number] =
    which === 0 ? [Math.min(x, cur[1]), cur[1]] : [cur[0], Math.max(x, cur[0])];
  if (next[0] <= b[0] && next[1] >= b[1]) return null;
  return next;
}

/** La poignée qu'un clic sur la piste déplace. Poignées confondues : celle
 *  du côté du clic, sinon aucune ne pourrait plus s'écarter de l'autre. */
export function poigneeProche(v: number, cur: readonly [number, number]): 0 | 1 {
  if (cur[0] === cur[1]) return v < cur[0] ? 0 : 1;
  return Math.abs(v - cur[0]) <= Math.abs(v - cur[1]) ? 0 : 1;
}

/** « 1 200 € » → 1200, « 1,5 » → 1.5 ; ce qui n'est pas un nombre → `null`. */
export function lireSaisie(texte: string): number | null {
  const c = texte.replace(/[^\d.,-]/g, "").replace(",", ".");
  if (c === "") return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}

/**
 * La valeur passe-t-elle la fourchette ?
 *
 * Une plage active écarte une valeur absente : une absence n'est pas un zéro,
 * et une station dont le champ n'est pas relevé ne « passe » pas un seuil. Une
 * borne posée au bout de l'échelle ne borne pas : « et plus », « jusqu'à ».
 */
export function dansPlage(v: number | null | undefined, pl: Plage, b: Echelle): boolean {
  if (pl == null) return true;
  if (v == null || !Number.isFinite(v)) return false;
  if (pl[0] > b[0] && v < pl[0]) return false;
  if (pl[1] < b[1] && v > pl[1]) return false;
  return true;
}

/** Vrai quand la fourchette filtre : posée, et plus étroite que l'échelle. */
export function plageActive(pl: Plage, b: Echelle): boolean {
  return pl != null && (pl[0] > b[0] || pl[1] < b[1]);
}

/**
 * Ce que la fourchette dit, en toutes lettres : « Indifférent »,
 * « 1 800 m et plus », « jusqu'à 300 € », « 1 800 m à 2 400 m », et une seule
 * valeur quand les deux poignées se confondent.
 */
export function plageTexte(
  pl: Plage,
  b: Echelle,
  f: (v: number) => string = entier,
): string {
  if (!plageActive(pl, b)) return tr("Indifférent");
  const [lo, hi] = pl as readonly [number, number];
  if (hi >= b[1]) return tr("{min} et plus", { min: f(lo) });
  if (lo === hi) return f(lo);
  if (lo <= b[0]) return tr("jusqu’à {max}", { max: f(hi) });
  return tr("{min} à {max}", { min: f(lo), max: f(hi) });
}

/**
 * La même chose en abrégé, pour un bouton ou un résumé où la place manque :
 * « ≥ 1 800 », « ≤ 300 », « 1 800–2 400 ». Vide quand la fourchette ne filtre
 * pas.
 */
export function plageCourte(pl: Plage, b: Echelle, f: (v: number) => string = entier): string {
  if (!plageActive(pl, b)) return "";
  const [lo, hi] = pl as readonly [number, number];
  if (hi >= b[1]) return `≥ ${f(lo)}`;
  if (lo === hi) return f(lo);
  if (lo <= b[0]) return `≤ ${f(hi)}`;
  return `${f(lo)}–${f(hi)}`;
}

/**
 * Relit une plage venue d'ailleurs — état enregistré, adresse — et la remet
 * dans l'échelle. Ce qui n'est pas une paire de nombres est oublié, jamais
 * deviné ; bornes inversées, elles sont remises dans l'ordre.
 */
export function plageLue(x: unknown, b: Echelle): Plage {
  if (!Array.isArray(x) || x.length !== 2) return null;
  const [a, c] = x as unknown[];
  if (typeof a !== "number" || typeof c !== "number") return null;
  if (!Number.isFinite(a) || !Number.isFinite(c)) return null;
  const lo = Math.min(b[1], Math.max(b[0], Math.min(a, c)));
  const hi = Math.min(b[1], Math.max(b[0], Math.max(a, c)));
  return lo <= b[0] && hi >= b[1] ? null : [lo, hi];
}

/**
 * Un ancien seuil à une poignée, relu comme une fourchette : « au moins n »
 * devient `[n, max]`, « au plus n » devient `[min, n]`. Zéro, ou ce qui n'est
 * pas un nombre, était le repos : `null`.
 */
export function plageDepuisSeuil(n: unknown, b: Echelle, auPlus = false): Plage {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return plageLue(auPlus ? [b[0], n] : [n, b[1]], b);
}

/**
 * Une plage dans une adresse : « 1800- » (au moins), « -300 » (au plus),
 * « 1800-2400 ». Une borne au bout de l'échelle ne s'écrit pas, pour qu'un
 * lien reste juste si l'échelle s'élargit.
 */
export function encoderPlage(pl: Plage, b: Echelle): string | null {
  if (!plageActive(pl, b)) return null;
  const [lo, hi] = pl as readonly [number, number];
  return `${lo > b[0] ? lo : ""}-${hi < b[1] ? hi : ""}`;
}

/**
 * L'inverse d'`encoderPlage`. Un nombre seul est l'écriture d'avant les
 * fourchettes, un seuil : il se relit comme tel (`plageDepuisSeuil`), pour
 * qu'un ancien lien ouvre encore la même recherche.
 */
export function decoderPlage(raw: string | null, b: Echelle, auPlus = false): Plage {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  const m = /^(\d+(?:\.\d+)?)?-(\d+(?:\.\d+)?)?$/.exec(t);
  if (m) {
    if (m[1] == null && m[2] == null) return null;
    const lo = m[1] != null ? Number(m[1]) : b[0];
    const hi = m[2] != null ? Number(m[2]) : b[1];
    return plageLue([lo, hi], b);
  }
  if (!/^\d+(?:\.\d+)?$/.test(t)) return null;
  return plageDepuisSeuil(Number(t), b, auPlus);
}
