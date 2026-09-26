/** Un logement n’appartient à un domaine que s’il y est vraiment, pas s’il est « à 5 km à vol d’oiseau ». */

import { domaineNomme } from "./classeur.ts";
import type { Listing } from "./listings.ts";
import { metresBetween } from "./osmAccess.ts";
import { domainForStation, FORFAIT_CATALOG } from "./forfaits/catalog.ts";
import { STATIONS, stationById, type Station } from "./stations.ts";
import { aStation } from "./v7.ts";

export type GeoHint = {
  lat?: number | null;
  lon?: number | null;
  title?: string;
  locality?: string | null;
  placeName?: string | null;
};

export type DomainVerdict = "in" | "linked" | "other" | "unknown";

export type DomainFit = {
  searchedId: string;
  nearestStationId: string | null;
  nearestStationName: string | null;
  distToSearchedPinM: number | null;
  distToNearestPinM: number | null;
  verdict: DomainVerdict;
  winterBarrier: string | null;
};

/** Cols fermés l’hiver : proches à vol d’oiseau, pas le même domaine skiable. */
const WINTER_BARRIERS: { a: string; b: string; col: string }[] = [
  { a: "val-disere", b: "bonneval-sur-arc", col: "col de l’Iseran" },
  { a: "val-disere", b: "bessans", col: "col de l’Iseran" },
  { a: "val-disere", b: "val-cenis", col: "col de l’Iseran" },
  { a: "tignes", b: "bonneval-sur-arc", col: "col de l’Iseran" },
  { a: "tignes", b: "bessans", col: "col de l’Iseran" },
  { a: "tignes", b: "val-cenis", col: "col de l’Iseran" },
];

/**
 * Stations qui portent le même libellé de domaine sans être reliées à ski.
 *
 * Le classeur range sous « Portes du Soleil (versant français) » tout le
 * versant, et `sameDomain` en concluait qu'un logement de Morzine est à
 * Abondance. OpenSkiMap fait d'Abondance une zone à part : aucune remontée ne
 * la relie à Morzine, les plus proches (Corne 2, Crusaz) sont à 8,7 km. Dans le
 * relevé d'Abondance du propriétaire, 76 annonces sur 130 avaient pour repère
 * le plus proche Morzine (38), Montriond (24), Avoriaz (8) ou
 * Saint-Jean-d'Aulps (6), et passaient « dans le domaine » ; « Appartement
 * Hermine – 4 personnes – Morzine », à 10,7 km, s'affichait « Airbnb ·
 * Abondance ». Sans elles, les logements retenus passent de 116 à 48, et leur
 * médiane de 6 492 à 4 186 € (audit du 26 septembre 2026).
 *
 * Seul le libellé commun est désavoué ici ; un lien de forfait (`linked`) ne
 * l'est que pour les paires que le propriétaire a déliées (`DELIEES`). La
 * règle « même domaine » ne change pas
 * pour les autres : 1 658 annonces l'utilisent, presque toutes à juste titre
 * (Paradiski, Tignes – Val d'Isère, Grand Massif).
 */
const MEME_LIBELLE_NON_RELIEES: { a: string; b: string }[] = [
  { a: "abondance", b: "morzine" },
  { a: "abondance", b: "montriond" },
  { a: "abondance", b: "avoriaz" },
  { a: "abondance", b: "les-gets" },
  { a: "abondance", b: "saint-jean-daulps" },
];

/** Hameaux / toponymes → station, jamais un autre versant. */
const PLACE_ALIAS: Record<string, string> = {
  "le fornet": "val-disere",
  fornet: "val-disere",
  "la daille": "val-disere",
  "le laisinant": "val-disere",
  tralenta: "bonneval-sur-arc",
  "l ecot": "bonneval-sur-arc",
  "l'ecot": "bonneval-sur-arc",
  bonneval: "bonneval-sur-arc",
  "bonneval sur arc": "bonneval-sur-arc",
  "bonneval-sur-arc": "bonneval-sur-arc",
};

const EXTRA_LINKED: string[][] = [
  ["alpe-d-huez", "auris-en-oisans", "vaujany", "oz-en-oisans", "villard-reculas"],
];

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function barrierBetween(a: string, b: string): string | null {
  if (a === b) return null;
  for (const row of WINTER_BARRIERS) {
    if ((row.a === a && row.b === b) || (row.a === b && row.b === a)) return row.col;
  }
  return null;
}

