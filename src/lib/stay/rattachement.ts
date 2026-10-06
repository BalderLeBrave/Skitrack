/**
 * La station d'un logement : une seule, celle de la commune ou du village où
 * il se trouve.
 *
 * **Règle du propriétaire (6 octobre 2026).** Un logement appartient à la
 * station où il est physiquement situé, jamais au domaine skiable. Il n'est
 * listé que sous elle, même si elle est reliée à d'autres par les pistes ; une
 * station voisine, reliée ou non, ne le récupère jamais. Le domaine relié
 * reste une information de la fiche station (`domaineStations.ts`).
 *
 * Avant, chaque recherche gardait tout ce que `domainFit` jugeait « dans le
 * domaine » ou « relié » dans un rayon de 12 km : un logement d'Aussois sortait
 * aussi sous Val Cenis (même libellé « Espace Haute Maurienne Vanoise », 7,8
 * km), un logement de Méribel sous treize stations des 3 Vallées. Le verdict
 * de domaine ne décide plus de l'appartenance : c'est `rattacher`, ici, et
 * nulle part ailleurs.
 *
 * ## La règle, dans l'ordre
 *
 * 1. **Les coordonnées**, quand le logement en a : la station dont le repère
 *    est le plus proche. Chaque point du territoire a ainsi une seule station
 *    la plus proche : les zones ne se chevauchent pas. Au-delà de
 *    `RATTACHEMENT_MAX_M` du repère le plus proche, le logement n'est dans
 *    aucune station (« trop-loin »). La commune publiée ne les contredit pas :
 *    plusieurs sources y écrivent le nom de station de l'agence (Ski-Planet,
 *    Travelski, CozyCozy), pas la commune du logement ; le point, lui, est
 *    celui du logement.
 * 2. **Sans coordonnées, la commune publiée** (`locality`) : celle d'une
 *    station (`Station.commune`) ou l'un des villages d'une station
 *    (`VILLAGES_DE_STATION`). Si elle ne désigne qu'une station, c'est elle.
 *    Plusieurs (Les Belleville porte Val Thorens, Les Menuires, Reberty et
 *    Saint-Martin ; Morzine porte Avoriaz) : le nom d'une seule de ces
 *    stations tranche, lu dans le titre d'abord, puis dans la commune
 *    publiée. Le nom nu de la commune ne compte pas (« Morzine » nomme la
 *    commune, pas la station). Aucun nom, ou deux : on ne tranche pas
 *    (« commune-partagee »).
 * 3. **Sinon, le nom d'une station** écrit dans la commune ou le titre
 *    (`stationsNommees`, le plus long d'abord), s'il est seul : deux stations
 *    nommées sont un doute. C'est un indice faible : il rattache, mais
 *    n'écarte pas d'une autre station (`verdictStation`).
 *    Sinon, **aucune station** (« sans-position ») : l'absence de position
 *    n'est pas une proximité, et on ne devine pas.
 *
 * Un logement que rien ne situe n'est ni montré ni compté : Logements et la
 * médiane exigent une position. Il reste à compléter ; sa fiche lue lui donne
 * souvent un point, et le rattachement tranche alors (`verdictStation`).
 *
 * Une égalité exacte de distance garde la première station du référentiel :
 * le résultat ne dépend pas de l'ordre des annonces, et ne fait jamais deux
 * stations.
 *
 * Les noms de commune ne sont comparés qu'entiers (casse, accents, code
 * postal et ponctuation mis à part) : « Plagne Centre » n'est pas la commune
 * « La Plagne Tarentaise », et un nom de domaine (« Paradiski ») ne désigne
 * aucune commune. Le nom d'une station n'est pas lu comme une commune, mais
 * seulement en dernier recours, comme texte.
 */

import { nearestStationPin, stationsNommees, type DomainVerdict } from "../domainFit.ts";
import { STATIONS } from "../stations.ts";
import { stationDeRattachement, VILLAGES_DE_STATION } from "../villages.ts";
import { plausible } from "./priseFiche.ts";

/**
 * Au-delà, un logement n'est dans aucune station : c'est une vallée, une
 * ville, un autre massif. 12 km, validé par le propriétaire le 6 octobre
 * 2026 ; le rayon par défaut de l'écran Logements (`RAYON_DEFAUT_KM`) en
 * dérive.
 */
export const RATTACHEMENT_MAX_M = 12_000;

