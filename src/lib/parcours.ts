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
import { resolveStationPhoto } from "./stationPhoto.ts";
import { PARTY_LIMITS } from "./stay/party.ts";
import { stationById, type Station } from "./stations.ts";
import { useStay } from "./stay.ts";

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
  return `Aucune photo relevée pour ${s.name}`;
}

export type PisteColor = "green" | "blue" | "red" | "black";
export type ColorUnit = "pct" | "n" | "km";
/** Clés de tri de la maquette v7 (`<select value="{{ sort }}">`). */
export type SortKey = "km" | "hi" | "lo" | "v" | "pass" | "n";
/** Raccourcis de la maquette (`CH`) : chacun est un prédicat sur la station. */
export type ChipKey = "big" | "high" | "glacier" | "linked" | "family" | "steep";

/** `COLS` de la maquette : clé, libellé, couleur. La couleur est un jeton du
 *  système, jamais une valeur brute. */
export const COLS: { key: PisteColor; label: string; token: string }[] = [
  { key: "green", label: "Vertes", token: "var(--color-piste-verte)" },
  { key: "blue", label: "Bleues", token: "var(--color-piste-bleue)" },
  { key: "red", label: "Rouges", token: "var(--color-piste-rouge)" },
  { key: "black", label: "Noires", token: "var(--color-piste-noire)" },
];

/** `f`, `col`, `dom`, `chipsOn` de la maquette, réunis. Zéro ou chaîne vide
 *  vaut « indifférent » : un filtre au repos n'écarte rien. */
export type Filters = {
  /** Altitude du village, au moins (m). */
  v: number;
  /** Bas des pistes, au moins (m). */
  lo: number;
  /** Sommet, au moins (m). */
  hi: number;
  /** Km de pistes du domaine, au moins. */
  km: number;
  /** Forfait 6 jours adulte, au plus (€). */
  pass: number;
  /** Total du séjour, au plus (€). Critère de l'accueil, lu par Logements. */
  budget: number;
  /** Domaine skiable : nom exact, `__none` pour « non renseigné », vide = tous. */
  dom: string;
  col: Record<PisteColor, number>;
  chips: Partial<Record<ChipKey, boolean>>;
};

export const FILTERS_INITIAL: Filters = {
  v: 0,
  lo: 0,
  hi: 0,
  km: 0,
  pass: 0,
  budget: 0,
  dom: "",
  col: { green: 0, blue: 0, red: 0, black: 0 },
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
  setSort: (k: SortKey) => void;
  setUnit: (u: ColorUnit) => void;
  setFilters: (patch: Partial<Filters>) => void;
  setColFilter: (c: PisteColor, v: number) => void;
  setChip: (k: ChipKey, on: boolean) => void;
  /** `resetAll` de la maquette : recherche, massif, domaine, seuils, raccourcis. */
  resetFilters: () => void;
  /** `restart` : oublie station, logement, comparaison, annonces vues. */
  restart: () => void;
  setStayOpen: (v: boolean) => void;
  setShared: (v: boolean) => void;
  say: (text: string) => void;
};

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
          return get().say(`${CMP_MAX === 4 ? "Quatre" : CMP_MAX} stations au plus dans la comparaison.`);
        set({ cmp: [...cmp, id] });
      },
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
      setSort: (sortKey) => set({ sortKey }),
      /** Changer d'unité remet les quatre seuils de couleur à zéro. */
      setUnit: (unit) =>
        set((s) => ({ unit, filters: { ...s.filters, col: { ...FILTERS_INITIAL.col } } })),
      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      setColFilter: (c, v) =>
        set((s) => ({ filters: { ...s.filters, col: { ...s.filters.col, [c]: v } } })),
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
        set((s) => ({ q: "", massif: null, filters: { ...filtersVierges(), budget: s.filters.budget } })),
      restart: () => set({ stationId: null, lodgeId: null, cmp: [], pick: null, booked: false, seen: {} }),
      setStayOpen: (stayOpen) => set({ stayOpen }),
      setShared: (shared) => set({ shared }),
      say: (text) => set((s) => ({ toast: { text, nonce: (s.toast?.nonce ?? 0) + 1 } })),
    }),
    {
      name: "skitrack-parcours",
      /**
       * Version 2 : les critères de recherche entrent dans ce qui est persisté.
       *
       * Une entrée écrite par la version 1 porte une station retenue mais aucun
       * texte de destination — la fusion de zustand est superficielle, et `q`
       * reprendrait sa valeur initiale. L'écran afficherait alors un champ vide
       * et une loupe qui ouvre les logements d'une station que rien ne nomme,
       * ce qui est précisément l'état qu'on voulait supprimer. On relâche donc
       * la station, et la visite recommence proprement.
       */
      version: 2,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        if (version >= 2) return p;
        return { ...p, stationId: null, lodgeId: null, booked: false };
      },
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
        unit: s.unit,
        filters: s.filters,
      }),
    },
  ),
);

