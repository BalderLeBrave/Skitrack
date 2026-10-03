/** État du parcours de la maquette v7 (`SKITRACK v7 - App.dc.html`, bloc
 *  `state` du script : `q`, `massif`, `f`, `unit`, `col`, `dom`, `chipsOn`,
 *  `sort`, `cmp`, `pick`, `station`, `lodge`, `seen`, `booked`) et les libellés
 *  que la v6 avait déjà posés (`fmt`, `eur`, `distLbl`, `subLbl`).
 *
 *  Dates, voyageurs et chambres viennent de `useStay` (données réelles du
 *  dépôt) ; ici ne vivent que la station retenue, le logement choisi, la
 *  comparaison, les filtres de l'écran Comparer, les annonces déjà vues, le
 *  bandeau et l'ouverture du panneau de séjour.
 *
 *  **C'est le magasin unique des critères de recherche.** L'accueil y écrit —
 *  destination, altitudes, kilomètres, forfait, budget, domaine, raccourcis,
 *  tri —, Comparer, la fiche station et Logements y lisent. Rien n'en tient une
 *  seconde copie : le champ de l'accueil en tenait une, et le texte affiché
 *  disait alors autre chose que le filtre appliqué. `criteres.ts` en donne
 *  l'écriture dans l'adresse ; il ne garde aucun état. */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { IDS_RETIRES, sansDomaineAlpin } from "./classeur.ts";
import { resolveStationPhoto } from "./stationPhoto.ts";
import { adults, clampChildren, PARTY_LIMITS, partyLabel } from "./stay/party.ts";
import { stationById, type Station } from "./stations.ts";
import { useStay } from "./stay.ts";
import { entier, montant, montantCents, montantN } from "./devises.ts";
import { plageDepuisSeuil, poserBorne, type Echelle, type Plage } from "./plage.ts";
import { sensLu, type Sens } from "./tri.ts";
import { langue } from "./i18n/langue.ts";
import { aTraduire, tr, trN } from "./i18n/tr.ts";

/** Photo de la station : **la copie locale, ou rien**.
 *
 *  Cette fonction repliait sur l'URL publiée par la fiche Skiinfo quand le
 *  dépôt n'avait pas de copie. Deux stations sont dans ce cas, `larche` et
 *  `le-chazelet`, et leur URL distante ne répond plus : la page posait donc une
 *  image qui échouait, en sollicitant au passage un hôte tiers depuis le
 *  navigateur du visiteur. C'est aussi ce que `skiinfo.photos.test.ts` interdit
 *  en toutes lettres, « plus aucun hotlink ».
 *
 *  `null` quand il n'y a pas de fichier : l'écran doit alors dire qu'il n'a pas
 *  de photo, pas en afficher une cassée. */
export function stationPhoto(s: Station): string | null {
  return resolveStationPhoto(s.id)?.src ?? null;
}

/** Ce que l'écran écrit à la place d'une photo absente. Nommer la station évite
 *  qu'un cadre vide se lise comme une erreur de chargement. */
export function stationPhotoAbsence(s: Station): string {
  return tr("Aucune photo relevée pour {station}", { station: s.name });
}

export type PisteColor = "green" | "blue" | "red" | "black";
export type ColorUnit = "pct" | "n" | "km";
/** Clés de tri de la maquette v7 (`<select value="{{ sort }}">`). */
export type SortKey = "km" | "hi" | "lo" | "v" | "pass" | "n";

/** Le sens qu'un critère de tri prend quand on le choisit : les plus grands
 *  domaines et les plus hautes altitudes d'abord, le forfait le moins cher
 *  d'abord, les noms de A à Z. Le bouton de sens l'inverse ensuite. */
export const SENS_TRI: Record<SortKey, Sens> = { km: -1, hi: -1, lo: -1, v: -1, pass: 1, n: 1 };
/** Raccourcis de la maquette (`CH`) : chacun est un prédicat sur la station. */
export type ChipKey = "big" | "high" | "glacier" | "linked" | "family" | "steep";