function cleLieu(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\d{5}/g, " ")
    .replace(/['’]/g, " ")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/** Nom de commune ou de village → stations de rattachement qu'il désigne. */
const PAR_COMMUNE: Map<string, Set<string>> = (() => {
  const m = new Map<string, Set<string>>();
  const poser = (nom: string | null, id: string) => {
    if (!nom) return;
    const k = cleLieu(nom);
    if (!k) return;
    const set = m.get(k) ?? new Set<string>();
    set.add(id);
    m.set(k, set);
  };
  for (const s of STATIONS) poser(s.commune, s.id);
  for (const [station, v] of Object.entries(VILLAGES_DE_STATION))
    for (const nom of v.noms ?? []) poser(nom, station);
  return m;
})();

/** Un nom de commune, chiffres compris (« Courchevel 1850 » n'est pas
 *  « Courchevel »), sans code postal ; écrit comme les noms de station lus
 *  (`stationsNommees`). */
function cleCommuneExacte(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\d{5}/g, " ")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const COMMUNES_EXACTES: ReadonlySet<string> = new Set(
  [
    ...STATIONS.map((s) => s.commune),
    ...Object.values(VILLAGES_DE_STATION).flatMap((v) => v.noms ?? []),
  ]
    .filter((n): n is string => !!n)
    .map(cleCommuneExacte),
);

/** Le nom lu n'est-il que celui d'une commune ? (« Courchevel », « Morzine ») */
const nomDeCommune = (nom: string) => COMMUNES_EXACTES.has(nom);

/** Les stations (identifiants du référentiel) qu'une commune publiée désigne. */
export function stationsDeLaCommune(locality: string | null | undefined): string[] {
  if (!locality) return [];
  // « Val-Cenis - Lanslebourg », « Aussois (73) » : chaque morceau est essayé,
  // le premier qui désigne une commune connue l'emporte. Le trait d'union
  // seul (« Morzine-Avoriaz ») en dernier : il lie aussi les noms composés.
  const morceaux = [locality, ...locality.split(/\s[-–]\s|[,/()]/), ...locality.split(/[-–,/()]/)];
  for (const m of morceaux) {
    const hit = PAR_COMMUNE.get(cleLieu(m));
    if (hit) return [...hit];
  }
  return [];
}

/** Comment la station a été établie. */
export type Critere = "gps" | "commune" | "texte";
/** Pourquoi aucune station ne l'a été. */
export type SansStation = "trop-loin" | "commune-partagee" | "sans-position";

/**
 * Le rattachement d'un logement : **une** station, ou aucune, avec sa raison.
 * Jamais deux : le type ne le permet pas.
 */
export type RattachementLogement =
  | { stationId: string; critere: Critere; distanceM: number | null }
  | { stationId: null; motif: SansStation };

export type Rattachable = {
  lat?: number | null;
  lon?: number | null;
  locality?: string | null;
  title?: string | null;
};

function positionUtilisable(l: Rattachable): l is Rattachable & { lat: number; lon: number } {
  return plausible(l.lat, l.lon);
}

/** Les rattachements déjà établis, par position, commune et titre : le filtre
 *  de l'écran les redemande à chaque cran d'un curseur. */
const memo = new Map<string, RattachementLogement>();
const MEMO_MAX = 20_000;

/** La station d'un logement. Voir l'en-tête du fichier pour la règle. */
export function rattacher(l: Rattachable): RattachementLogement {
  const cle = `${l.lat ?? ""}|${l.lon ?? ""}|${l.locality ?? ""}|${l.title ?? ""}`;
  const connu = memo.get(cle);
  if (connu) return connu;
  const r = etablir(l);
  if (memo.size >= MEMO_MAX) memo.clear();
  memo.set(cle, r);
  return r;
}

function etablir(l: Rattachable): RattachementLogement {
  if (positionUtilisable(l)) {
    // Le repère le plus proche, villages compris (`nearestStationPin`) ; une
    // égalité garde la première station du référentiel.
    const p = nearestStationPin(l.lat, l.lon);
    if (p.m > RATTACHEMENT_MAX_M) return { stationId: null, motif: "trop-loin" };
    return { stationId: stationDeRattachement(p.station.id), critere: "gps", distanceM: p.m };
  }
  const familles = new Set(stationsDeLaCommune(l.locality).map(stationDeRattachement));
  if (familles.size === 1) {
    const [stationId] = familles;
    return { stationId, critere: "commune", distanceM: null };
  }
  if (familles.size > 1) {
    // Une commune à plusieurs stations (Courchevel et La Tania, Morzine et
    // Avoriaz, Les Belleville) : le nom écrit tranche, s'il désigne une seule
    // d'entre elles. Commune et nom concordent : c'est une preuve, comme la
    // commune seule. Le titre parle d'abord, puis la commune publiée. Le nom
    // nu de la commune ne compte pas : « Courchevel » ou « 74110 Morzine »
    // nomment la commune, pas la station homonyme ; « Courchevel 1850 » ou
    // « Les Belleville - Val Thorens » nomment une station. Deux stations
    // nommées : un doute, on ne tranche pas.
    for (const texte of [l.title, l.locality]) {
      const nommees = new Set(stationsNommees(texte, nomDeCommune).map(stationDeRattachement));
      const dedans = [...familles].filter((f) => nommees.has(f));
      if (dedans.length === 1) return { stationId: dedans[0], critere: "commune", distanceM: null };
      if (dedans.length > 1) break;
    }
    return { stationId: null, motif: "commune-partagee" };
  }
  // Un nom de station écrit, un seul : deux stations nommées (« Studio Val
  // Thorens, vue sur Les Menuires ») sont un doute, comme pour une commune
  // partagée.
  const lues = new Set(
    stationsNommees(`${l.locality ?? ""} ${l.title ?? ""}`).map(stationDeRattachement),
  );
  if (lues.size === 1) {
    const [stationId] = lues;
    return { stationId, critere: "texte", distanceM: null };
  }
  return { stationId: null, motif: "sans-position" };
}

/**
 * Le logement, face à la station d'un relevé (celle d'une recherche) :
 *
 * - « sienne » : il lui appartient. Un village de station
 *   (`VILLAGES_DE_STATION`) cherché pour lui-même rend les logements de sa
 *   station : c'est la même ;
 * - « autre-station » : il appartient à une autre station, reliée ou non ;
 * - « trop-loin » : il n'est dans aucune station ;
 * - « non-situe » : rien ne le situe encore (ni point, ni commune ou nom qui
 *   tranche). Rien ne prouve qu'il soit ailleurs ; il n'est pas montré, faute
 *   de position, mais reste à compléter.
 *
 * C'est le seul juge de l'appartenance : le filtre de Logements et de la
 * médiane (`geoReasonFor`) et l'onglet « Par budget » (`passeAnnonce`) le lisent.
 */
export type VerdictStation = "sienne" | "autre-station" | "trop-loin" | "non-situe";

/**
 * Le logement est-il **montré ailleurs** que sous cette station ? Vrai s'il
 * appartient à une autre station, ou à aucune (à plus de 12 km de toute
 * station). Un logement non situé n'est pas exclu : rien ne le dit ailleurs.
 * Le prédicat commun des listes qui ne jugent que l'appartenance (onglet « Par
 * budget », Tracés, médiane recomptée, ordre de lecture des fiches) ; le
 * filtre « Dans la station » de Logements (`lieuReasonFor`) part de lui.
 */
export function exclueDeLaStation(l: Rattachable, stationId: string): boolean {
  const v = verdictStation(l, stationId);
  return v === "autre-station" || v === "trop-loin";
}

export function verdictStation(l: Rattachable, stationId: string): VerdictStation {
  const r = rattacher(l);
  if (r.stationId == null) return r.motif === "trop-loin" ? "trop-loin" : "non-situe";
  if (r.stationId === stationDeRattachement(stationId)) return "sienne";
  // Un nom lu dans un titre (« à 5 min de Val Thorens ») ne prouve pas que le
  // logement est ailleurs : il inclut, il n'exclut pas. L'annonce reste non
  // située, donc à compléter, jusqu'à ce qu'un point tranche.
  return r.critere === "texte" ? "non-situe" : "autre-station";
}

/**
 * La station sous laquelle un logement déjà enregistré (favori, relevé) se
 * nomme et s'ouvre : la sienne (`rattacher`), à défaut celle de son relevé,
 * ramenée à sa station s'il s'agit d'un village. Un nom lu dans le titre seul
 * ne l'emporte pas sur le relevé (« à 5 min de Val Thorens ») : il n'exclut
 * pas d'une station (`verdictStation`), il n'y déplace pas non plus.
 */
export function stationDuLogement(l: Rattachable & { stationId: string }): string {
  const r = rattacher(l);
  return r.stationId != null && r.critere !== "texte"
    ? r.stationId
    : stationDeRattachement(l.stationId);
}

/**
 * La distance d'un logement au repère de sa station, quand c'est la station
 * cherchée : celle du repère le plus proche de la famille, village compris
 * (Belle Plagne pour un logement de Belle Plagne cherché sous La Plagne).
 * `null` sinon — l'appelant mesure alors depuis le repère de la station
 * cherchée.
 */
export function distanceAuRepere(l: Rattachable, stationId: string): number | null {
  if (verdictStation(l, stationId) !== "sienne") return null;
  const r = rattacher(l);
  return r.stationId != null ? r.distanceM : null;
}

/**
 * Le verdict de domaine d'un logement, accordé à son rattachement.
 *
 * Un logement de la station cherchée n'est pas « sur un autre domaine » :
 * Bramans, sans domaine au référentiel, est un village de Val Cenis, et
 * `domainFit` jugeait ses logements « autre domaine » sous Val Cenis — la
 * fiche le disait, et la remontée n'était pas mesurée. Le rattachement
 * l'emporte ; les autres verdicts restent ceux de `domainFit`.
 */
export function verdictDomaineAccorde(
  verdict: DomainVerdict,
  l: Rattachable,
  stationId: string,
): DomainVerdict {
  return verdict === "other" && verdictStation(l, stationId) === "sienne" ? "in" : verdict;
}
