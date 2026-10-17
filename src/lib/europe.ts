/**
 * Les domaines européens hors de France, comme destinations de la recherche.
 *
 * Le référentiel mondial (`monde/monde.ts`, OpenSkiMap) décrit 2 510 domaines
 * hors de France ; la France garde ses stations du classeur (`stations.ts`),
 * qui la décrivent mieux. Ici, chaque domaine étranger devient une `Station`,
 * pour que le champ Destination le propose et que la recherche de logements
 * le serve avec le même écran que les stations françaises.
 *
 * Les fichiers des pays (1,1 Mo) ne sont pas dans le paquet de départ : ils
 * arrivent au premier besoin (`chargerEurope`), comme la liste des communes.
 * Avant : `stationEurope` ne trouve rien, et la France seule est servie.
 *
 * **Aucune valeur n'est estimée.** Une altitude non relevée vaut 0, ce que
 * les écrans lisent comme « non mesuré » (`v7.ts`) ; l'altitude du village,
 * qu'OpenSkiMap ne donne pas, aussi.
 */

import { foldName } from "./carte.ts";
import { shareFromCounts, type ColorCounts } from "./classeur.ts";
import { paysByCode } from "./geo/pays.ts";
import {
  domainesPays,
  PAYS_AVEC_DOMAINES,
  RELEVE_MONDE,
  type DomaineMonde,
} from "./monde/monde.ts";
import { brancherStationsEtrangeres, type Station } from "./stations.ts";

let parId: Map<string, Station> | null = null;
let chargement: Promise<void> | null = null;
const abonnes = new Set<() => void>();

/** Le nom du pays en français, « Autriche » ; le code s'il est inconnu. */
export function nomPays(cc: string): string {
  return paysByCode(cc)?.nomFr ?? cc;
}

/** Un identifiant européen commence par le code du pays : « at-ischgl ». */
export function idEuropeen(id: string): boolean {
  return /^[a-z]{2}-/.test(id) && !id.startsWith("fr-");
}

export function stationDuDomaine(d: DomaineMonde): Station {
  const cc = d.pays[0] ?? "";
  const counts: ColorCounts | null = d.counts ? { ...d.counts, other: d.nOther ?? 0 } : null;
  return {
    id: d.id,
    name: d.nom,
    country: cc,
    massif: d.region ?? nomPays(cc),
    villageM: 0,
    minM: d.minM ?? 0,
    maxM: d.maxM ?? 0,
    photo: null,
    fmId: null,
    fmVillageM: null,
    fmMinM: null,
    fmMaxM: null,
    demM: null,
    pinKind: "inconnu",
    gpsDup: false,
    lat: d.lat,
    lon: d.lon,
    posRelevee: true,
    slopes: {
      announcedKm: d.km ?? 0,
      counts: d.counts ?? {},
      source: "osm",
      quality: d.counts ? "segments" : "partial",
    },
    origin: "classeur",
    inClasseur: false,
    kind: "station",
    dept: null,
    commune: d.localite,
    status: null,
    domain: null,
    pistesKm: d.km,
    pistesKmScale: d.km != null ? "domaine" : null,
    segments: d.n,
    lifts: d.lifts,
    liftsScale: d.lifts != null ? "domaine" : null,
    distToPisteKm: null,
    colorShare: shareFromCounts(counts),
    colorScale: counts ? "domaine" : null,
    colorCounts: counts,
    skiinfoPct: null,
    measuredAt: RELEVE_MONDE,
    medianM: null,
    above2000Pct: null,
  };
}

type FichierLieux = { ids: string[]; lieux: [string, number, number][] };
type Lieu = { f: string; nom: string; stationId: string; km: number };
let lieux: Lieu[] = [];

/** Ouvre les pays européens hors France et leurs villes et villages
 *  (`lieuxEurope.json`, `scripts/build-lieux-europe.mjs`). Un échec se
 *  retente au besoin suivant. */
export function chargerEurope(): Promise<void> {
  chargement ??= Promise.all([
    Promise.all(
      PAYS_AVEC_DOMAINES.filter((cc) => cc !== "FR" && paysByCode(cc)?.continent === "europe").map(
        (cc) => domainesPays(cc),
      ),
    ),
    import("./lieuxEurope.json", { with: { type: "json" } }).then(
      (m) => m.default as unknown as FichierLieux,
    ),
  ]).then(
    ([listes, fichier]) => {
      const m = new Map<string, Station>();
      for (const d of listes.flat()) {
        // Un domaine à cheval sur la France est déjà servi par le classeur.
        if (d.pays[0] === "FR" || m.has(d.id)) continue;
        m.set(d.id, stationDuDomaine(d));
      }
      lieux = fichier.lieux
        .map(([nom, i, km]) => ({ f: foldName(nom), nom, stationId: fichier.ids[i] ?? "", km }))
        .filter((l) => m.has(l.stationId));
      parId = m;
      brancherStationsEtrangeres((id) => m.get(id));
      for (const f of abonnes) f();
    },
    (e: unknown) => {
      chargement = null;
      throw e;
    },
  );
  return chargement;
}

export function europeChargee(): boolean {
  return parId != null;
}

/** Prévient quand les domaines sont arrivés ; rend de quoi se désabonner. */
export function surEuropeChargee(f: () => void): () => void {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

export function stationEurope(id: string): Station | undefined {
  return parId?.get(id);
}

export type DomaineTrouve = {
  station: Station;
  /** La ville ou le village tapé, quand c'est lui qui désigne le domaine. */
  lieu: string | null;
  /** Distance du lieu au repère du domaine, en kilomètres. */
  km: number | null;
};

/**
 * Les domaines que le texte (déjà replié par `foldName`) désigne : par leur
 * nom (exact, puis début, puis contenu), puis par une ville ou un village
 * proche (« Kitzbühel » désigne KitzSki, à 3 km). Deux domaines du même nom
 * dans le même pays n'en font qu'un : le plus grand.
 */
export function domainesEuropePour(ql: string, max = 12): DomaineTrouve[] {
  if (!parId || ql.length < 3) return [];
  const out: (DomaineTrouve & { rang: number })[] = [];
  for (const s of parId.values()) {
    const n = foldName(s.name);
    const rang = n === ql ? 0 : n.startsWith(ql) ? 1 : n.includes(ql) ? 3 : -1;
    if (rang >= 0) out.push({ station: s, lieu: null, km: null, rang });
  }
  for (const l of lieux) {
    const rang = l.f === ql ? 2 : l.f.startsWith(ql) ? 4 : -1;
    const s = rang >= 0 ? parId.get(l.stationId) : undefined;
    if (s) out.push({ station: s, lieu: l.nom, km: l.km, rang });
  }
  out.sort(
    (a, b) =>
      a.rang - b.rang ||
      (a.km ?? 0) - (b.km ?? 0) ||
      (b.station.pistesKm ?? 0) - (a.station.pistesKm ?? 0),
  );
  const vus = new Set<string>();
  const res: DomaineTrouve[] = [];
  for (const { station, lieu, km } of out) {
    const cle = `${station.country}|${foldName(station.name)}|${lieu ? foldName(lieu) : ""}`;
    if (vus.has(cle) || (lieu == null && vus.has(station.id))) continue;
    vus.add(cle);
    vus.add(station.id);
    res.push({ station, lieu, km });
    if (res.length >= max) break;
  }
  return res;
}
