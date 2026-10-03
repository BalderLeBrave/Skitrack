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
 * 1. **Une fourchette active porte sur une valeur mesurée.** Une station dont le
 *    champ filtré n'est pas relevé sort du résultat ; elle n'est pas comptée
 *    comme un zéro qui passerait une borne basse. C'est `dansPlage` de
 *    `plage.ts`, la même fonction sur tous les écrans, pas une seconde
 *    écriture de la même règle.
 * 2. **Le nom se compare sans accents ni casse** (`foldName`), pour que
 *    « megeve » trouve Megève — ce que `/carte` faisait déjà et que l'accueil
 *    et Comparer ne faisaient pas.
 */

import { foldName } from "./carte.ts";
import {
  COLS,
  ECHELLES,
  ECHELLES_COULEUR,
  fmt,
  useParcours,
  type ChipKey,
  type CleFourchette,
  type ColorUnit,
  type Filters,
  type PisteColor,
} from "./parcours.ts";
import { dansPlage, plageTexte, type Echelle, type Plage } from "./plage.ts";
import type { Station } from "./stations.ts";
import { memeDevise, montant } from "./devises.ts";
import { prixAdulteSejour, useGrillesForfaits, type ContexteSejour } from "./forfaits/prixStations.ts";
import { useStay } from "./stay.ts";
import { CHIPS, maxM, minM, villageM } from "./v7.ts";
import { aTraduire, tr } from "./i18n/tr.ts";

/** Un critère actif : son jeton, son prédicat, et la façon de le retirer. */
export type Pred = {
  id: string;
  label: string;
  fn: (s: Station) => boolean;
  retirer: () => void;
};

/** Une fourchette de recherche : sa clé, ses libellés, son échelle. */
export type DefFourchette = {
  k: Exclude<CleFourchette, "budget">;
  label: string;
  court: string;
  b: Echelle;
  pas: number;
  unit: string;
};

/** Les fourchettes de station, dans l'ordre des panneaux. Les échelles
 *  viennent de `ECHELLES` (`parcours.ts`) : elles divergeaient entre
 *  l'accueil, Comparer et `/carte`. Les libellés se traduisent au rendu,
 *  `tr(r.label)`. */
export const SEUILS: DefFourchette[] = [
  { k: "v", label: aTraduire("Altitude du village"), court: aTraduire("village"), ...ECHELLES.v, unit: "m" },
  { k: "lo", label: aTraduire("Bas des pistes"), court: aTraduire("bas"), ...ECHELLES.lo, unit: "m" },
  { k: "hi", label: aTraduire("Sommet"), court: aTraduire("sommet"), ...ECHELLES.hi, unit: "m" },
  { k: "km", label: aTraduire("Kilomètres de pistes du domaine"), court: "km", ...ECHELLES.km, unit: "km" },
  { k: "pass", label: aTraduire("Forfait adulte du séjour"), court: aTraduire("forfait"), ...ECHELLES.pass, unit: "€" },
];

/** Ce que la fourchette dit, avec son unité : « 1 800 m et plus ». */
export function fourchetteLbl(r: Pick<DefFourchette, "b" | "unit">, pl: Plage): string {
  return plageTexte(pl, r.b, (v) => (r.unit === "€" ? montant(v, DEVISE_SEUIL) : `${fmt(v)} ${r.unit}`));
}

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

export const UNITES: Record<ColorUnit, { b: Echelle; pas: number; suf: string; lbl: string; unite: string }> = {
  pct: { ...ECHELLES_COULEUR.pct, suf: " %", lbl: "%", unite: "%" },
  n: { ...ECHELLES_COULEUR.n, suf: aTraduire(" tronçons"), lbl: aTraduire("tronçons"), unite: aTraduire("tronç.") },
  km: { ...ECHELLES_COULEUR.km, suf: " km", lbl: "km", unite: "km" },
};

/** Ce que la fourchette d'une couleur dit, dans l'unité choisie. */
export function couleurLbl(u: ColorUnit, pl: Plage): string {
  return plageTexte(pl, UNITES[u].b, (v) => `${fmt(v)}${tr(UNITES[u].suf)}`);
}

/** Part, tronçons, ou km estimés (part × km du domaine). */
export function colVal(s: Station, c: PisteColor, u: ColorUnit): number | null {
  if (!s.colorShare) return null;
  if (u === "pct") return s.colorShare[c];
  if (u === "n") return s.colorCounts ? s.colorCounts[c] : null;
  return s.pistesKm != null ? Math.round((s.pistesKm * s.colorShare[c]) / 100) : null;
}

export type EtatRecherche = {
  q: string;
  massif: string | null;
  filters: Filters;
  unit: ColorUnit;
  /** Les grilles et les dates dont dépend le forfait du séjour ; celles des
   *  magasins quand il est omis. */
  sejour?: ContexteSejour;
};

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
    const pl = e.filters[r.k];
    if (pl == null) continue;
    if (r.k === "pass") {
      out.push({
        id: r.k,
        label: tr("Forfait : {plage}", { plage: fourchetteLbl(r, pl) }),
        // Le forfait adulte résolu pour les dates du séjour, celui que la
        // carte de la station affiche.
        fn: (s) => {
          const f = prixAdulteSejour(s.id, e.sejour);
          if (!f) return false;
          if (!memeDevise(f.devise, DEVISE_SEUIL)) return false;
          return dansPlage(f.prix, pl, r.b);
        },
        retirer: () => P.setFilters({ pass: null }),
      });
      continue;
    }
    const lire = LECTURE[r.k];
    out.push({
      id: r.k,
      label: tr("{critere} : {plage}", { critere: tr(r.label), plage: fourchetteLbl(r, pl) }),
      fn: (s) => dansPlage(lire(s), pl, r.b),
      retirer: () => P.setFilters({ [r.k]: null }),
    });
  }
  for (const c of COLS) {
    const pl = e.filters.col[c.key];
    if (pl == null) continue;
    const b = UNITES[e.unit].b;
    out.push({
      id: "col-" + c.key,
      label: tr("{critere} : {plage}", { critere: tr(c.label), plage: couleurLbl(e.unit, pl) }),
      fn: (s) => dansPlage(colVal(s, c.key, e.unit), pl, b),
      retirer: () => P.setColFilter(c.key, null),
    });
  }
  if (e.filters.dom)
    out.push({
      id: "dom",
      label: e.filters.dom === "__none" ? tr("Domaine non renseigné") : e.filters.dom,
      fn: (s) => (e.filters.dom === "__none" ? !s.domain : s.domain === e.filters.dom),
      retirer: () => P.setFilters({ dom: "" }),
    });
  for (const k of Object.keys(CHIPS) as ChipKey[]) {
    if (!e.filters.chips[k]) continue;
    out.push({
      id: "c-" + k,
      label: tr(CHIPS[k].label),
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

/** Les critères actifs, abonnés au magasin, aux grilles de forfaits et aux
 *  dates du séjour (le critère « forfait » en dépend). */
export function usePredicats(): Pred[] {
  const q = useParcours((p) => p.q);
  const massif = useParcours((p) => p.massif);
  const filters = useParcours((p) => p.filters);
  const unit = useParcours((p) => p.unit);
  const grilles = useGrillesForfaits((e) => e.grilles);
  const arrivee = useStay((s) => s.checkIn);
  const depart = useStay((s) => s.checkOut);
  return predicats({ q, massif, filters, unit, sejour: { grilles, arrivee, depart } });
}