/** `COLS` de la maquette : clé, libellé, couleur. La couleur est un jeton du
 *  système, jamais une valeur brute. */
export const COLS: { key: PisteColor; label: string; token: string }[] = [
  { key: "green", label: aTraduire("Vertes"), token: "var(--color-piste-verte)" },
  { key: "blue", label: aTraduire("Bleues"), token: "var(--color-piste-bleue)" },
  { key: "red", label: aTraduire("Rouges"), token: "var(--color-piste-rouge)" },
  { key: "black", label: aTraduire("Noires"), token: "var(--color-piste-noire)" },
];

/** Les critères chiffrés de la recherche : chacun est une fourchette. */
export type CleFourchette = "v" | "lo" | "hi" | "km" | "pass" | "budget";

/**
 * L'échelle et le pas de chaque fourchette de recherche. **Seule table** : les
 * curseurs de l'accueil, de Comparer et de Logements la lisent, la migration de
 * l'état enregistré et l'adresse aussi.
 *
 * Chacun était un seuil à une poignée — « au moins » pour les altitudes et les
 * kilomètres, « au plus » pour le forfait et le budget —, et le maximum de
 * chaque échelle est celui de ce curseur. La borne haute posée au maximum veut
 * dire « et plus » : le sommet de Val Thorens passe « 3 500 m et plus ».
 */
export const ECHELLES: Record<CleFourchette, { b: Echelle; pas: number }> = {
  v: { b: [0, 2400], pas: 100 },
  lo: { b: [0, 2200], pas: 100 },
  hi: { b: [0, 3500], pas: 100 },
  km: { b: [0, 600], pas: 10 },
  pass: { b: [0, 400], pas: 10 },
  budget: { b: [0, 6000], pas: 250 },
};

/** L'échelle des fourchettes par couleur de piste, selon l'unité. */
export const ECHELLES_COULEUR: Record<ColorUnit, { b: Echelle; pas: number }> = {
  pct: { b: [0, 60], pas: 5 },
  n: { b: [0, 200], pas: 5 },
  km: { b: [0, 200], pas: 10 },
};

/** `f`, `col`, `dom`, `chipsOn` de la maquette, réunis. Une fourchette `null`
 *  ou une chaîne vide vaut « indifférent » : un filtre au repos n'écarte rien. */
export type Filters = {
  /** Altitude du village (m). */
  v: Plage;
  /** Bas des pistes (m). */
  lo: Plage;
  /** Sommet (m). */
  hi: Plage;
  /** Km de pistes du domaine. */
  km: Plage;
  /** Forfait 6 jours adulte (€). */
  pass: Plage;
  /** Total du séjour (€). Critère de l'accueil, lu par Logements. */
  budget: Plage;
  /** Domaine skiable : nom exact, `__none` pour « non renseigné », vide = tous. */
  dom: string;
  /** Part, tronçons ou km de chaque couleur, dans l'unité choisie. */
  col: Record<PisteColor, Plage>;
  chips: Partial<Record<ChipKey, boolean>>;
};

export const FILTERS_INITIAL: Filters = {
  v: null,
  lo: null,
  hi: null,
  km: null,
  pass: null,
  budget: null,
  dom: "",
  col: { green: null, blue: null, red: null, black: null },
  chips: {},
};

function filtersVierges(): Filters {
  return { ...FILTERS_INITIAL, col: { ...FILTERS_INITIAL.col }, chips: {} };
}

/** Bornes du sélecteur de séjour.
 *
 *  Voyageurs et chambres viennent de `PARTY_LIMITS` (`stay/party.ts`), seul
 *  endroit où ces bornes sont tenues. Les nuits sont bornées à 21, comme le
 *  calendrier de la maquette (« 21 nuits au plus »). */
