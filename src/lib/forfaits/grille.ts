/**
 * La grille tarifaire d'un domaine : par saison, par durée, par catégorie.
 *
 * Le modèle ne portait que trois nombres — `j1`, `j6`, `enf6` — soit deux durées
 * et deux catégories, écrites en dur dans les champs eux-mêmes. Rien ne pouvait
 * dire le prix d'un 3 jours, ni celui d'un senior, ni distinguer deux saisons.
 *
 * Ici : les durées sont une liste, les catégories une **constante partagée**
 * (jamais écrite dans le rendu, pour qu'une quatrième catégorie n'oblige à
 * toucher aucun écran), et chaque case porte son prix, sa devise, sa source, sa
 * date de relevé et son statut.
 *
 * **Une valeur saisie à la main n'est jamais écrasée par une récupération
 * automatique sans confirmation explicite.** C'est la règle d'écriture de
 * `fusionnerReleve`, et le seul endroit où elle est tenue.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ForfaitRow } from "./types.ts";
import { deviseDuDomaine, domainBySlug, estimationDuDomaine } from "./catalog.ts";

/** Les catégories de tarif. Une constante, partagée ; d'autres peuvent s'y
 *  ajouter sans qu'aucun écran change. */
export const CATEGORIES = [
  { cle: "enfant", label: "Enfant" },
  { cle: "adulte", label: "Adulte" },
  { cle: "senior", label: "Senior" },
] as const;

export type Categorie = (typeof CATEGORIES)[number]["cle"];
export const CLES_CATEGORIES: readonly Categorie[] = CATEGORIES.map((c) => c.cle);

/** Les durées de base, en jours. La demi-journée est une durée comme une autre. */
export const DUREES_BASE = [0.5, 1, 2, 3, 4, 5, 6, 7] as const;
/** Au-delà de sept jours, la grille s'étend jour par jour jusqu'à cette borne. */
export const DUREE_MAX = 21;

export type Statut = "releve" | "manuel" | "estime" | "absent";

export const STATUT_LBL: Record<Statut, string> = {
  releve: "relevé",
  manuel: "saisi à la main",
  estime: "estimé",
  absent: "non relevé",
};

export type Tarif = {
  prix: number | null;
  devise: string;
  /** URL de la page relevée, ou « saisie manuelle ». */
  source: string | null;
  /** Date du relevé ou de la saisie, en ISO. */
  dateReleve: string | null;
  statut: Statut;
};

/** Une case vide n'a pas de prix, donc pas de devise à porter. « EUR » y est
 *  un remplissage, et non une hypothèse : rien ne le lit tant que `prix` est
 *  nul, et toute case remplie reçoit la devise de son domaine. */
export const TARIF_VIDE: Tarif = {
  prix: null,
  devise: "EUR",
  source: null,
  dateReleve: null,
  statut: "absent",
};

/** Les durées effectivement présentées, extension comprise. */
export function durees(dureeMax: number): number[] {
  const base: number[] = [...DUREES_BASE];
  for (let j = 8; j <= Math.min(dureeMax, DUREE_MAX); j += 1) base.push(j);
  return base;
}

/** La clé d'une case. Les durées demi-journées passent en dixièmes pour que la
 *  clé reste un texte stable (« 0.5 » et « 0,5 » ne sont pas le même texte). */
export function cle(duree: number, categorie: Categorie): string {
  return `${duree.toFixed(1)}|${categorie}`;
}

export type Grille = {
  slug: string;
  saison: string;
  dureeMax: number;
  cases: Record<string, Tarif>;
};

export function grilleVide(slug: string, saison: string): Grille {
  return { slug, saison, dureeMax: 7, cases: {} };
}

export function lire(g: Grille | undefined, duree: number, categorie: Categorie): Tarif {
  return g?.cases[cle(duree, categorie)] ?? TARIF_VIDE;
}

/** La saison d'une date : « 2026-27 ». Elle bascule le 1ᵉʳ août, pour qu'un
 *  relevé de septembre appartienne à la saison qui s'ouvre. */
export function saisonDe(d: Date): string {
  const a = d.getUTCFullYear();
  const debut = d.getUTCMonth() >= 7 ? a : a - 1;
  return `${debut}-${String((debut + 1) % 100).padStart(2, "0")}`;
}

/** La source écrite dans une case estimée, en infobulle : ce n'est pas une
 *  page relevée. */
export const SOURCE_ESTIMATION = "Estimé d’après le 6 jours adulte, faute de relevé.";

