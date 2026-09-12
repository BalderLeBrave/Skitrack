/** État du parcours de la maquette v6 (script l. 457–464 : `S`, `F`, `massif`,
 *  `q`, `sortKey`, `unit`) et ses libellés (`fmt`, `eur`, `distLbl`, `subLbl`,
 *  `datesLbl`, `groupLbl`).
 *
 *  Dates, voyageurs et chambres viennent de `useStay` (données réelles du
 *  dépôt) ; ici ne vivent que la station retenue, le logement choisi, la
 *  comparaison, les filtres de l'écran Comparer et le bandeau. */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { resolveStationPhoto } from "./stationPhoto.ts";
import { PARTY_LIMITS } from "./stay/party.ts";
import type { Station } from "./stations";
import { useStay } from "./stay";

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
 *  de photo, pas en afficher une cassée. `photoCreditFor` accompagne celles qui
 *  s'affichent. */
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
export type SortKey = "km" | "v" | "lo" | "hi" | "np" | "lifts" | "n";
export type KindFilter = "" | "station" | "village-station";

/** `COLS` de la maquette (l. 460) : clé, libellé, couleur. La couleur est un
 *  jeton de v6.css, jamais une valeur brute. */
export const COLS: { key: PisteColor; label: string; token: string }[] = [
  { key: "green", label: "Vertes", token: "var(--v6-piste-verte)" },
  { key: "blue", label: "Bleues", token: "var(--v6-piste-bleue)" },
  { key: "red", label: "Rouges", token: "var(--v6-piste-rouge)" },
  { key: "black", label: "Noires", token: "var(--v6-piste-noire)" },
];

export type Filters = {
  v: number;
  lo: number;
  hi: number;
  km: number;
  np: number;
  g: KindFilter;
  pass: string;
  col: Record<PisteColor, number>;
};

export const FILTERS_INITIAL: Filters = {
  v: 0,
  lo: 0,
  hi: 0,
  km: 0,
  np: 0,
  g: "",
  pass: "",
  col: { green: 0, blue: 0, red: 0, black: 0 },
};

/** Bornes du sélecteur de séjour.
 *
 *  Voyageurs et chambres viennent de `PARTY_LIMITS` (`stay/party.ts`), seul
 *  endroit où ces bornes sont tenues. La maquette les fixait à 12 et 1–6 : un
 *  groupe de quatorze ne pouvait pas s'exprimer, et le plancher de 1 chambre
 *  faisait **monter** la valeur quand on appuyait sur « − » à 0 chambre, qui
 *  est la valeur de repos du magasin. */
export const STAY_BOUNDS = {
  trav: { min: PARTY_LIMITS.travelers.min, max: PARTY_LIMITS.travelers.max },
  rooms: { min: PARTY_LIMITS.rooms.min, max: PARTY_LIMITS.rooms.max },
  nights: { min: 1, max: 21 },
} as const;

type Parcours = {
  stationId: string | null;
  lodgeId: string | null;
  cmp: string[];
  massif: string | null;
  q: string;
  sortKey: SortKey;
  unit: ColorUnit;
  filters: Filters;
  toast: { text: string; nonce: number } | null;
  /** l. 723 : la recherche de l'accueil sélectionne la première station à
   *  l'arrivée sur Comparer, 50 ms après. */
  selectFirst: boolean;
  setSelectFirst: (v: boolean) => void;
  retain: (id: string) => void;
  chooseLodge: (id: string | null) => void;
  toggleCmp: (id: string) => void;
  setMassif: (m: string | null) => void;
  setQ: (q: string) => void;
  setSort: (k: SortKey) => void;
  setUnit: (u: ColorUnit) => void;
  setFilters: (patch: Partial<Filters>) => void;
  setColFilter: (c: PisteColor, v: number) => void;
  resetFilters: () => void;
  say: (text: string) => void;
};