export const STAY_BOUNDS = {
  trav: { min: PARTY_LIMITS.travelers.min, max: PARTY_LIMITS.travelers.max },
  // Les enfants sont bornés par le nombre de voyageurs, pas par une constante :
  // le maximum ici n'est que le plafond absolu, `stepStay` resserre sur le
  // groupe réel.
  enfants: { min: 0, max: PARTY_LIMITS.travelers.max },
  rooms: { min: PARTY_LIMITS.rooms.min, max: PARTY_LIMITS.rooms.max },
  nights: { min: 1, max: 21 },
} as const;

/** Quatre stations au plus dans la comparaison (maquette v7 ; la v6 en
 *  admettait trois). */
export const CMP_MAX = 4;

type Parcours = {
  stationId: string | null;
  lodgeId: string | null;
  cmp: string[];
  /** Colonne cochée du tableau de comparaison. */
  pick: string | null;
  /** Annonces déjà ouvertes : grisées dans la liste et sur la carte. */
  seen: Record<string, boolean>;
  /** Séjour marqué comme réservé chez la source. */
  booked: boolean;
  massif: string | null;
  q: string;
  sortKey: SortKey;
  /** Le sens du tri de Comparer. */
  sortDir: Sens;
  unit: ColorUnit;
  filters: Filters;
  toast: { text: string; nonce: number } | null;
  /** Panneau « Votre séjour » sous la barre. Transitoire. */
  stayOpen: boolean;
  /** Récapitulatif ouvert depuis un lien de partage. Transitoire. */
  shared: boolean;
  retain: (id: string) => void;
  /** Relâche la station retenue. Un second clic sur une vignette déjà
   *  sélectionnée doit pouvoir la désélectionner. */
  relacher: () => void;
  chooseLodge: (id: string | null) => void;
  toggleCmp: (id: string) => void;
  /** Vide la comparaison d'un coup, depuis le tiroir. */
  clearCmp: () => void;
  setPick: (id: string | null) => void;
  markSeen: (id: string) => void;
  setBooked: (v: boolean) => void;
  setMassif: (m: string | null) => void;
  /** Le texte du champ destination. Il est la seule source de ce texte.
   *
   *  Écrire un texte qui n'est plus le nom de la station retenue relâche cette
   *  station : le champ et l'intention ne peuvent pas diverger. */
  setQ: (q: string) => void;
  /** Choisir une station dans la liste de suggestions : le champ porte son nom,
   *  la station est retenue. Aucune navigation — la loupe seule y mène.
   *  `null` relâche la station et vide le champ. */
  setDestination: (s: { id: string; name: string } | null) => void;
  /** Un autre critère de tri part dans son sens de départ (`SENS_TRI`). */
  setSort: (k: SortKey) => void;
  setSortDir: (d: Sens) => void;
  setUnit: (u: ColorUnit) => void;
  setFilters: (patch: Partial<Filters>) => void;
  setColFilter: (c: PisteColor, v: Plage) => void;
  /** Pose une borne d'une fourchette, depuis l'état courant : arrondie au pas
   *  au curseur, telle quelle quand elle est tapée (`exact`). */
  poserFourchette: (k: CleFourchette, which: 0 | 1, v: number, exact: boolean) => void;
  /** La même chose pour une couleur de piste, dans l'unité choisie. */
  poserCouleur: (c: PisteColor, which: 0 | 1, v: number, exact: boolean) => void;
  setChip: (k: ChipKey, on: boolean) => void;
  /** `resetAll` de la maquette : recherche, massif, domaine, seuils, raccourcis. */
  resetFilters: () => void;
  /** `restart` : oublie station, logement, comparaison, annonces vues. */
  restart: () => void;
  setStayOpen: (v: boolean) => void;
  setShared: (v: boolean) => void;
  say: (text: string) => void;
};

/** Version de l'état persisté. Voir `migrerParcours`. */
export const PARCOURS_VERSION = 4;

