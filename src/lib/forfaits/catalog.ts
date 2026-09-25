import raw from "./catalog.json" with { type: "json" };
import type { DomainForfait } from "./types";
import { deviseDuPays } from "../devises.ts";

export const FORFAIT_CATALOG: DomainForfait[] = raw as DomainForfait[];

/** Domaine principal d’une station mise en avant. */
export const STATION_FORFAIT_SLUG: Record<string, string> = {
  "les-2-alpes": "les-2-alpes",
  chamonix: "chamonix-les-grands-montets",
  "val-thorens": "val-thorens-orelle",
  tignes: "tignes-val-d-isere",
  meribel: "meribel",
  "val-disere": "tignes-val-d-isere",
  "alpe-d-huez": "alpe-d-huez-grand-domaine",
  "la-clusaz": "la-clusaz",
};

export function domainBySlug(slug: string): DomainForfait | undefined {
  return FORFAIT_CATALOG.find((d) => d.slug === slug);
}

function cam(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * La devise dans laquelle un domaine publie ses tarifs.
 *
 * Elle vient du pays du domaine, que le catalogue porte depuis l'origine sous
 * `country` — l'audit l'avait relevé, et c'est ce qui limite la reprise à son
 * alimentation. Un domaine dont le pays est inconnu de `geo/pays.ts` rend
 * `null` : l'appelant décide alors s'il affiche un prix sans unité ou pas de
 * prix du tout, ce qui vaut mieux qu'un euro supposé.
 */
export function deviseDuDomaine(slug: string | null | undefined): string | null {
  return slug ? deviseDuPays(domainBySlug(slug)?.country) : null;
}

export function domainForStation(stationId: string): DomainForfait | undefined {
  const preferred = STATION_FORFAIT_SLUG[stationId];
  if (preferred) return domainBySlug(preferred);
  const hit = FORFAIT_CATALOG.find((d) => d.stationIds.includes(stationId) || d.slug === stationId);
  if (hit) return hit;
  const key = cam(stationId);
  return FORFAIT_CATALOG.find((d) => cam(d.slug) === key || cam(d.name) === key);
}

/** Les nombres écrits en lettres, pour rapprocher « Les Trois Vallées » du
 *  « Les 3 Vallées » du catalogue. Dix suffisent : au-delà, aucun domaine
 *  français ne compte ses vallées. */
const CHIFFRES: Record<string, string> = {
  un: "1",
  une: "1",
  deux: "2",
  trois: "3",
  quatre: "4",
  cinq: "5",
  six: "6",
  sept: "7",
  huit: "8",
  neuf: "9",
  dix: "10",
};

/**
 * La clé de rapprochement d'un nom de domaine.
 *
 * Le référentiel de stations nomme les domaines comme OpenSkiMap — « Les Trois
 * Vallées », « Portes du Soleil (versant français) » —, le catalogue de
 * forfaits comme les pages officielles — « Les 3 Vallées », « Portes du Soleil
 * (600 km) ». Les deux désignent le même forfait ; il faut les faire tomber sur
 * la même clé.
 *
 * Ce qu'on retire : les parenthèses, qui portent une précision de périmètre et
 * non une identité ; l'article de tête ; la ponctuation. Ce qu'on convertit :
 * les nombres en lettres.
 */
export function cleDomaine(nom: string | null | undefined): string | null {
  if (!nom) return null;
  const sansParen = nom.replace(/\([^)]*\)/g, " ");
  const mots = cam(sansParen)
    .split("-")
    .filter(Boolean)
    .map((m) => CHIFFRES[m] ?? m);
  while (mots.length > 1 && ["le", "la", "les", "l"].includes(mots[0])) mots.shift();
  const cle = mots.join("-");
  return cle.length ? cle : null;
}

/**
 * Le domaine de forfait que désigne un nom de domaine skiable.
 *
 * L'ordre compte. Le `pass` et la `zone` nomment le forfait qui relie
 * plusieurs stations — c'est lui qu'on cherche ; le `name` ne nomme qu'une
 * station du domaine, et n'est consulté qu'à défaut.
 */
