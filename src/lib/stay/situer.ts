/**
 * Une position pour chaque annonce, quelle que soit la source.
 *
 * Un point déjà publié (liste, page, PDP, Apify, BAN, jumelage) ne bouge pas.
 * Une position déjà triangulée non plus : la carte de recherche Gîtes, un
 * barycentre déjà calculé, un repère, la station. Ce module ne comble que
 * l'absence de coordonnées plausibles.
 *
 * Ordre, le même que pour les gîtes (`situerAnnoncesGites`) :
 * 1. barycentre d'au moins deux points publiés du même lieu, toutes sources ;
 * 2. sinon le repère du référentiel qui porte ce lieu (un village écrase la
 *    station du même nom, parce que `reperesNommes` les range ainsi) ;
 * 3. sinon la station cherchée.
 *
 * Un seul voisin ne suffit pas. Un lieu vide ne regroupe rien. Un point
 * `triangule` n'est pas une ancre : ce n'est pas une porte, et il ne se
 * recopie pas. La phrase le dit dans `proven`.
 *
 * L'écran l'applique sur la liste déjà fusionnée (`placerSansPoint`). Le
 * collecteur ne l'écrit pas : une fiche lue ensuite pose encore le GPS que
 * la source publie (`poserLecture` ne remplace qu'un point absent). Ce point
 * ne se copie pas non plus dans un favori à la place d'un GPS publié.
 */

import type { Listing } from "../listings.ts";
import type { Station } from "../stations.ts";
import { STATIONS } from "../stations.ts";
import { VILLAGES } from "../villages.ts";
import { attachAccess } from "../access.ts";
import { gpsPrecis } from "./lodgingFilter.ts";

export type RepereNomme = { nom: string; lat: number; lon: number };

export type ContexteSituer = {
  reperes: readonly RepereNomme[];
  /** Dernier recours. Pas une porte. */
  station: { nom: string; lat: number; lon: number };
  /** Points publiés hors du lot (une annonce traitée seule). */
  autresPrecis?: readonly Pick<Listing, "lat" | "lon" | "locality" | "gpsSource">[];
};

/** Un point publié : coordonnées plausibles, et pas une triangulation. */
export function estPointPublie(l: Pick<Listing, "lat" | "lon" | "gpsSource">): boolean {
  return gpsPrecis(l) && l.gpsSource !== "triangule";
}

function plierLieu(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

let reperesCache: RepereNomme[] | null = null;

/** Stations, villages et alias du référentiel. Rien n'y est calculé. */
export function reperesNommes(): RepereNomme[] {
  if (reperesCache) return reperesCache;
  const out: RepereNomme[] = [];
  for (const s of STATIONS) out.push({ nom: s.name, lat: s.lat, lon: s.lon });
  for (const v of VILLAGES) {
    out.push({ nom: v.nom, lat: v.lat, lon: v.lon });
    for (const a of v.alias ?? []) out.push({ nom: a, lat: v.lat, lon: v.lon });
  }
  reperesCache = out;
  return out;
}

function indexReperes(reperes: readonly RepereNomme[]): Map<string, RepereNomme> {
  const m = new Map<string, RepereNomme>();
  // Le dernier gagne. `reperesNommes` range les villages après les stations :
  // le village, plus précis, écrase la station du même nom.
  for (const r of reperes) {
    const k = plierLieu(r.nom);
    if (k) m.set(k, r);
  }
  return m;
}

function barycentre(pts: readonly { lat: number; lon: number }[]): { lat: number; lon: number } {
  const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
}

function marquer(l: Listing, lat: number, lon: number, phrase: string): Listing {
  if (l.gpsSource === "triangule" && l.lat === lat && l.lon === lon && l.proven.includes(phrase)) return l;
  const proven = l.proven.includes(phrase) ? l.proven : `${l.proven} · ${phrase}`;
  return { ...l, lat, lon, gpsSource: "triangule", proven };
}

/**
 * Comble les annonces sans coordonnées plausibles. Les autres ressortent
 * inchangées, y compris un point déjà triangulé.
 */
export function situerManquants(listings: readonly Listing[], ctx: ContexteSituer): Listing[] {
  const precis = [...listings.filter(estPointPublie), ...(ctx.autresPrecis ?? []).filter(estPointPublie)];
  const parLieu = new Map<string, { lat: number; lon: number }[]>();
  for (const l of precis) {
    const k = plierLieu(l.locality);
    if (!k || l.lat == null || l.lon == null) continue;
    const lot = parLieu.get(k) ?? [];
    lot.push({ lat: l.lat, lon: l.lon });
    parLieu.set(k, lot);
  }
  const reperes = indexReperes(ctx.reperes);
  const stationOk = gpsPrecis(ctx.station);
  return listings.map((l) => {
    if (gpsPrecis(l)) return l;
    const k = plierLieu(l.locality);
    const pairs = k ? parLieu.get(k) : undefined;
    if (pairs && pairs.length >= 2) {
      const p = barycentre(pairs);
      return marquer(
        l,
        p.lat,
        p.lon,
        `position triangulée : barycentre de ${pairs.length} annonces au GPS publié${l.locality ? ` à ${l.locality}` : ""}`,
      );
    }
    const repere = k ? reperes.get(k) : undefined;
    if (repere && gpsPrecis(repere)) {
      return marquer(l, repere.lat, repere.lon, `position triangulée : repère « ${repere.nom} »`);
    }
    if (!stationOk) return l;
    return marquer(
      l,
      ctx.station.lat,
      ctx.station.lon,
      `position triangulée : station ${ctx.station.nom}, aucun point publié pour cette annonce`,
    );
  });
}

/**
 * L'annonce telle qu'une fiche ou un tableau la décrit : un point triangulé
 * reste sur la carte et dans le rayon, mais les distances qu'il donne ne
 * sont pas des mesures. Remontée, lieu et repère cherché repartent à vide,
 * comme pour une annonce sans point (`attachAccess`). Un point publié
 * ressort tel quel.
 */
export function mesuresPubliees<T extends Listing>(l: T): T {
  if (l.gpsSource !== "triangule") return l;
  return {
    ...l,
    distToSlopesM: null,
    distToLiftM: null,
    liftName: null,
    liftKind: null,
    liftLat: null,
    liftLon: null,
    liftOtherLat: null,
    liftOtherLon: null,
    distToPlaceM: null,
    searchedLiftM: null,
    searchedLiftName: null,
  };
}

/**
 * La liste telle que l'écran la montre : les trous de GPS sont triangulés,
 * et seuls ces logements-là refont leur accès aux pistes depuis ce point.
 * Un point déjà publié ressort tel quel, accès compris.
 */
export function placerSansPoint(listings: readonly Listing[], station: Station): Listing[] {
  const situes = situerManquants(listings, {
    reperes: reperesNommes(),
    station: { nom: station.name, lat: station.lat, lon: station.lon },
  });
  return situes.map((l, i) =>
    l.lat === listings[i]?.lat && l.lon === listings[i]?.lon ? l : attachAccess(l, station),
  );
}