/**
 * Stations déliées par le propriétaire (26 septembre 2026) : ni le libellé
 * commun ni le forfait ne les réunissent. Abondance ne partage avec Châtel et
 * La Chapelle-d'Abondance que le forfait des Portes du Soleil, sans liaison à
 * ski directe : un relevé d'Abondance ne montre plus leurs logements.
 */
const DELIEES: { a: string; b: string }[] = [
  { a: "abondance", b: "chatel" },
  { a: "abondance", b: "la-chapelle-dabondance" },
];

function dansLaListe(liste: readonly { a: string; b: string }[], a: string, b: string): boolean {
  if (a === b) return false;
  return liste.some((row) => (row.a === a && row.b === b) || (row.a === b && row.b === a));
}

/** Même libellé de domaine, mais aucune liaison à ski entre les deux. */
export function memeLibelleNonReliees(a: string, b: string): boolean {
  return dansLaListe(MEME_LIBELLE_NON_RELIEES, a, b) || dansLaListe(DELIEES, a, b);
}

/** Déliées par le propriétaire : pas même par le forfait (`DELIEES`). */
export function stationsDeliees(a: string, b: string): boolean {
  return dansLaListe(DELIEES, a, b);
}

let linkedCache: Map<string, Set<string>> | null = null;

function linkedIndex(): Map<string, Set<string>> {
  if (linkedCache) return linkedCache;
  const groups: string[][] = [...EXTRA_LINKED];
  const byPass = new Map<string, string[]>();
  for (const d of FORFAIT_CATALOG) {
    const ids = [...(d.stationIds ?? [])];
    if (stationById(d.slug)) ids.push(d.slug);
    if (d.pass) {
      const cur = byPass.get(d.pass) ?? [];
      cur.push(...ids);
      byPass.set(d.pass, cur);
    } else if (ids.length > 1) {
      groups.push(ids);
    }
  }
  for (const ids of byPass.values()) groups.push(ids);
  for (const s of STATIONS) {
    const d = domainForStation(s.id);
    if (!d) continue;
    const ids = [...(d.stationIds ?? []), d.slug, s.id].filter(Boolean);
    groups.push(ids);
  }
  const map = new Map<string, Set<string>>();
  const add = (id: string, other: string) => {
    let set = map.get(id);
    if (!set) {
      set = new Set([id]);
      map.set(id, set);
    }
    set.add(other);
  };
  for (const g of groups) {
    // L'identifiant de la station, pas celui qu'on a demandé : un identifiant
    // retiré (`IDS_RETIRES`) se résout vers la station gardée.
    const ids = [...new Set(g.map((id) => stationById(id)?.id).filter((id): id is string => !!id))];
    for (const a of ids) for (const b of ids) add(a, b);
  }
  linkedCache = map;
  return map;
}

export function linkedSkiStations(stationId: string): Set<string> {
  return linkedIndex().get(stationId) ?? new Set([stationId]);
}

export function winterBarrier(a: string, b: string): string | null {
  return barrierBetween(a, b);
}

export function nearestStationPin(
  lat: number,
  lon: number,
): { station: Station; m: number } {
  let best = STATIONS[0]!;
  let bestM = metresBetween(lat, lon, best.lat, best.lon);
  for (let i = 1; i < STATIONS.length; i++) {
    const s = STATIONS[i]!;
    const m = metresBetween(lat, lon, s.lat, s.lon);
    if (m < bestM) {
      best = s;
      bestM = m;
    }
  }
  return { station: best, m: Math.round(bestM) };
}

const NAME_IDS: { needle: string; id: string }[] = (() => {
  const rows: { needle: string; id: string }[] = [];
  for (const [alias, id] of Object.entries(PLACE_ALIAS)) {
    rows.push({ needle: fold(alias), id });
  }
  for (const s of STATIONS) {
    rows.push({ needle: fold(s.name), id: s.id });
    rows.push({ needle: fold(s.id.replace(/-/g, " ")), id: s.id });
  }
  rows.sort((a, b) => b.needle.length - a.needle.length);
  return rows;
})();

export function stationIdFromText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hay = ` ${fold(raw)} `;
  for (const row of NAME_IDS) {
    if (row.needle.length < 5 && row.needle !== "fornet") continue;
    if (hay.includes(` ${row.needle} `)) return row.id;
  }
  return null;
}

