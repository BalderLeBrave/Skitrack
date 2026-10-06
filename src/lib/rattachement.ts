/**
 * À quelle station un logement appartient-il ?
 *
 * Trois preuves, dans cet ordre, validé par le propriétaire le 5 octobre 2026 :
 *
 * 1. **La localité publiée**, lue dans la table (`villages.ts`) : « Val
 *    Claret » est Tignes, « Plagne Centre » est La Plagne. Une localité qui
 *    n'est qu'une commune partagée par plusieurs stations ne prouve rien :
 *    Avoriaz est sur la commune de Morzine, Montchavin sur celle de La Plagne
 *    Tarentaise, Sollières-Sardières sur celle de Val-Cenis. On passe alors
 *    aux coordonnées.
 * 2. **Les coordonnées** : le repère le plus proche, station ou village (un
 *    village vaut sa station), à `RATTACHEMENT_MAX_KM` au plus. Le dépôt n'a
 *    pas de contour de domaine ; le repère fait foi. Au-delà, le logement
 *    n'est rattaché à rien : il est trop loin de toute station pour qu'un
 *    texte l'y ramène.
 * 3. **Le texte** — titre, lieu nommé, et la localité même quand elle n'est
 *    qu'une commune partagée —, seulement sans coordonnées.
 *
 * Sans aucune des trois, le logement est **non rattaché**, avec son motif
 * (`MotifNonRattache`), et l'écran les compte.
 *
 * Rien n'est enregistré : le rattachement se recalcule à chaque relecture
 * (`rejugerDomaine`), sur la table du jour.
 */

import { CLASSEUR } from "./classeur.ts";
import { memeGrandDomaine } from "./grandsDomaines.ts";
import { metresBetween } from "./remontees.ts";
import { STATIONS, stationById } from "./stations.ts";
import { RATTACHEMENT_MAX_KM, STATIONS_AJOUTEES, VILLAGES } from "./villages.ts";

export type IndicesLieu = {
  lat?: number | null;
  lon?: number | null;
  title?: string;
  locality?: string | null;
  placeName?: string | null;
};

/** Quelle preuve a rattaché le logement. */
export type ViaRattachement = "localite" | "coordonnees" | "texte";

/**
 * Pourquoi un logement n'est rattaché à aucune station.
 *
 * - `trop-loin` : ses coordonnées sont à plus de `RATTACHEMENT_MAX_KM` de
 *   tout repère de station ou de village ;
 * - `sans-lieu` : ni coordonnées, ni localité ou texte qui nomme une station
 *   ou un village de la table.
 */
export type MotifNonRattache = "trop-loin" | "sans-lieu";

export type Rattachement = {
  /** La station du logement, ou `null` s'il n'est pas rattaché. */
  stationId: string | null;
  /** Le village de la table qui a porté la preuve, s'il y en a un. */
  villageId: string | null;
  via: ViaRattachement | null;
  /** Distance au repère qui a rattaché (ou au plus proche, s'il est trop loin). */
  distanceM: number | null;
  motif: MotifNonRattache | null;
};

export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Hameaux et toponymes qui ne sont ni une station ni un village de la table,
 *  vers leur station. */
const LIEUX_ALIAS: Record<string, string> = {
  "le laisinant": "val-disere",
  tralenta: "bonneval-sur-arc",
  "l ecot": "bonneval-sur-arc",
  bonneval: "bonneval-sur-arc",
  "bonneval sur arc": "bonneval-sur-arc",
};

type Aiguille = { needle: string; stationId: string; villageId: string | null };

/** Les noms qu'on reconnaît dans une localité ou un texte, les plus longs
 *  d'abord : « tignes val claret » avant « tignes ». */
const AIGUILLES: Aiguille[] = (() => {
  const rows: Aiguille[] = [];
  const add = (nom: string, stationId: string, villageId: string | null) => {
    const needle = fold(nom);
    // Trop court pour prouver quoi que ce soit (« Orelle » passe, « Vars » non).
    if (needle.length >= 5) rows.push({ needle, stationId, villageId });
  };
  for (const [alias, id] of Object.entries(LIEUX_ALIAS)) add(alias, id, null);
  for (const s of STATIONS) {
    add(s.name, s.id, null);
    add(s.id.replace(/-/g, " "), s.id, null);
  }
  for (const v of VILLAGES) {
    add(v.nom, v.station, v.id);
    add(v.id.replace(/-/g, " "), v.station, v.id);
    for (const a of v.alias ?? []) add(a, v.station, v.id);
  }
  rows.sort((a, b) => b.needle.length - a.needle.length);
  return rows;
})();

