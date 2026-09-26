/**
 * Les critères de recherche, écrits dans l'adresse.
 *
 * Ce module ne tient **aucun état** : la source des critères reste
 * `useParcours` (destination, massif, seuils, raccourcis, tri) et `useStay`
 * (dates, voyageurs, chambres). Il n'en donne que l'écriture, dans les deux
 * sens, pour que l'adresse porte la recherche : un lien se partage, un signet
 * se repose, et le bouton Précédent du navigateur rend la recherche qu'il
 * vient de quitter au lieu d'une page vide.
 *
 * Les fonctions sont pures et testables sans navigateur ; le raccord avec le
 * routeur tient en un crochet, `useCriteresUrl`, en fin de fichier.
 *
 * Règle d'écriture : **un critère au repos ne s'écrit pas**. Une adresse ne
 * porte que ce qui a été demandé, si bien que `/comparer` sans paramètre veut
 * dire « la liste complète, tri par défaut », et le dit sans ambiguïté.
 */

import { useEffect, useRef } from "react";
import { COLS, FILTERS_INITIAL, useParcours, type ChipKey, type ColorUnit, type Filters, type PisteColor, type SortKey } from "./parcours.ts";
import { CHIPS } from "./v7.ts";
import { stationById } from "./stations.ts";
import { useStay } from "./stay.ts";

/** L'état lisible depuis l'adresse. Tout est facultatif : ce qui manque garde
 *  la valeur du magasin. */
export type Criteres = {
  q?: string;
  station?: string;
  massif?: string;
  v?: number;
  lo?: number;
  hi?: number;
  km?: number;
  pass?: number;
  budget?: number;
  dom?: string;
  col?: Partial<Record<PisteColor, number>>;
  chips?: ChipKey[];
  tri?: SortKey;
  unite?: ColorUnit;
  du?: string;
  au?: string;
  pers?: number;
  ch?: number;
};

const SEUILS = ["v", "lo", "hi", "km", "pass", "budget"] as const;
const TRIS: SortKey[] = ["km", "hi", "lo", "v", "pass", "n"];
const UNITES: ColorUnit[] = ["pct", "n", "km"];
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

function entier(raw: string | null, max = 100_000): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n);
}

/** Les critères, tels qu'ils s'écrivent dans une chaîne de requête. */
export function encoderCriteres(c: Criteres): string {
  const p = new URLSearchParams();
  if (c.station) p.set("station", c.station);
  // Le texte n'est écrit que s'il n'est pas déjà le nom de la station : deux
  // fois la même chose dans une adresse, c'est une occasion de diverger.
  if (c.q && (!c.station || c.q !== stationById(c.station)?.name)) p.set("q", c.q);
  if (c.massif) p.set("massif", c.massif);
  for (const k of SEUILS) {
    const n = c[k];
    if (n) p.set(k, String(n));
  }
  if (c.dom) p.set("dom", c.dom);
  const col = Object.entries(c.col ?? {}).filter(([, v]) => v);
  if (col.length) p.set("col", col.map(([k, v]) => `${k}:${v}`).join(","));
  if (c.chips?.length) p.set("chips", c.chips.join(","));
  if (c.tri && c.tri !== "km") p.set("tri", c.tri);
  if (c.unite && c.unite !== "pct") p.set("unite", c.unite);
  if (c.du) p.set("du", c.du);
  if (c.au) p.set("au", c.au);
  if (c.pers) p.set("pers", String(c.pers));
  if (c.ch) p.set("ch", String(c.ch));
  return p.toString();
}

/** L'inverse. Une valeur illisible est ignorée, jamais devinée. */
export function decoderCriteres(search: string): Criteres {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out: Criteres = {};
  // Un identifiant retiré (doublon, `IDS_RETIRES`) se lit sous celui qu'on
  // garde : un ancien favori « ?station=espace-aubrac » ouvre Laguiole.
  const station = p.get("station");
  const st = station ? stationById(station) : undefined;
  if (st) out.station = st.id;
  const q = p.get("q");
  if (q) out.q = q;
  else if (out.station) out.q = stationById(out.station)?.name;
  const massif = p.get("massif");
  if (massif) out.massif = massif;
  for (const k of SEUILS) {
    const n = entier(p.get(k));
    if (n) out[k] = n;
  }
  const dom = p.get("dom");
  if (dom) out.dom = dom;
  const col = p.get("col");
  if (col) {
    const cle = new Set(COLS.map((c) => c.key as string));
    const lu: Partial<Record<PisteColor, number>> = {};
    for (const part of col.split(",")) {
      const [k, v] = part.split(":");
      const n = entier(v ?? null, 1000);
      if (k && cle.has(k) && n) lu[k as PisteColor] = n;
    }
    if (Object.keys(lu).length) out.col = lu;
  }
  const chips = p.get("chips");
  if (chips) {
    const connues = new Set(Object.keys(CHIPS));
    const lu = chips.split(",").filter((k) => connues.has(k)) as ChipKey[];
    if (lu.length) out.chips = lu;
  }
  const tri = p.get("tri");
  if (tri && TRIS.includes(tri as SortKey)) out.tri = tri as SortKey;
  const unite = p.get("unite");
  if (unite && UNITES.includes(unite as ColorUnit)) out.unite = unite as ColorUnit;
  const du = p.get("du");
  if (du && JOUR.test(du)) out.du = du;
  const au = p.get("au");
  if (au && JOUR.test(au)) out.au = au;
  const pers = entier(p.get("pers"), 40);
  if (pers) out.pers = pers;
  const ch = entier(p.get("ch"), 40);
  if (ch != null) out.ch = ch;
  return out;
}