/* ---------- Libellés ---------- */

/** Espaces fine (U+202F) et insécable (U+00A0) que `toLocaleString('fr-FR')`
 *  glisse entre les milliers ; la maquette les remplace. */
const NARROW_SPACES = new RegExp(
  `[${String.fromCharCode(0x202f)}${String.fromCharCode(0xa0)}]`,
  "g",
);

/** `fmt` : entier arrondi, séparateur de milliers fr-FR, espace simple. Un
 *  nombre absent s'écrit « – » ; les écrans v7 préfèrent `fmtN`, qui rend
 *  `null` et laisse l'appelant écrire l'absence en toutes lettres. */
export function fmt(n: number | null | undefined): string {
  return n == null ? "–" : Math.round(n).toLocaleString("fr-FR").replace(NARROW_SPACES, " ");
}

export function fmtN(n: number | null | undefined): string | null {
  return n == null ? null : fmt(n);
}

export function eur(n: number | null | undefined): string {
  return fmt(n) + " €";
}

export function eurN(n: number | null | undefined): string | null {
  return n == null ? null : eur(n);
}

/** `eurCents` de la maquette : les centimes seulement quand il y en a. */
export function eurCents(n: number | null | undefined): string | null {
  if (n == null) return null;
  return (
    n
      .toLocaleString("fr-FR", {
        minimumFractionDigits: n % 1 ? 2 : 0,
        maximumFractionDigits: 2,
      })
      .replace(NARROW_SPACES, " ") + " €"
  );
}

/** `distLbl` : mètres sous 1 km, sinon km à une décimale, virgule. */
export function distLbl(d: number | null | undefined): string {
  return d == null
    ? "–"
    : d < 1
      ? Math.round(d * 1000) + " m"
      : d.toFixed(1).replace(".", ",") + " km";
}

/** `mLbl` de la maquette : une distance en mètres, en m ou en km. */
export function mLbl(m: number | null | undefined): string | null {
  if (m == null) return null;
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

/** `subLbl` : type, domaine, statut hors « En activité ». */
export function subLbl(s: Station): string {
  const kind = s.kind === "village-station" ? "Village-station · " : "";
  const dom = s.domain ?? "Domaine non renseigné";
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
  const rooms = useStay((s) => s.bedrooms);
  const nights = nightsBetween(checkIn, checkOut);
  return {
    checkIn,
    checkOut,
    trav,
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

/** `dm` de la maquette : « 6 févr. ». Tables fixes, pas d'ICU. */
export function dm(iso: string): string {
  const d = parseDay(iso);
  return `${d.getUTCDate()} ${MOIS_COURTS[d.getUTCMonth()]}`;
}

/** `stayDatesLbl` : « 6 → 13 févr. · 7 nuits ». Le mois n'est nommé deux fois
 *  que si le séjour les traverse. Une plage inversée se signale. */
export function datesLbl(checkIn: string, checkOut: string, nights: number): string {
  const a = parseDay(checkIn),
    b = parseDay(checkOut);
  const span =
    a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()
      ? `${a.getUTCDate()} → ${dm(checkOut)}`
      : `${dm(checkIn)} → ${dm(checkOut)}`;
  if (nights <= 0) return `${span} · départ avant l’arrivée`;
  return `${span} · ${nights} nuit${nights > 1 ? "s" : ""}`;
}

/** `arrivalLbl` : « sam. 6 févr. 2027 ». */
export function arrivalLbl(iso: string): string {
  const d = parseDay(iso);
  return `${JOURS_COURTS[d.getUTCDay()]} ${dm(iso)} ${d.getUTCFullYear()}`;
}

/** `departLbl` : « sam. 13 févr. ». */
export function departLbl(iso: string): string {
  const d = parseDay(iso);
  return `${JOURS_COURTS[d.getUTCDay()]} ${dm(iso)}`;
}

/** `guestsLbl` (barre de recherche) : « 8 voyageurs · 2 ch. ». */
export function guestsLbl(trav: number, rooms: number): string {
  return `${trav} voyageur${trav > 1 ? "s" : ""}${rooms ? ` · ${rooms} ch.` : ""}`;
}

/** `stayGroupLbl` : « 8 voyageurs · studio accepté ». */
export function groupLbl(trav: number, rooms: number): string {
  return `${trav} voyageur${trav > 1 ? "s" : ""} · ${rooms ? `${rooms} ch.` : "studio accepté"}`;
}

/** Sélecteur de séjour : `S[k] = clamp(S[k] + d)`, sur l'état réel. */
export function stepStay(k: "trav" | "rooms" | "nights", d: number) {
  const st = useStay.getState();
  const b = STAY_BOUNDS[k];
  if (k === "trav") return st.setStay({ guests: Math.min(b.max, Math.max(b.min, st.guests + d)) });
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