/** L'identifiant courant d'une station : un identifiant retiré du référentiel
 *  (`IDS_RETIRES`) rend celui de la station qui le remplace ; tout autre reste
 *  tel quel. */
function idCourant(id: string): string {
  return IDS_RETIRES[id] ?? id;
}

/**
 * Remet un état persisté à la forme de `PARCOURS_VERSION`.
 *
 * **Version 2** : les critères de recherche entrent dans ce qui est persisté.
 * Une entrée écrite par la version 1 porte une station retenue mais aucun
 * texte de destination — la fusion de zustand est superficielle, et `q`
 * reprendrait sa valeur initiale. L'écran afficherait alors un champ vide et
 * une loupe qui ouvre les logements d'une station que rien ne nomme, ce qui
 * est précisément l'état qu'on voulait supprimer. On relâche donc la station,
 * et la visite recommence proprement.
 *
 * **Version 3** : cinq identifiants de station sont retirés du référentiel le
 * 26 septembre 2026 (`IDS_RETIRES`). `stationById` les résout encore, mais un
 * identifiant brut resté dans l'état faisait un doublon fantôme : une
 * comparaison enregistrée sous « praloup-04226 » montrait une colonne Praloup
 * que la liste ne cochait pas, et la cocher en ajoutait une seconde. La
 * station retenue, la comparaison et la colonne cochée passent donc par la
 * table ; la comparaison perd ses doublons, dans son ordre. Le champ
 * destination prend le nom de la station qui remplace, pour dire encore ce que
 * la loupe ouvrira. `seen` et `lodgeId` ne bougent pas : ils portent des
 * identifiants d'annonce, pas de station.
 *
 * **Version 4** : chaque seuil devient une fourchette. « Au moins n » (les
 * altitudes, les kilomètres, les couleurs) se relit `[n, max]`, « au plus n »
 * (le forfait, le budget) `[0, n]`, et zéro reste « indifférent ». La recherche
 * enregistrée retient donc les mêmes stations qu'avant. Le tri garde son
 * critère et prend le sens qu'il avait (`SENS_TRI`).
 */
export function migrerParcours(persisted: unknown, version: number): Record<string, unknown> {
  let p = { ...((persisted ?? {}) as Record<string, unknown>) };
  if (version < 2) p = { ...p, stationId: null, lodgeId: null, booked: false };
  if (version < 3) {
    if (typeof p.stationId === "string") {
      const id = idCourant(p.stationId);
      if (id !== p.stationId) p = { ...p, stationId: id, q: stationById(id)?.name ?? p.q };
    }
    if (Array.isArray(p.cmp)) {
      const ids = p.cmp.filter((x): x is string => typeof x === "string").map(idCourant);
      p = { ...p, cmp: [...new Set(ids)] };
    }
    if (typeof p.pick === "string") p = { ...p, pick: idCourant(p.pick) };
  }
  if (version < 4) {
    const f = (p.filters ?? null) as Record<string, unknown> | null;
    if (f && typeof f === "object") {
      const unit = (typeof p.unit === "string" && p.unit in ECHELLES_COULEUR ? p.unit : "pct") as ColorUnit;
      const col = (f.col ?? {}) as Record<string, unknown>;
      const auMoins = (k: CleFourchette) => plageDepuisSeuil(f[k], ECHELLES[k].b);
      const auPlus = (k: CleFourchette) => plageDepuisSeuil(f[k], ECHELLES[k].b, true);
      const couleur = (c: PisteColor) => plageDepuisSeuil(col[c], ECHELLES_COULEUR[unit].b);
      p = {
        ...p,
        filters: {
          ...f,
          v: auMoins("v"),
          lo: auMoins("lo"),
          hi: auMoins("hi"),
          km: auMoins("km"),
          pass: auPlus("pass"),
          budget: auPlus("budget"),
          col: { green: couleur("green"), blue: couleur("blue"), red: couleur("red"), black: couleur("black") },
        },
      };
    }
    const k = p.sortKey as SortKey;
    p = { ...p, sortDir: k in SENS_TRI ? SENS_TRI[k] : SENS_TRI.km };
  }
  return p;
}