/** Les critères courants, lus sur les magasins. */
export function criteresCourants(): Criteres {
  const p = useParcours.getState();
  const st = useStay.getState();
  const f = p.filters;
  return {
    q: p.q.trim() || undefined,
    station: p.stationId ?? undefined,
    massif: p.massif ?? undefined,
    v: f.v || undefined,
    lo: f.lo || undefined,
    hi: f.hi || undefined,
    km: f.km || undefined,
    pass: f.pass || undefined,
    budget: f.budget || undefined,
    dom: f.dom || undefined,
    col: f.col,
    chips: (Object.keys(f.chips) as ChipKey[]).filter((k) => f.chips[k]),
    tri: p.sortKey,
    unite: p.unit,
    du: st.checkIn,
    au: st.checkOut,
    pers: st.guests,
    ch: st.bedrooms,
  };
}

/** Pose sur les magasins ce que l'adresse portait. Ce qu'elle ne portait pas
 *  est remis au repos : une adresse est une recherche entière, pas un patch. */
export function appliquerCriteres(c: Criteres): void {
  const filters: Filters = {
    ...FILTERS_INITIAL,
    v: c.v ?? 0,
    lo: c.lo ?? 0,
    hi: c.hi ?? 0,
    km: c.km ?? 0,
    pass: c.pass ?? 0,
    budget: c.budget ?? 0,
    dom: c.dom ?? "",
    col: { ...FILTERS_INITIAL.col, ...(c.col ?? {}) },
    chips: Object.fromEntries((c.chips ?? []).map((k) => [k, true])),
  };
  const avant = useParcours.getState().stationId;
  useParcours.setState({
    q: c.q ?? "",
    stationId: c.station ?? null,
    massif: c.massif ?? null,
    sortKey: c.tri ?? "km",
    unit: c.unite ?? "pct",
    filters,
    // Changer de station emporte le logement choisi et le drapeau « réservé »,
    // comme partout ailleurs : sans cela, l'adresse d'une station pouvait
    // rendre une réservation sur une autre.
    ...(avant !== (c.station ?? null) ? { lodgeId: null, booked: false } : {}),
  });
  const stay: Partial<{ checkIn: string; checkOut: string; guests: number; bedrooms: number }> = {};
  if (c.du) stay.checkIn = c.du;
  if (c.au) stay.checkOut = c.au;
  if (c.pers) stay.guests = c.pers;
  if (c.ch != null) stay.bedrooms = c.ch;
  if (Object.keys(stay).length) useStay.getState().setStay(stay);
}

/** Vrai quand la chaîne de requête porte au moins un critère lisible. */
export function porteDesCriteres(search: string): boolean {
  return Object.keys(decoderCriteres(search)).length > 0;
}

/**
 * Tient l'adresse en phase avec les critères, sur l'écran qui l'appelle.
 *
 * Trois moments, et un seul sens à chaque fois :
 *
 * 1. **à l'arrivée sur une adresse portant des critères**, l'adresse gagne :
 *    c'est elle qui a été ouverte, collée, ou rendue par le bouton Précédent ;
 * 2. **à chaque changement d'écran**, les critères sont réécrits dans la
 *    nouvelle adresse — `go("compare")` navigue vers `/comparer` nu, et sans
 *    cela la nouvelle entrée d'historique ne porterait rien ;
 * 3. **à chaque changement de critère**, l'adresse est réécrite par
 *    `replaceState` : chaque cran d'un curseur n'a pas à devenir une entrée
 *    d'historique.
 *
 * `pathname` est fourni par l'appelant, qui le lit sur le routeur : ce module
 * n'en dépend pas.
 */
export function useCriteresUrl(actif = true, pathname = ""): void {
  // Ce que l'adresse portait à l'arrivée sur cet écran-ci. Un aller-retour par
  // le bouton Précédent doit relire, et non écraser.
  const luRef = useRef<string | null>(null);
  useEffect(() => {
    if (!actif || typeof window === "undefined") return;
    const ecrire = () => {
      const qs = encoderCriteres(criteresCourants());
      const cible = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
      if (cible !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState(window.history.state, "", cible);
      }
    };
    if (luRef.current !== pathname) {
      luRef.current = pathname;
      const search = window.location.search;
      if (porteDesCriteres(search)) appliquerCriteres(decoderCriteres(search));
    }
    ecrire();
    // Le bouton Précédent peut sauter plusieurs crans et retomber sur le même
    // chemin : l'effet ne rejoue pas, et sans cet écouteur l'adresse rendue
    // n'était ni relue ni appliquée.
    const surRetour = () => {
      const search = window.location.search;
      if (porteDesCriteres(search)) appliquerCriteres(decoderCriteres(search));
      else ecrire();
    };
    window.addEventListener("popstate", surRetour);
    const off1 = useParcours.subscribe(ecrire);
    const off2 = useStay.subscribe(ecrire);
    return () => {
      window.removeEventListener("popstate", surRetour);
      off1();
      off2();
    };
  }, [actif, pathname]);
}