/**
 * Les cases que le catalogue estime pour ce domaine, faute de les relever.
 *
 * La journée et le 6 jours enfant de 142 domaines étaient calculés à partir du
 * 6 jours adulte, et la grille les écrivait « relevé » — 55 € et 234 € aux
 * Portes du Soleil. Ils n'arrivent plus par la ligne (`j1` et `enf6` y sont
 * nuls depuis le 26 septembre 2026) ; ils sont posés ici, « estimé ».
 *
 * La même règle nettoie les grilles déjà enregistrées sur l'appareil : une case
 * « relevé » qui porte exactement la valeur estimée, et que la ligne ne fournit
 * pas, est cette ancienne valeur calculée. Elle redevient « estimé ». Une case
 * vide, elle, n'est remplie que si le 6 jours de la ligne est celui du
 * catalogue : une estimation tirée d'un autre 6 jours ne dirait plus rien.
 */
function estimations(
  slug: string,
  row: ForfaitRow,
): { duree: number; categorie: Categorie; prix: number; remplir: boolean }[] {
  const d = domainBySlug(slug);
  const est = estimationDuDomaine(d);
  if (!est) return [];
  const remplir = row.j6 != null && row.j6 === d?.seed?.j6;
  const out: { duree: number; categorie: Categorie; prix: number; remplir: boolean }[] = [];
  if (row.j1 == null && est.j1 != null) out.push({ duree: 1, categorie: "adulte", prix: est.j1, remplir });
  if (row.enf6 == null && est.enf6 != null) out.push({ duree: 6, categorie: "enfant", prix: est.enf6, remplir });
  return out;
}

/**
 * Ce qu'un relevé automatique dépose dans la grille.
 *
 * `ForfaitRow` ne connaît que le 1 jour adulte, le 6 jours adulte et le 6 jours
 * enfant : c'est tout ce que l'extraction sait lire aujourd'hui, et la grille ne
 * prétend pas en savoir plus. S'y ajoutent, marquées « estimé », les deux cases
 * que le catalogue estime quand la ligne ne les porte pas (`estimations`). Les
 * cases saisies à la main sont laissées intactes ; celles que le relevé
 * contredirait sont rendues à part, pour que l'écran demande confirmation au
 * lieu de les écraser.
 */
export function fusionnerReleve(
  g: Grille,
  row: ForfaitRow,
): { grille: Grille; conflits: { duree: number; categorie: Categorie; ancien: number; nouveau: number }[] } {
  const venants: { duree: number; categorie: Categorie; prix: number }[] = [];
  if (row.j1 != null) venants.push({ duree: 1, categorie: "adulte", prix: row.j1 });
  if (row.j6 != null) venants.push({ duree: 6, categorie: "adulte", prix: row.j6 });
  if (row.enf6 != null) venants.push({ duree: 6, categorie: "enfant", prix: row.enf6 });

  const cases = { ...g.cases };
  const conflits: { duree: number; categorie: Categorie; ancien: number; nouveau: number }[] = [];
  const quand = row.fetchedAt ?? row.lastAttemptAt;
  for (const e of estimations(g.slug, row)) {
    const k = cle(e.duree, e.categorie);
    const actuel = cases[k];
    // Jamais sur une saisie ; jamais sur un vrai relevé d'une autre valeur,
    // gardé d'une lecture précédente de la page officielle.
    if (actuel?.statut === "manuel") continue;
    const ancienCalcul = actuel?.statut === "releve" && actuel.prix === e.prix;
    if (actuel?.statut === "releve" && !ancienCalcul) continue;
    // Ailleurs, l'estimation ne se pose que si elle part du 6 jours affiché.
    if (!ancienCalcul && !e.remplir) continue;
    if (actuel?.statut === "estime" && actuel.prix === e.prix && actuel.source === SOURCE_ESTIMATION) continue;
    cases[k] = {
      prix: e.prix,
      devise: deviseDuDomaine(g.slug) ?? "EUR",
      source: SOURCE_ESTIMATION,
      dateReleve: null,
      statut: "estime",
    };
  }
  for (const v of venants) {
    const k = cle(v.duree, v.categorie);
    const actuel = cases[k];
    if (actuel?.statut === "manuel") {
      // Jamais écrasé sans confirmation : le conflit remonte, la case reste.
      if (actuel.prix != null && actuel.prix !== v.prix) {
        conflits.push({ duree: v.duree, categorie: v.categorie, ancien: actuel.prix, nouveau: v.prix });
      }
      continue;
    }
    cases[k] = {
      prix: v.prix,
      devise: deviseDuDomaine(g.slug) ?? "EUR",
      source: row.sourceUrl,
      dateReleve: quand,
      statut: row.status === "estimé" ? "estime" : "releve",
    };
  }
  return { grille: { ...g, cases }, conflits };
}

/* ---------- Magasin local ---------- */