export const useParcours = create<Parcours>()(
  persist(
    (set, get) => ({
      stationId: null,
      lodgeId: null,
      cmp: [],
      pick: null,
      seen: {},
      booked: false,
      massif: null,
      q: "",
      sortKey: "km",
      sortDir: SENS_TRI.km,
      unit: "pct",
      filters: filtersVierges(),
      toast: null,
      stayOpen: false,
      shared: false,
      /** `retain(id)` : changer de station oublie le logement, et ce qui en
       *  découlait. */
      retain: (id) => {
        if (get().stationId !== id) set({ stationId: id, lodgeId: null, booked: false });
      },
      relacher: () => set({ stationId: null, lodgeId: null, booked: false }),
      chooseLodge: (id) => set((s) => ({ lodgeId: id, booked: id === s.lodgeId ? s.booked : false })),
      toggleCmp: (id) => {
        const cmp = get().cmp;
        if (cmp.includes(id)) return set({ cmp: cmp.filter((x) => x !== id) });
        if (cmp.length >= CMP_MAX)
          return get().say(
            CMP_MAX === 4
              ? tr("Quatre stations au plus dans la comparaison.")
              : tr("{n} stations au plus dans la comparaison.", { n: CMP_MAX }),
          );
        set({ cmp: [...cmp, id] });
      },
      clearCmp: () => set({ cmp: [], pick: null }),
      setPick: (pick) => set({ pick }),
      markSeen: (id) => set((s) => (s.seen[id] ? {} : { seen: { ...s.seen, [id]: true } })),
      setBooked: (booked) => set({ booked }),
      setMassif: (massif) => set({ massif }),
      setQ: (q) =>
        set((s) => {
          const retenue = s.stationId ? stationById(s.stationId) : null;
          // Le texte ne correspond plus à la station retenue : elle tombe, et
          // la recherche redevient une recherche de liste.
          if (retenue && q.trim() !== retenue.name) {
            return { q, stationId: null, lodgeId: null, booked: false };
          }
          return { q };
        }),
      setDestination: (dest) =>
        set(
          dest
            ? { q: dest.name, stationId: dest.id, lodgeId: null, booked: false }
            : { q: "", stationId: null, lodgeId: null, booked: false },
        ),
      setSort: (sortKey) => set({ sortKey, sortDir: SENS_TRI[sortKey] }),
      setSortDir: (d) => set({ sortDir: sensLu(d, SENS_TRI.km) }),
      /** Changer d'unité remet les quatre seuils de couleur à zéro. */
      setUnit: (unit) =>
        set((s) => ({ unit, filters: { ...s.filters, col: { ...FILTERS_INITIAL.col } } })),
      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      setColFilter: (c, v) =>
        set((s) => ({ filters: { ...s.filters, col: { ...s.filters.col, [c]: v } } })),
      poserFourchette: (k, which, v, exact) =>
        set((s) => {
          const { b, pas } = ECHELLES[k];
          return { filters: { ...s.filters, [k]: poserBorne(s.filters[k], b, pas, which, v, exact) } };
        }),
      poserCouleur: (c, which, v, exact) =>
        set((s) => {
          const { b, pas } = ECHELLES_COULEUR[s.unit];
          const pl = poserBorne(s.filters.col[c], b, pas, which, v, exact);
          return { filters: { ...s.filters, col: { ...s.filters.col, [c]: pl } } };
        }),
      setChip: (k, on) =>
        set((s) => ({ filters: { ...s.filters, chips: { ...s.filters.chips, [k]: on } } })),
      /**
       * Les critères de **station**, et eux seuls.
       *
       * Le budget est un critère de logement : il ne paraît sur aucun des deux
       * écrans qui portent « Tout retirer », et il y disparaissait donc sans
       * qu'aucun jeton ne l'ait annoncé. L'écran Logements, lui, le relâche
       * explicitement avec le reste de ses réglages.
       */
      resetFilters: () =>
        // Vider le champ relâche la station retenue, ici comme dans `setQ` :
        // le champ et l'intention ne peuvent pas diverger. Sans cela,
        // « Tout réinitialiser » depuis Comparer laissait un champ vide, une
        // station encore retenue, les étapes 2 et 3 déverrouillées sans que
        // rien ne les nomme, et l'accueil annonçant « Rechercher ouvrira les
        // logements aux 2 Alpes » au-dessus d'un champ vide. L'accueil s'en
        // tirait en appelant `setDestination(null)` juste après ; les trois
        // appels de Comparer, non. La règle appartient au magasin.
        set((s) => ({
          q: "",
          massif: null,
          stationId: null,
          lodgeId: null,
          booked: false,
          filters: { ...filtersVierges(), budget: s.filters.budget },
        })),
      restart: () => set({ stationId: null, lodgeId: null, cmp: [], pick: null, booked: false, seen: {} }),
      setStayOpen: (stayOpen) => set({ stayOpen }),
      setShared: (shared) => set({ shared }),
      say: (text) => set((s) => ({ toast: { text, nonce: (s.toast?.nonce ?? 0) + 1 } })),
    }),
    {
      name: "skitrack-parcours",
      /** Voir `migrerParcours` : version 2, les critères de recherche ;
       *  version 3, les identifiants de station retirés ; version 4, les
       *  seuils devenus fourchettes et le sens du tri. */
      version: PARCOURS_VERSION,
      migrate: migrerParcours,
      /** Ce qui survit à un rechargement.
       *
       *  Les critères de recherche y entrent : ils n'y étaient pas, et une
       *  touche F5 sur Comparer rendait la liste complète sans que rien ne
       *  l'ait demandé. Le champ destination (`q`) et la station retenue sont
       *  persistés ensemble — le champ montre donc toujours ce que la loupe
       *  fera, ce qui était l'objection contre la persistance de la station. */
      partialize: (s) => ({
        stationId: s.stationId,
        lodgeId: s.lodgeId,
        cmp: s.cmp,
        pick: s.pick,
        seen: s.seen,
        booked: s.booked,
        q: s.q,
        massif: s.massif,
        sortKey: s.sortKey,
        sortDir: s.sortDir,
        unit: s.unit,
        filters: s.filters,
      }),
    },
  ),
);