export const useParcours = create<Parcours>()(
  persist(
    (set, get) => ({
      stationId: null,
      lodgeId: null,
      cmp: [],
      massif: null,
      q: "",
      sortKey: "km",
      unit: "pct",
      filters: FILTERS_INITIAL,
      toast: null,
      selectFirst: false,
      setSelectFirst: (selectFirst) => set({ selectFirst }),
      /** `retain(id)` (l. 596) : changer de station oublie le logement. */
      retain: (id) => {
        if (get().stationId !== id) set({ stationId: id, lodgeId: null });
        useStay.getState().setStay({ stationId: id });
      },
      chooseLodge: (id) => set({ lodgeId: id }),
      /** `toggleCmp` (l. 530) : trois stations au plus. */
      toggleCmp: (id) => {
        const cmp = get().cmp;
        if (cmp.includes(id)) return set({ cmp: cmp.filter((x) => x !== id) });
        if (cmp.length >= 3) return get().say("Trois stations au plus dans la comparaison.");
        set({ cmp: [...cmp, id] });
      },
      setMassif: (massif) => set({ massif }),
      setQ: (q) => set({ q }),
      setSort: (sortKey) => set({ sortKey }),
      /** Changer d'unité remet les quatre seuils à zéro (l. 746). */
      setUnit: (unit) =>
        set((s) => ({ unit, filters: { ...s.filters, col: { ...FILTERS_INITIAL.col } } })),
      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      setColFilter: (c, v) =>
        set((s) => ({ filters: { ...s.filters, col: { ...s.filters.col, [c]: v } } })),
      resetFilters: () => set({ filters: { ...FILTERS_INITIAL, col: { ...FILTERS_INITIAL.col } } }),
      say: (text) => set((s) => ({ toast: { text, nonce: (s.toast?.nonce ?? 0) + 1 } })),
    }),
    {
      name: "skitrack-parcours",
      partialize: (s) => ({ stationId: s.stationId, lodgeId: s.lodgeId, cmp: s.cmp }),
    },
  ),
);

/* ---------- Libellés (l. 457–458, 468–469, 521–522) ---------- */

/** Espaces fine (U+202F) et insécable (U+00A0) que `toLocaleString('fr-FR')`
 *  glisse entre les milliers ; la maquette les remplace (l. 457). */
const NARROW_SPACES = new RegExp(
  `[${String.fromCharCode(0x202f)}${String.fromCharCode(0xa0)}]`,
  "g",
);

/** `fmt` : entier arrondi, séparateur de milliers fr-FR, espace simple. */
export function fmt(n: number | null | undefined): string {
  return n == null ? "–" : Math.round(n).toLocaleString("fr-FR").replace(NARROW_SPACES, " ");
}

export function eur(n: number | null | undefined): string {
  return fmt(n) + " €";
}

/** `distLbl` : mètres sous 1 km, sinon km à une décimale, virgule. */
export function distLbl(d: number | null | undefined): string {
  return d == null
    ? "–"
    : d < 1
      ? Math.round(d * 1000) + " m"
      : d.toFixed(1).replace(".", ",") + " km";
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
 *  `nights` n'est plus ramené à zéro par un `Math.max` : une plage inversée
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

function shortMonth(d: Date): string {
  return d.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" });
}

/** `datesLbl` (l. 468) : « 6 – 13 févr. · 7 nuits ». La maquette fige le mois ;
 *  avec des dates réelles, un séjour à cheval sur deux mois nomme les deux. */
export function datesLbl(checkIn: string, checkOut: string, nights: number): string {
  const a = parseDay(checkIn),
    b = parseDay(checkOut);
  const span =
    a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()
      ? `${a.getUTCDate()} – ${b.getUTCDate()} ${shortMonth(b)}`
      : `${a.getUTCDate()} ${shortMonth(a)} – ${b.getUTCDate()} ${shortMonth(b)}`;
  // Une plage inversée ou nulle ne s'écrit pas « 0 nuit », ce qui se lirait
  // comme un séjour d'un jour : elle se signale.
  if (nights <= 0) return `${span} · départ avant l’arrivée`;
  return `${span} · ${nights} nuit${nights > 1 ? "s" : ""}`;
}

/** « Arrivée le 6 févr. » (l. 211). */
export function arrivalLbl(checkIn: string): string {
  const a = parseDay(checkIn);
  return `${a.getUTCDate()} ${shortMonth(a)}`;
}

/** `groupLbl` (l. 469). */
export function groupLbl(trav: number, rooms: number): string {
  return `${trav} voyageurs · ${rooms} chambre${rooms > 1 ? "s" : ""}`;
}

/** Sélecteur de séjour (l. 497) : `S[k] = clamp(S[k] + d)`, sur l'état réel. */
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
