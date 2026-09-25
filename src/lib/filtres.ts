/**
 * Les prédicats de recherche des stations. **Une seule implémentation.**
 *
 * Ils vivaient en ligne dans `comparer.tsx`, où seul cet écran pouvait les
 * lire : l'accueil ne pouvait donc ni afficher les critères actifs, ni dire
 * combien de stations ils retiennent, et il annonçait « Rechercher ouvrira la
 * liste des stations » sans savoir laquelle. Sortis ici, ils servent aux deux,
 * avec les mêmes bornes, le même comparateur de noms et les mêmes libellés.
 *
 * Deux règles tenues d'un bout à l'autre :
 *
 * 1. **Un seuil actif porte sur une valeur mesurée.** Une station dont le champ
 *    filtré n'est pas relevé sort du résultat ; elle n'est pas comptée comme un
 *    zéro qui passerait un seuil bas. C'est `atLeast` de `carte.ts`, la même
 *    fonction, pas une seconde écriture de la même règle.
 * 2. **Le nom se compare sans accents ni casse** (`foldName`), pour que
 *    « megeve » trouve Megève — ce que `/carte` faisait déjà et que l'accueil
 *    et Comparer ne faisaient pas.
 */

import { atLeast, foldName } from "./carte.ts";
import {
  COLS,
  fmt,
  useParcours,
  type ChipKey,
  type ColorUnit,
  type Filters,
  type PisteColor,
} from "./parcours.ts";
import type { Station } from "./stations.ts";
import { memeDevise, montant } from "./devises.ts";
import { CHIPS, deviseForfaitOf, forfaitOf, maxM, minM, villageM } from "./v7.ts";

/** Un critère actif : son jeton, son prédicat, et la façon de le retirer. */
export type Pred = {
  id: string;
  label: string;
  fn: (s: Station) => boolean;
  retirer: () => void;
};

/** Les curseurs de seuil, bornes comprises. Seule table de ces bornes : elles
 *  divergeaient entre l'accueil, Comparer et `/carte`. */
export const SEUILS: {
  k: "v" | "lo" | "hi" | "km" | "pass";
  label: string;
  court: string;
  max: number;
  step: number;
  unit: string;
  /** Au plus, et non au moins. */
  auPlus?: true;
}[] = [
  { k: "v", label: "Altitude du village", court: "village", max: 2400, step: 100, unit: "m" },
  { k: "lo", label: "Bas des pistes", court: "bas", max: 2200, step: 100, unit: "m" },
  { k: "hi", label: "Sommet", court: "sommet", max: 3500, step: 100, unit: "m" },
  { k: "km", label: "Kilomètres de pistes du domaine", court: "km", max: 600, step: 10, unit: "km" },
  { k: "pass", label: "Forfait 6 j adulte, au plus", court: "forfait", max: 400, step: 10, unit: "€", auPlus: true },
];

/**
 * La devise dans laquelle le seuil « forfait » est exprimé.
 *
 * Un seuil de 400 € n'a rien à dire d'un forfait en francs suisses ou en yens,
 * et aucun taux de change ne vit dans ce dépôt. Le filtre écarte donc les
 * stations d'une autre devise, exactement comme il écarte déjà une station
 * dont le champ n'est pas mesuré : dans les deux cas, la comparaison demandée
 * n'a pas de sens, et y répondre « oui » serait pire que n'y pas répondre.
 *
 * Elle vaut l'euro tant que le seuil s'affiche en euros. Le jour où l'écran
 * proposera de choisir la devise, c'est cette constante qui deviendra un état.
 */
export const DEVISE_SEUIL = "EUR";

/** Ce que chaque seuil lit sur la station. **L'altitude minimale du village lit
 *  `villageM`** — le point de départ —, jamais le sommet du domaine. */
export const LECTURE: Record<"v" | "lo" | "hi" | "km", (s: Station) => number | null> = {
  v: villageM,
  lo: minM,
  hi: maxM,
  km: (s) => s.pistesKm,
};

export const UNITES: Record<ColorUnit, { max: number; step: number; suf: string; lbl: string }> = {
  pct: { max: 60, step: 5, suf: " %", lbl: "%" },
  n: { max: 200, step: 5, suf: " tronçons", lbl: "tronçons" },
  km: { max: 200, step: 10, suf: " km", lbl: "km" },
};

/** Part, tronçons, ou km estimés (part × km du domaine). */
export function colVal(s: Station, c: PisteColor, u: ColorUnit): number | null {
  if (!s.colorShare) return null;
  if (u === "pct") return s.colorShare[c];
  if (u === "n") return s.colorCounts ? s.colorCounts[c] : null;
  return s.pistesKm != null ? Math.round((s.pistesKm * s.colorShare[c]) / 100) : null;
}