/* ---------- Libellés ---------- */

/** Espaces fine (U+202F) et insécable (U+00A0) que `toLocaleString('fr-FR')`
 *  glisse entre les milliers ; la maquette les remplace. */
/** `fmt` : entier arrondi, séparateur de milliers fr-FR, espace simple. Un
 *  nombre absent s'écrit « – » ; les écrans v7 préfèrent `fmtN`, qui rend
 *  `null` et laisse l'appelant écrire l'absence en toutes lettres.
 *
 *  Le formatage lui-même vit dans `devises.ts`, qui en a besoin pour écrire
 *  une somme : une seule implémentation, et non deux qui divergeraient sur
 *  l'espace des milliers. */
export function fmt(n: number | null | undefined): string {
  return n == null ? "–" : entier(n);
}

export function fmtN(n: number | null | undefined): string | null {
  return n == null ? null : fmt(n);
}

/** L'euro, cas particulier de `montant()` et non l'inverse. Trente appels
 *  emploient ces trois fonctions, et leur sortie ne change pas ; ce qui change
 *  est qu'une somme en francs suisses a maintenant où s'écrire. */
export function eur(n: number | null | undefined): string {
  return montant(n, "EUR");
}

export function eurN(n: number | null | undefined): string | null {
  return montantN(n, "EUR");
}

