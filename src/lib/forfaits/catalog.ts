import raw from "./catalog.json" with { type: "json" };
import type { DomainForfait, ForfaitSeed } from "./types";
import { deviseDuPays } from "../devises.ts";

export const FORFAIT_CATALOG: DomainForfait[] = raw as DomainForfait[];

/**
 * Les rapports par lesquels le catalogue d'août déduisait trois prix du seul
 * 6 jours adulte, à l'euro près : la journée valait 6 jours ÷ 5,3, le 6 jours
 * enfant 0,8 × 6 jours, la saison 3,05 × 6 jours. Aux Portes du Soleil :
 * 292 € relevés, et 55, 234 et 891 € calculés — affichés sous « Relevé le
 * 11 août 2026 », coche « Prix relevé », et le 6 jours enfant entrait dans le
 * coût du séjour des familles.
 *
 * Ce qui en fait une signature, mesuré le 26 septembre 2026 sur les grilles
 * Skiinfo françaises (`monde/data/forfaitsSkiinfo.json`) : aucune des 184
 * grilles à forfait saison n'a une saison à 3,05 × 6 jours, et aucune des 195
 * grilles à journée et semaine n'a à la fois la journée à 6 jours ÷ 5,3 et
 * l'enfant à 0,8 × 6 jours. Chacun de ces deux derniers rapports, seul, se
 * rencontre (9 grilles chacun) : un enfant à 80 % de l'adulte est une vraie
 * politique tarifaire, et ne prouve rien à lui seul.
 */
export const RAPPORTS_DEDUITS = { journee: 5.3, enfant: 0.8, saison: 3.05 } as const;

/** Les trois prix que ces rapports tirent d'un 6 jours adulte. */
export function prixDeduits(j6: number): { j1: number; enf6: number; saison: number } {
  return {
    j1: Math.round(j6 / RAPPORTS_DEDUITS.journee),
    enf6: Math.round(j6 * RAPPORTS_DEDUITS.enfant),
    saison: Math.round(j6 * RAPPORTS_DEDUITS.saison),
  };
}

/**
 * Ce que le catalogue estime, faute de l'avoir relevé : la journée et le
 * 6 jours enfant d'une entrée dont seul le 6 jours adulte est relevé.
 *
 * Retirés des prix relevés le 26 septembre 2026 pour 142 entrées, choisies par
 * les rapports ci-dessus et non à la main. Le 6 jours adulte reste, lui, un
 * prix relevé. Les valeurs restent lisibles ici parce qu'elles disent un ordre
 * de grandeur honnête — écart médian de 6 % pour la journée et de 5 % pour
 * l'enfant sur les grilles Skiinfo françaises —, mais elles s'affichent
 * « estimé » et n'entrent jamais dans un coût : sans tarif enfant relevé, les
 * enfants sont comptés au tarif adulte, et l'écran le dit (`cout.ts`).
 *
 * La saison n'a pas d'estimation : 3,05 × 6 jours manque la vraie saison de
 * 26 % en médiane (Courchevel : 1 095 € calculés, 1 580 € chez Skiinfo). Elle
 * est simplement non relevée. Celle des 3 Vallées aussi, pour ses dix
 * entrées : le catalogue en donnait deux pour une même zone, 1 090 € à Val
 * Thorens et Orelle, 1 095 € à Courchevel et Méribel, et rien ne dit laquelle
 * est juste. Aligner l'une sur l'autre aurait inventé un relevé.
 *
 * Val Thorens, Orelle et l'entrée « Val Thorens » ne suivaient pas le rapport
 * de saison mais suivaient les deux autres : leur journée et leur 6 jours
 * enfant sont estimés comme les 139 autres.
 */
export type EstimationForfait = { j1: number | null; enf6: number | null };

/** La graine telle que le JSON la porte, estimation comprise. */
type GraineCatalogue = ForfaitSeed & { estime?: EstimationForfait | null };

export function estimationDuDomaine(d: DomainForfait | null | undefined): EstimationForfait | null {
  return (d?.seed as GraineCatalogue | null | undefined)?.estime ?? null;
}

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
 *
 * La Giettaz a une entrée sans aucun prix depuis le 26 septembre 2026. Elle
 * portait le pass, les chiffres et le tarif de l'Espace Diamant — « Forfaits ·
 * Espace Diamant (192 km) », 249 € —, alors que ses remontées (Torraz, Grande
 * Rare) sont celles des Portes du Mont-Blanc. Le pass relie aussi les stations
 * entre elles (`domainFit.ts`) : son relevé gardait 53 logements de
 * Praz-sur-Arly, Notre-Dame-de-Bellecombe et Crest-Voland. Ils en sortent sans
 * attendre un nouveau relevé : `prix/annonces.ts` rejuge le verdict de chaque
 * annonce enregistrée à la relecture (`rejugerDomaine`). Tant que le forfait
 * des Portes du Mont-Blanc n'est pas relevé, elle n'en affiche aucun — et
 * surtout pas celui d'Evasion Mont-Blanc (312 € à Combloux), qui la relierait
 * aux Contamines.
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