/**
 * Communes qui portent plusieurs stations : une localité qui n'est que leur
 * nom ne désigne aucune d'elles. Tirées du classeur (commune INSEE de chaque
 * ligne, villages compris, chaque ligne ramenée à sa station) et des
 * stations ajoutées.
 */
const COMMUNES_PARTAGEES: ReadonlySet<string> = (() => {
  const parCommune = new Map<string, Set<string>>();
  const poser = (commune: string | null | undefined, id: string) => {
    if (!commune) return;
    const k = fold(commune);
    const set = parCommune.get(k) ?? new Set<string>();
    set.add(id);
    parCommune.set(k, set);
  };
  for (const e of CLASSEUR) {
    const s = stationById(e.id);
    if (s) poser(e.fm.commune, s.id);
  }
  for (const a of STATIONS_AJOUTEES) poser(a.commune, a.id);
  return new Set([...parCommune].filter(([, ids]) => ids.size > 1).map(([k]) => k));
})();

function chercher(raw: string | null | undefined): Aiguille | null {
  if (!raw) return null;
  const hay = ` ${fold(raw)} `;
  for (const row of AIGUILLES) if (hay.includes(` ${row.needle} `)) return row;
  return null;
}

/**
 * La localité publiée, sans les phrases de distance que certaines sources
 * écrivent à sa place. Airbnb publie « Morzine est à 11 km de Abondance » :
 * le lieu du logement est Morzine, et Abondance la station cherchée, qu'il ne
 * faut pas lire comme sa localité. Abritel publie « 1.7 km Lac de Lispach » :
 * une distance à un repère, pas une localité.
 */
export function localiteNette(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  const phrase = /^(.*?)\s+(?:est\s+[àa]|is)\s+[\d.,]+\s*k?m\b/i.exec(t);
  if (phrase) return phrase[1]!.trim() || null;
  if (/^[\d.,]+\s*k?m\b/i.test(t)) return null;
  return t;
}

/** La station qu'une localité publiée désigne, par la table. `null` si elle
 *  ne nomme rien, ou seulement une commune partagée — en entier (« La Plagne
 *  Tarentaise ») ou par le nom reconnu (« Morzine, Haute-Savoie »). */
export function stationDeLocalite(locality: string | null | undefined): Aiguille | null {
  const lieu = localiteNette(locality);
  if (!lieu || COMMUNES_PARTAGEES.has(fold(lieu))) return null;
  const a = chercher(lieu);
  return a && !COMMUNES_PARTAGEES.has(a.needle) ? a : null;
}

/** La station qu'un texte nomme (titre, lieu), par la table. */
export function stationIdFromText(raw: string | null | undefined): string | null {
  return chercher(raw)?.stationId ?? null;
}

type Repere = { lat: number; lon: number; stationId: string; villageId: string | null };

const REPERES: Repere[] = [
  ...STATIONS.map((s) => ({ lat: s.lat, lon: s.lon, stationId: s.id, villageId: null })),
  ...VILLAGES.map((v) => ({ lat: v.lat, lon: v.lon, stationId: v.station, villageId: v.id })),
];

/** Le repère le plus proche, station ou village, et sa distance en mètres. */
export function repereLePlusProche(lat: number, lon: number): Repere & { m: number } {
  let best = REPERES[0]!;
  let bestM = metresBetween(lat, lon, best.lat, best.lon);
  for (let i = 1; i < REPERES.length; i++) {
    const r = REPERES[i]!;
    const m = metresBetween(lat, lon, r.lat, r.lon);
    if (m < bestM) {
      best = r;
      bestM = m;
    }
  }
  return { ...best, m: Math.round(bestM) };
}