/** `eurCents` de la maquette : les centimes seulement quand il y en a. */
export function eurCents(n: number | null | undefined): string | null {
  return montantCents(n, "EUR");
}

/** Une décimale, avec la virgule en français et le point en anglais. */
function uneDecimale(n: number): string {
  const s = n.toFixed(1);
  return langue() === "en" ? s : s.replace(".", ",");
}

/** `distLbl` : mètres sous 1 km, sinon km à une décimale, virgule. */
export function distLbl(d: number | null | undefined): string {
  return d == null
    ? "–"
    : d < 1
      ? Math.round(d * 1000) + " m"
      : uneDecimale(d) + " km";
}

/** `mLbl` de la maquette : une distance en mètres, en m ou en km. */
export function mLbl(m: number | null | undefined): string | null {
  if (m == null) return null;
  return m < 1000 ? `${Math.round(m)} m` : `${uneDecimale(m / 1000)} km`;
}

/** `subLbl` : type, domaine, statut hors « En activité ». */
export function subLbl(s: Station): string {
  const kind = s.kind === "village-station" ? `${tr("Village-station")} · ` : "";
  const dom = s.domain ?? (sansDomaineAlpin(s.id) ? tr("Sans domaine alpin") : tr("Domaine non renseigné"));
  const st =
    s.status && s.status !== "En activité"
      ? " · " + s.status.replace("En activité", "").replace(/^[,( ]+|\)$/g, "")
      : "";
  return `${kind}${dom}${st}`;
}

const DAY_MS = 86_400_000;

function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Séjour réel : dates de `useStay`, nuits dérivées.
 *
 *  `nights` n'est pas ramené à zéro par un `Math.max` : une plage inversée
 *  rendait « 0 nuit », présenté comme un séjour ordinaire. Le compte brut est
 *  conservé et `valid` dit s'il a un sens, pour que l'écran le signale. */
export function useSejour() {
  const checkIn = useStay((s) => s.checkIn);
  const checkOut = useStay((s) => s.checkOut);
  const trav = useStay((s) => s.guests);
  const enfants = useStay((s) => s.children);
  const rooms = useStay((s) => s.bedrooms);
  const nights = nightsBetween(checkIn, checkOut);
  return {
    checkIn,
    checkOut,
    trav,
    enfants: clampChildren(enfants, trav),
    adultes: adults(trav, enfants),
    rooms,
    nights: nights ?? 0,
    valid: nights != null && nights > 0,
  };
}

/** Nuits entre deux dates ISO. `null` si l'une des deux est illisible. */
export function nightsBetween(checkIn: string, checkOut: string): number | null {
  const a = parseDay(checkIn).getTime();
  const b = parseDay(checkOut).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

const MOIS_COURTS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];
const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
/** Les mêmes en anglais britannique : « Sat 6 Feb ». */
const MOIS_COURTS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const JOURS_COURTS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const moisCourt = (i: number) => (langue() === "en" ? MOIS_COURTS_EN : MOIS_COURTS)[i];
const jourCourt = (i: number) => (langue() === "en" ? JOURS_COURTS_EN : JOURS_COURTS)[i];

/** `dm` de la maquette : « 6 févr. ». Tables fixes, pas d'ICU. */
export function dm(iso: string): string {
  const d = parseDay(iso);
  return `${d.getUTCDate()} ${moisCourt(d.getUTCMonth())}`;
}

/** `stayDatesLbl` : « 6 → 13 févr. · 7 nuits ». Le mois n'est nommé deux fois
 *  que si le séjour les traverse. Une plage inversée se signale. */
/** « 1 nuit », « 7 nuits ». L'accord était recopié à sept endroits, et quatre
 *  d'entre eux l'avaient figé au pluriel : le séjour descend à une nuit. */
export function nuitsLbl(nights: number): string {
  return trN(nights, "{n} nuit", "{n} nuits");
}