export function domainByName(nom: string | null | undefined): DomainForfait | undefined {
  const cle = cleDomaine(nom);
  if (!cle) return undefined;
  return (
    FORFAIT_CATALOG.find((d) => cleDomaine(d.pass) === cle) ??
    FORFAIT_CATALOG.find((d) => cleDomaine(d.seed?.zone) === cle) ??
    FORFAIT_CATALOG.find((d) => cleDomaine(d.name) === cle)
  );
}

/** Le rattachement d'une station à un tarif de forfait. */
export type Rattachement = {
  domaine: DomainForfait;
  /**
   * Le tarif ne vient pas d'une entrée propre à la station mais du domaine qui
   * la relie. Il est juste — c'est le même forfait — mais il se dit :
   * « prix du forfait Les 3 Vallées ».
   */
  herite: boolean;
  /** Le nom à citer dans la mention, quand le tarif est hérité. */
  nomDomaine: string | null;
};

/**
 * Le forfait d'une station, en passant par son domaine quand elle n'a pas
 * d'entrée à elle.
 *
 * Le catalogue ne rattache que 16 stations nommément ; tout le reste tient au
 * rapprochement des slugs. Courchevel Le Praz, Méribel Village, Reberty ou
 * Avoriaz tombaient donc à « non relevé » alors que leur domaine, lui, publie
 * son tarif — et que la fiche affichait déjà « Domaine relié : Les Trois
 * Vallées » juste à côté. L'information était là ; elle ne se montrait pas.
 */
export function rattachementForfait(
  stationId: string,
  nomDomaine: string | null | undefined,
): Rattachement | undefined {
  const propre = domainForStation(stationId);
  if (propre?.seed?.j6 != null) return { domaine: propre, herite: false, nomDomaine: null };
  const relie = domainByName(nomDomaine);
  if (relie?.seed?.j6 != null) {
    return { domaine: relie, herite: true, nomDomaine: relie.pass ?? nomDomaine ?? relie.name };
  }
  return propre ? { domaine: propre, herite: false, nomDomaine: null } : undefined;
}

/** Glacier : drapeau du catalogue de domaine, jamais inventé. */
export function stationHasGlacier(stationId: string): boolean {
  return domainForStation(stationId)?.glacier === true;
}

/** Km cités dans la zone de forfait (« Les 3 Vallées (600 km) »). */
export function kmInZone(zone: string | null | undefined): number | null {
  if (!zone) return null;
  const m = /(\d[\d\s]*)\s*km/i.exec(zone);
  if (!m) return null;
  const n = Number(m[1].replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

export type PassLink = {
  pass: string | null;
  zone: string | null;
  linkedKm: number | null;
  /** Forfait multi-stations publié, ou km de zone > km annoncés du domaine. */
  isLinked: boolean;
  line: string | null;
};

export function passLinkFor(stationId: string, announcedKm: number): PassLink {
  const d = domainForStation(stationId);
  if (!d) return { pass: null, zone: null, linkedKm: null, isLinked: false, line: null };
  const zone = d.seed?.zone ?? null;
  const pass = d.pass ?? null;
  const linkedKm = kmInZone(zone);
  const isLinked = pass != null || (linkedKm != null && linkedKm > announcedKm);
  return { pass, zone, linkedKm, isLinked, line: zone ?? pass };
}

const FORFAIT_ANCHORS: [number, number][] = [
  [20, 90],
  [50, 160],
  [100, 230],
  [150, 280],
  [300, 340],
  [600, 380],
];

function interpolate(anchors: [number, number][], x: number): number {
  if (x <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return anchors[anchors.length - 1][1];
}

/** Estimé seulement s’il n’existe aucun relevé. Exclu du coût officiel. */
export function estimateForfait(slopesKm: number, altitudeMax: number): { j1: number; j6: number; enf6: number } {
  const altitudeBonus = Math.max(0, Math.min(45, (altitudeMax - 2200) * 0.02));
  const j6 = Math.round((interpolate(FORFAIT_ANCHORS, slopesKm) + altitudeBonus) / 5) * 5;
  return { j6, j1: Math.round(j6 * 0.2), enf6: Math.round(j6 * 0.8) };
}