export type EtatRecherche = { q: string; massif: string | null; filters: Filters; unit: ColorUnit };

/** Les critères actifs, dans l'ordre où ils se lisent. Un critère au repos —
 *  zéro, chaîne vide, raccourci décoché — n'en fait pas partie. */
export function predicats(e: EtatRecherche): Pred[] {
  const P = useParcours.getState();
  const out: Pred[] = [];
  const ql = foldName(e.q);
  // Choisir un massif dans les suggestions de l'accueil pose le texte **et** le
  // critère : le champ montre ce qui est cherché, c'est la règle du magasin.
  // Deux prédicats en sortaient, donc deux jetons pour un seul geste, à retirer
  // l'un après l'autre. Quand le texte redit mot pour mot le massif déjà posé,
  // il ne dit rien de plus : le critère exact l'emporte.
  const qRedit = !!e.massif && ql === foldName(e.massif);
  if (ql && !qRedit)
    out.push({
      id: "q",
      label: `« ${e.q.trim()} »`,
      fn: (s) =>
        foldName(s.name).includes(ql) ||
        foldName(s.massif).includes(ql) ||
        foldName(s.domain ?? "").includes(ql),
      retirer: () => P.setQ(""),
    });
  if (e.massif)
    out.push({
      id: "massif",
      label: e.massif,
      fn: (s) => s.massif === e.massif,
      // Quand le texte redit le massif, ce jeton porte les deux : les retirer
      // ensemble, sinon le texte reparaîtrait aussitôt sous son propre jeton.
      retirer: qRedit
        ? () => {
            P.setMassif(null);
            P.setQ("");
          }
        : () => P.setMassif(null),
    });
  for (const r of SEUILS) {
    const v = e.filters[r.k];
    if (!v) continue;
    if (r.k === "pass") {
      out.push({
        id: r.k,
        label: `Forfait ≤ ${montant(v, DEVISE_SEUIL)}`,
        fn: (s) => {
          const j6 = forfaitOf(s)?.j6;
          if (j6 == null) return false;
          if (!memeDevise(deviseForfaitOf(s), DEVISE_SEUIL)) return false;
          return j6 <= v;
        },
        retirer: () => P.setFilters({ pass: 0 }),
      });
      continue;
    }
    const lire = LECTURE[r.k];
    out.push({
      id: r.k,
      label: `${r.label} ≥ ${fmt(v)} ${r.unit}`,
      fn: (s) => atLeast(lire(s), v),
      retirer: () => P.setFilters({ [r.k]: 0 }),
    });
  }
  for (const c of COLS) {
    const v = e.filters.col[c.key];
    if (!v) continue;
    out.push({
      id: "col-" + c.key,
      label: `${c.label} ≥ ${fmt(v)}${UNITES[e.unit].suf}`,
      fn: (s) => atLeast(colVal(s, c.key, e.unit), v),
      retirer: () => P.setColFilter(c.key, 0),
    });
  }
  if (e.filters.dom)
    out.push({
      id: "dom",
      label: e.filters.dom === "__none" ? "Domaine non renseigné" : e.filters.dom,
      fn: (s) => (e.filters.dom === "__none" ? !s.domain : s.domain === e.filters.dom),
      retirer: () => P.setFilters({ dom: "" }),
    });
  for (const k of Object.keys(CHIPS) as ChipKey[]) {
    if (!e.filters.chips[k]) continue;
    out.push({
      id: "c-" + k,
      label: CHIPS[k].label,
      fn: CHIPS[k].fn,
      retirer: () => P.setChip(k, false),
    });
  }
  return out;
}

export function appliquer(rows: readonly Station[], preds: readonly Pred[]): Station[] {
  return rows.filter((s) => preds.every((p) => p.fn(s)));
}

/**
 * L'état vide, nommé par le critère le plus restrictif.
 *
 * « Aucun résultat » ne dit rien d'actionnable. En retirant chaque critère à
 * son tour, on sait lequel bloque, et combien de stations reviendraient sans
 * lui : c'est ce que l'écran propose de relâcher.
 */
export function critereBloquant(
  rows: readonly Station[],
  preds: readonly Pred[],
): { pred: Pred; restantes: number } | null {
  let best: { pred: Pred; restantes: number } | null = null;
  for (const p of preds) {
    const n = appliquer(rows, preds.filter((x) => x !== p)).length;
    if (!best || n > best.restantes) best = { pred: p, restantes: n };
  }
  return best && best.restantes > 0 ? best : null;
}

/** Les critères actifs, abonnés au magasin. */
export function usePredicats(): Pred[] {
  const q = useParcours((p) => p.q);
  const massif = useParcours((p) => p.massif);
  const filters = useParcours((p) => p.filters);
  const unit = useParcours((p) => p.unit);
  return predicats({ q, massif, filters, unit });
}