/** « 1 voyageur », « 8 voyageurs ». */
export function travLbl(trav: number): string {
  return trN(trav, "{n} voyageur", "{n} voyageurs");
}

/** Les dates seules, sans le compte de nuits : « 6 → 13 févr. ». La pilule de
 *  séjour de l'écran Logements tient sur une ligne, à côté du titre. */
export function datesCourtes(checkIn: string, checkOut: string): string {
  const a = parseDay(checkIn),
    b = parseDay(checkOut);
  return a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()
    ? `${a.getUTCDate()} → ${dm(checkOut)}`
    : `${dm(checkIn)} → ${dm(checkOut)}`;
}

export function datesLbl(checkIn: string, checkOut: string, nights: number): string {
  const a = parseDay(checkIn),
    b = parseDay(checkOut);
  const span =
    a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()
      ? `${a.getUTCDate()} → ${dm(checkOut)}`
      : `${dm(checkIn)} → ${dm(checkOut)}`;
  if (nights <= 0) return tr("{dates} · départ avant l’arrivée", { dates: span });
  return `${span} · ${nuitsLbl(nights)}`;
}

/** `arrivalLbl` : « sam. 6 févr. 2027 ». */
export function arrivalLbl(iso: string): string {
  const d = parseDay(iso);
  return `${jourCourt(d.getUTCDay())} ${dm(iso)} ${d.getUTCFullYear()}`;
}

/** `departLbl` : « sam. 13 févr. ». */
export function departLbl(iso: string): string {
  const d = parseDay(iso);
  return `${jourCourt(d.getUTCDay())} ${dm(iso)}`;
}

/** `guestsLbl` (barre de recherche) : « 6 adultes, 2 enfants · 2 ch. ». */
export function guestsLbl(trav: number, rooms: number, enfants = 0): string {
  return `${partyLabel(trav, enfants)}${rooms ? ` · ${tr("{n} ch.", { n: rooms })}` : ""}`;
}

/** `stayGroupLbl` : « 8 voyageurs · studio accepté ». */
export function groupLbl(trav: number, rooms: number, enfants = 0): string {
  return `${partyLabel(trav, enfants)} · ${rooms ? tr("{n} ch.", { n: rooms }) : tr("studio accepté")}`;
}

/** Sélecteur de séjour : `S[k] = clamp(S[k] + d)`, sur l'état réel. */
export function stepStay(k: "trav" | "enfants" | "rooms" | "nights", d: number) {
  const st = useStay.getState();
  const b = STAY_BOUNDS[k];
  if (k === "trav") {
    const guests = Math.min(b.max, Math.max(b.min, st.guests + d));
    // Retirer un voyageur alors que tout le groupe est enfant ne doit pas
    // laisser plus d'enfants que de personnes.
    return st.setStay({ guests, children: clampChildren(st.children, guests) });
  }
  if (k === "enfants")
    return st.setStay({ children: clampChildren(st.children + d, st.guests) });
  if (k === "rooms")
    return st.setStay({ bedrooms: Math.min(b.max, Math.max(b.min, st.bedrooms + d)) });
  const cur = Math.round(
    (parseDay(st.checkOut).getTime() - parseDay(st.checkIn).getTime()) / DAY_MS,
  );
  const next = Math.min(b.max, Math.max(b.min, cur + d));
  st.setStay({ checkOut: isoDay(new Date(parseDay(st.checkIn).getTime() + next * DAY_MS)) });
}

/** Pose une plage complète, arrivée puis départ, bornée à 21 nuits. */
export function setStayRange(checkIn: string, checkOut: string) {
  const n = nightsBetween(checkIn, checkOut) ?? 0;
  const nights = Math.min(STAY_BOUNDS.nights.max, Math.max(STAY_BOUNDS.nights.min, n));
  useStay
    .getState()
    .setStay({ checkIn, checkOut: isoDay(new Date(parseDay(checkIn).getTime() + nights * DAY_MS)) });
}