/**
 * De quoi défaire **une saisie**, pas une frappe.
 *
 * `poser` est appelée à chaque caractère tapé : mémoriser l'état précédent à
 * chaque appel ne rendait qu'un caractère. `avant` garde donc la valeur
 * d'avant la première frappe de la case, tant qu'on n'en a pas changé.
 */
type Annulation = { clef: string; k: string; avant: Tarif | undefined };

type GrillesStore = {
  /** Par `${slug}|${saison}`. */
  grilles: Record<string, Grille>;
  /** La dernière saisie, pour pouvoir la défaire. */
  derniere: Annulation | null;
  poser: (slug: string, saison: string, duree: number, categorie: Categorie, prix: number | null) => void;
  etendre: (slug: string, saison: string, dureeMax: number) => void;
  appliquerReleve: (slug: string, saison: string, row: ForfaitRow, forcer?: boolean) => number;
  annulerDerniere: () => void;
};

function clef(slug: string, saison: string): string {
  return `${slug}|${saison}`;
}

export const useGrilles = create<GrillesStore>()(
  persist(
    (set, get) => ({
      grilles: {},
      derniere: null,
      poser: (slug, saison, duree, categorie, prix) =>
        set((s) => {
          const c = clef(slug, saison);
          const g = s.grilles[c] ?? grilleVide(slug, saison);
          const k = cle(duree, categorie);
          // Tant qu'on reste dans la même case, l'annulation vise toujours ce
          // qui s'y trouvait avant qu'on y touche.
          const memeCase = s.derniere?.clef === c && s.derniere.k === k;
          const avant = memeCase ? s.derniere!.avant : g.cases[k];
          const cases = { ...g.cases };
          if (prix == null) delete cases[k];
          else
            cases[k] = {
              prix,
              devise: deviseDuDomaine(slug) ?? "EUR",
              source: "saisie manuelle",
              dateReleve: new Date().toISOString(),
              statut: "manuel",
            };
          return {
            grilles: { ...s.grilles, [c]: { ...g, cases } },
            derniere: { clef: c, k, avant },
          };
        }),
      etendre: (slug, saison, dureeMax) =>
        set((s) => {
          const c = clef(slug, saison);
          const g = s.grilles[c] ?? grilleVide(slug, saison);
          return {
            grilles: {
              ...s.grilles,
              [c]: { ...g, dureeMax: Math.max(7, Math.min(DUREE_MAX, Math.round(dureeMax))) },
            },
          };
        }),
      /** Rend le nombre de conflits laissés en l'état (zéro si `forcer`). */
      appliquerReleve: (slug, saison, row, forcer = false) => {
        const c = clef(slug, saison);
        const g = get().grilles[c] ?? grilleVide(slug, saison);
        const { grille, conflits } = fusionnerReleve(g, row);
        let cases = grille.cases;
        if (forcer && conflits.length) {
          cases = { ...cases };
          const quand = row.fetchedAt ?? row.lastAttemptAt;
          for (const cf of conflits) {
            cases[cle(cf.duree, cf.categorie)] = {
              prix: cf.nouveau,
              devise: deviseDuDomaine(slug) ?? "EUR",
              source: row.sourceUrl,
              dateReleve: quand,
              statut: "releve",
            };
          }
        }
        // Un relevé qui **réécrit** la case visée rend l'annulation caduque :
        // la défaire y remettrait une valeur plus ancienne que le relevé.
        // `fusionnerReleve` ne recopie une case que lorsqu'elle change, donc
        // l'identité suffit à le dire — et une case manuelle, qu'elle ne
        // touche jamais, garde son annulation.
        set((s) => {
          const d = s.derniere;
          const reecrite = !!d && d.clef === c && cases[d.k] !== g.cases[d.k];
          return {
            grilles: { ...s.grilles, [c]: { ...grille, cases } },
            derniere: reecrite ? null : d,
          };
        });
        return forcer ? 0 : conflits.length;
      },
      annulerDerniere: () =>
        set((s) => {
          const d = s.derniere;
          if (!d) return {};
          const g = s.grilles[d.clef];
          if (!g) return { derniere: null };
          const cases = { ...g.cases };
          if (d.avant) cases[d.k] = d.avant;
          else delete cases[d.k];
          return { grilles: { ...s.grilles, [d.clef]: { ...g, cases } }, derniere: null };
        }),
    }),
    {
      name: "skitrack-grilles",
      /**
       * Seules les grilles survivent au rechargement.
       *
       * `derniere` était persistée : au lancement suivant, « Annuler la
       * dernière saisie » défaisait une saisie d'une session précédente et
       * pouvait écraser un relevé entre-temps obtenu.
       */
      partialize: (s) => ({ grilles: s.grilles }) as GrillesStore,
    },
  ),
);