export function domainFit(listing: GeoHint, searched: Station): DomainFit {
  const pinM =
    listing.lat != null && listing.lon != null
      ? Math.round(metresBetween(listing.lat, listing.lon, searched.lat, searched.lon))
      : null;
  const gps =
    listing.lat != null && listing.lon != null
      ? nearestStationPin(listing.lat, listing.lon)
      : null;
  const textId = stationIdFromText(`${listing.locality ?? ""} ${listing.placeName ?? ""} ${listing.title}`);
  const nearestId = gps?.station.id ?? textId;
  const nearest = nearestId ? stationById(nearestId) : undefined;
  if (!nearest) {
    return {
      searchedId: searched.id,
      nearestStationId: null,
      nearestStationName: null,
      distToSearchedPinM: pinM,
      distToNearestPinM: null,
      verdict: "unknown",
      winterBarrier: null,
    };
  }
  const col = barrierBetween(searched.id, nearest.id);
  const linked =
    !col && !stationsDeliees(searched.id, nearest.id) && linkedSkiStations(searched.id).has(nearest.id);
  // Le classeur découpe les grands domaines en sous-stations (Arc 1600, Plagne
  // Centre, Le Fornet…). Deux pins du même domaine skiable, sans col fermé
  // entre eux, sont le même domaine — comparer les identifiants ne suffit plus.
  // Un libellé qui ne nomme pas de domaine (`domaineNomme`) ne réunit rien, et
  // un libellé commun sans liaison à ski non plus (`memeLibelleNonReliees`).
  const sameDomain =
    !col &&
    domaineNomme(nearest.domain) &&
    nearest.domain === searched.domain &&
    !memeLibelleNonReliees(searched.id, nearest.id);
  let verdict: DomainVerdict;
  if (nearest.id === searched.id) verdict = "in";
  else if (linked) verdict = "linked";
  else if (sameDomain) verdict = "in";
  else verdict = "other";
  return {
    searchedId: searched.id,
    nearestStationId: nearest.id,
    nearestStationName: nearest.name,
    distToSearchedPinM: pinM,
    distToNearestPinM: gps?.m ?? null,
    verdict,
    winterBarrier: col,
  };
}

export function inSearchedDomain(fit: DomainFit): boolean {
  return fit.verdict === "in" || fit.verdict === "linked";
}

/**
 * Le verdict de domaine d'une annonce déjà relevée, rejugé sur le référentiel
 * d'aujourd'hui.
 *
 * `attachAccess` tranche au relevé, et l'annonce enregistrée garde ce verdict :
 * une correction de rattachement (La Bourboule détachée de Super Besse,
 * Lispach rendue à son domaine, Abondance séparée de Morzine) ne changeait
 * donc rien aux relevés déjà faits avant qu'on relève à nouveau la station.
 * Au 26 septembre 2026, les 37 annonces du Mont-Dore restaient « à La
 * Bourboule ». Rejugée à la relecture, avec la même fonction et la station du
 * relevé, l'annonce suit le référentiel.
 *
 * Comme `attachAccess`, une annonce sortie du domaine perd sa remontée : elle
 * n'est pas la sienne, et la distance se rabat sur le repère de la station
 * cherchée. Une annonce qui y entre la retrouve à la remesure
 * (`remesurerRemontee`), qui doit donc passer après. Sans position, rien n'est
 * rejugé : le texte seul a déjà tranché au relevé, et les annonces de l'ancien
 * format, sans position, gardent ce qu'elles avaient.
 */
export function rejugerDomaine<L extends Listing>(l: L, searched: Station | undefined): L {
  if (!searched || l.lat == null || l.lon == null) return l;
  const fit = domainFit(l, searched);
  const juge: L = {
    ...l,
    domainFit: fit.verdict,
    nearestDomainId: fit.nearestStationId,
    nearestDomainName: fit.nearestStationName,
    distToNearestDomainM: fit.distToNearestPinM,
    winterBarrier: fit.winterBarrier,
  };
  if (inSearchedDomain(fit)) return juge;
  return {
    ...juge,
    distToLiftM: null,
    liftName: null,
    liftKind: null,
    liftLat: null,
    liftLon: null,
    liftOtherLat: null,
    liftOtherLon: null,
  };
}

export function otherDomainMessage(fit: DomainFit, searchedName: string): string | null {
  if (fit.verdict !== "other" || !fit.nearestStationName) return null;
  if (fit.winterBarrier) {
    return `Autre domaine : ${fit.nearestStationName}. Ce logement n’est pas ${aStation(searchedName)} : le ${fit.winterBarrier} est fermé l’hiver, et il n’y a ni liaison à ski ni route directe.`;
  }
  return `Autre domaine : ${fit.nearestStationName}. Ce logement n’est ni ${aStation(searchedName)} ni sur un domaine relié en saison.`;
}