/** Distance au repère le plus proche d'une station, le sien ou celui d'un de
 *  ses villages, en mètres. */
function distanceALaStation(lat: number, lon: number, stationId: string): number {
  let best = Infinity;
  for (const r of REPERES) {
    if (r.stationId !== stationId) continue;
    best = Math.min(best, metresBetween(lat, lon, r.lat, r.lon));
  }
  return Math.round(best);
}

function aDesCoordonnees(h: IndicesLieu): h is IndicesLieu & { lat: number; lon: number } {
  // Un (0, 0) est un trou, pas un point dans le golfe de Guinée.
  return (
    h.lat != null &&
    h.lon != null &&
    Number.isFinite(h.lat) &&
    Number.isFinite(h.lon) &&
    !(h.lat === 0 && h.lon === 0)
  );
}

export function rattacher(h: IndicesLieu): Rattachement {
  const gps = aDesCoordonnees(h) ? repereLePlusProche(h.lat, h.lon) : null;

  const parLocalite = stationDeLocalite(h.locality);
  if (parLocalite) {
    return {
      stationId: parLocalite.stationId,
      villageId: parLocalite.villageId,
      via: "localite",
      // La distance au repère de la station désignée (le sien ou celui d'un
      // de ses villages), pas au repère le plus proche.
      distanceM: aDesCoordonnees(h)
        ? distanceALaStation(h.lat, h.lon, parLocalite.stationId)
        : null,
      motif: null,
    };
  }

  if (gps) {
    if (gps.m > RATTACHEMENT_MAX_KM * 1000) {
      return { stationId: null, villageId: null, via: null, distanceM: gps.m, motif: "trop-loin" };
    }
    return {
      stationId: gps.stationId,
      villageId: gps.villageId,
      via: "coordonnees",
      distanceM: gps.m,
      motif: null,
    };
  }

  // Sans coordonnées, une commune partagée redevient un indice parmi les
  // autres : « Morzine » seul vaut mieux que rien.
  const parTexte = chercher(
    `${localiteNette(h.locality) ?? ""} ${h.placeName ?? ""} ${h.title ?? ""}`,
  );
  if (parTexte) {
    return {
      stationId: parTexte.stationId,
      villageId: parTexte.villageId,
      via: "texte",
      distanceM: null,
      motif: null,
    };
  }
  return { stationId: null, villageId: null, via: null, distanceM: null, motif: "sans-lieu" };
}

/**
 * La station du logement lui-même, et non celle de la recherche qui l'a
 * relevé (`stationId`) : un logement de Lanslevillard trouvé en cherchant
 * Aussois est à Val-Cenis. C'est elle qu'une étiquette doit nommer, quels que
 * soient le logement et la station cherchée. Le rattachement se refait sur la
 * table du jour, comme à chaque relecture d'un relevé.
 *
 * `null` quand rien ne situe le logement près d'une station : la station
 * cherchée serait alors une supposition. Sur 43 516 annonces positionnées
 * (relevés au 5 octobre 2026), 5 904 sont à plus de `RATTACHEMENT_MAX_KM` de
 * tout repère, surtout des Booking en Suisse ou en Italie.
 */
export function stationPropre(l: IndicesLieu): string | null {
  return rattacher(l).stationId;
}

/**
 * Le lieu à écrire après la source : « Centrale · Val-Cenis ». Sans station,
 * la localité publiée (« Booking · Champéry ») ; sans rien, `null`, et
 * l'étiquette ne nomme que la source.
 */
export function nomStationPropre(l: IndicesLieu): string | null {
  const id = stationPropre(l);
  return (id ? stationById(id)?.name : null) ?? localiteNette(l.locality) ?? null;
}

/** « Centrale · Val-Cenis », ou « Centrale » seul quand rien ne situe le logement. */
export function sourceEtLieu(l: IndicesLieu & { source: string }): string {
  const lieu = nomStationPropre(l);
  return lieu ? `${l.source} · ${lieu}` : l.source;
}

/** Deux stations reliées à ski : le même grand domaine relié (`grandsDomaines.ts`).
 *  Jamais par un forfait commercial. */
export function stationsReliees(a: string, b: string): boolean {
  return memeGrandDomaine(a, b);
}
