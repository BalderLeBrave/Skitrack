/**
 * Le réseau piéton d'une station : routes, rues et chemins d'OpenStreetMap
 * qu'on parcourt à pied l'hiver, et les gares de remontées qui s'y branchent.
 *
 * La distance d'un logement à « sa » remontée se mesurait à vol d'oiseau
 * (`attachAccess`). Un chalet séparé de la télécabine par un torrent, une
 * barre rocheuse ou une route en lacets passait pour être « au pied des
 * pistes » à 150 m, quand il faut en marcher 900. Ce module mesure le chemin,
 * hors ligne : le graphe est écrit d'avance par
 * `scripts/build-reseau-pieton.mjs` dans `public/reseau-pieton/<station>.json`,
 * et rien n'interroge un service d'itinéraire à l'exécution.
 *
 * Deux moitiés, toutes deux pures :
 * - **la construction** (lue par le script) : quelles voies OSM retenir,
 *   la requête Overpass, la conversion de sa réponse en graphe compact, le
 *   branchement des gares sur le réseau ;
 * - **la lecture** (lue par l'écran) : le graphe décodé, **un seul** Dijkstra
 *   à sources multiples par station (toutes les gares à la fois : chaque nœud
 *   sait à quelle distance est la gare la plus proche, et laquelle), puis,
 *   pour chaque logement, sa projection sur la voie la plus proche. Un écran
 *   de 500 logements coûte un Dijkstra et 500 projections.
 *
 * Le même module bâtit et lit le réseau routier (`mode: "voiture"`, dans
 * `public/reseau-voiture/`), tiré de la même réponse Overpass : les routes
 * ouvertes l'hiver, sens uniques compris. Il sert quand la marche est trop
 * longue (`stay/aPied.ts`, `SEUIL_VOITURE_M`).
 *
 * Chargé tel quel par `node --experimental-strip-types` (le script, les
 * tests) : imports relatifs avec leur extension, rien que des types effaçables.
 */

/* ---------- Constantes ---------- */

/** Coordonnées entières : un millionième de degré, 11 cm en latitude. */
export const QUANTUM = 1e6;
/** Douglas-Peucker sur chaque tronçon entre deux carrefours, en mètres. */
export const TOLERANCE_M = 2;
/** Une gare à plus de 250 m de toute voie n'est pas branchée : c'est une gare
 *  d'altitude, qu'on n'atteint pas à pied depuis un logement. */
export const GARE_MAX_M = 250;
/** Au-delà de 200 m de toute voie retenue, un logement n'est pas sur le
 *  réseau (chemin privé absent d'OSM, emprise du fichier dépassée) : la
 *  distance reste celle à vol d'oiseau, dite comme telle. */
export const ACCROCHE_MAX_M = 200;
/** Le logement ne se raccroche pas qu'à la voie la plus proche : toute voie à
 *  25 m de plus au plus compte, et la plus courte marche l'emporte. Une
 *  impasse sans issue juste devant la porte ne doit pas l'emporter sur la rue
 *  d'à côté. */
export const ACCROCHE_MARGE_M = 25;
/** À 50 m ou moins d'une gare, on y va tout droit : le front de neige n'est
 *  pas une voie d'OSM, et le détour par la rue ne se fait pas. C'est aussi le
 *  seuil « skis aux pieds » (`accesPistes.ts`). */
export const TOUT_DROIT_MAX_M = 50;
/** Côté d'une case de la grille d'accroche, en mètres. */
const CASE_M = 100;

/* ---------- Géométrie ---------- */

const R_TERRE = 6371000;
const RAD = Math.PI / 180;

/** La même formule que `remontees.ts` : les deux distances se comparent. */
export function metres(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * RAD;
  const dLon = (bLon - aLon) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TERRE * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Mètres par degré autour d'une latitude : projection locale, juste à
 *  quelques centaines de mètres. */
function echelle(lat: number): { x: number; y: number } {
  return { x: 111_320 * Math.cos(lat * RAD), y: 110_540 };
}

/** Projection d'un point sur un segment, en mètres locaux autour du point :
 *  la distance et la position `t` (0 en A, 1 en B). */
export function projeter(
  lat: number,
  lon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): { d: number; t: number } {
  const e = echelle(lat);
  const ax = (aLon - lon) * e.x;
  const ay = (aLat - lat) * e.y;
  const bx = (bLon - lon) * e.x;
  const by = (bLat - lat) * e.y;
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return { d: Math.hypot(ax + t * dx, ay + t * dy), t };
}

/* ---------- Construction : les voies retenues ---------- */

/** Les voies qu'on parcourt à pied. Les bretelles des routes ordinaires en
 *  sont ; les autoroutes et voies express non. `corridor` : les galeries
 *  couvertes des stations intégrées (Avoriaz, Flaine) relient des immeubles
 *  au front de neige. */
export const VOIES_PIETONNES: readonly string[] = [
  "footway",
  "path",
  "pedestrian",
  "steps",
  "corridor",
  "track",
  "bridleway",
  "cycleway",
  "service",
  "residential",
  "living_street",
  "unclassified",
  "road",
  "tertiary",
  "tertiary_link",
  "secondary",
  "secondary_link",
  "primary",
  "primary_link",
];

/** Une route reste une route l'hiver, même quand OSM y trace aussi une piste
 *  (la route de la station damée en retour skis) : on y marche. */
const ROUTES = new Set([
  "pedestrian",
  "service",
  "residential",
  "living_street",
  "unclassified",
  "road",
  "tertiary",
  "tertiary_link",
  "secondary",
  "secondary_link",
  "primary",
  "primary_link",
]);

/** Pistes où l'on ne marche pas : descente, fond, luge, randonnée à skis. La
 *  raquette (`hike`) et la piste piétonne (`walk`) restent. */
const PISTES_SANS_PIETON = new Set(["downhill", "nordic", "sled", "skitour", "snow_park"]);

/** Chemins d'alpinisme : impraticables à pied l'hiver. */
const SAC_ALPIN = new Set(["alpine_hiking", "demanding_alpine_hiking", "difficult_alpine_hiking"]);

const PIETON_PERMIS = new Set(["yes", "designated", "permissive"]);

/**
 * La voie se parcourt-elle à pied, l'hiver, depuis un logement ?
 *
 * - les types de `VOIES_PIETONNES` seulement : ni autoroute, ni voie express,
 *   ni chantier, ni projet ;
 * - pas `foot=no`, ni `access=no|private` sans permission piétonne explicite,
 *   ni `motorroad=yes` ;
 * - pas une route fermée l'hiver (`seasonal=summer`, `winter_road=no`), ni un
 *   chemin d'alpinisme (`sac_scale` alpin) ;
 * - **les pistes** : une piste de ski seule n'est pas dans la requête (pas de
 *   `highway`). Un chemin, un sentier ou une piste forestière qu'OSM dit
 *   aussi piste de descente, de fond, de luge ou de randonnée à skis est
 *   écarté : l'hiver, c'est une piste damée, où l'on ne remonte pas à pied
 *   avec ses skis sur l'épaule. Une route qui porte une piste reste une
 *   route (`ROUTES`).
 */
export function voiePietonne(tags: Readonly<Record<string, string>> | undefined): boolean {
  if (!tags) return false;
  const h = tags.highway;
  if (!h || !VOIES_PIETONNES.includes(h)) return false;
  const foot = tags.foot;
  if (foot === "no") return false;
  if ((tags.access === "no" || tags.access === "private") && !(foot && PIETON_PERMIS.has(foot))) return false;
  if (tags.motorroad === "yes") return false;
  if (tags.seasonal === "summer" || tags.winter_road === "no") return false;
  if (tags.sac_scale && SAC_ALPIN.has(tags.sac_scale)) return false;
  const piste = tags["piste:type"];
  if (piste && !ROUTES.has(h) && piste.split(";").some((p) => PISTES_SANS_PIETON.has(p.trim()))) return false;
  return true;
}

/* ---------- Construction : les routes ---------- */

/** Le réseau qu'on construit : à pied (`voiePietonne`) ou en voiture
 *  (`voieRoutiere`, sens uniques compris). */
export type ModeReseau = "pied" | "voiture";

/** Les voies où roule une voiture. Ni chemin, ni sentier, ni piste
 *  forestière (`track`) : l'hiver, elles ne sont pas déneigées. */
export const VOIES_ROUTIERES: readonly string[] = [
  "service",
  "residential",
  "living_street",
  "unclassified",
  "road",
  "tertiary",
  "tertiary_link",
  "secondary",
  "secondary_link",
  "primary",
  "primary_link",
  "trunk",
  "trunk_link",
];

/** Ce qui laisse passer une voiture de vacancier. */
const VEHICULE_PERMIS = new Set(["yes", "designated", "permissive", "destination", "customers"]);

/** L'accès, du plus précis au plus général : le premier présent l'emporte. */
const CLES_ACCES = ["motorcar", "motor_vehicle", "vehicle", "access"] as const;

const MOIS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Les restrictions d'une balise conditionnelle OSM (`no @ (Dec-Mar); yes @
 *  snow`), coupées aux `;` hors parenthèses. */
export function restrictionsConditionnelles(v: string | undefined): { valeur: string; condition: string }[] {
  if (!v) return [];
  const parts: string[] = [];
  let prof = 0;
  let cur = "";
  for (const ch of v) {
    if (ch === "(") prof++;
    else if (ch === ")") prof = Math.max(0, prof - 1);
    if (ch === ";" && prof === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.flatMap((p) => {
    const at = p.indexOf("@");
    if (at < 0) return [];
    const condition = p
      .slice(at + 1)
      .trim()
      .replace(/^\((.*)\)$/s, "$1")
      .trim();
    return [{ valeur: p.slice(0, at).trim(), condition }];
  });
}

/**
 * La condition vaut-elle en plein hiver ? Un mot (`winter`, `snow`…), ou une
 * plage de mois ou de semaines qui couvre janvier ou février : `Dec-Mar`,
 * `Nov 15-Apr 30`, `Sep 23-May 31`, `week 44-21`. Les conditions d'heure, de
 * poids ou de jour (`Mo-Fr 07:00-19:00`, `weight>3.5`) n'en sont pas.
 */
export function conditionHivernale(condition: string): boolean {
  const c = condition.toLowerCase();
  if (/winter|snow|ice|hiver|neige|verglas/.test(c)) return true;
  for (const [, x, y] of c.matchAll(/week\s*(\d{1,2})\s*-\s*(\d{1,2})/g)) {
    const a = Number(x);
    const b = Number(y);
    if (a > b || a <= 9) return true;
  }
  const mois = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b(?:\s*\d{1,2})?(?:\s*-\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b)?/g;
  for (const [, x, y] of c.matchAll(mois)) {
    const a = MOIS.indexOf(x);
    const b = y ? MOIS.indexOf(y) : a;
    // Une plage peut passer le nouvel an (`Nov-Apr`).
    const dans = (k: number) => (a <= b ? a <= k && k <= b : k >= a || k <= b);
    if (dans(0) || dans(1)) return true;
  }
  return false;
}

/** La valeur d'une balise en hiver : sa restriction conditionnelle d'hiver
 *  si elle en a une, sinon `undefined`. */
function valeurDHiver(tags: Readonly<Record<string, string>>, cle: string): string | undefined {
  return restrictionsConditionnelles(tags[`${cle}:conditional`]).find((r) => conditionHivernale(r.condition))?.valeur;
}

/**
 * La voie se parcourt-elle en voiture, l'hiver, depuis un logement ?
 *
 * - les types de `VOIES_ROUTIERES` seulement ;
 * - l'accès le plus précis l'emporte (`motorcar`, puis `motor_vehicle`,
 *   `vehicle`, `access`) : `no`, `private`, `agricultural`… l'écartent ;
 * - **l'accès d'hiver d'abord** : une route de montagne fermée l'hiver l'est
 *   presque toujours par une restriction conditionnelle
 *   (`access:conditional=no @ (Dec-Mar)`, `vehicle:conditional=no @ snow`) ;
 * - pas une route saisonnière ou non déneigée (`seasonal=yes|summer`,
 *   `winter_road=no`, `winter_service=no`, `snowplowing=no`), ni une voie de
 *   secours ;
 * - **pas une route qui porte une piste de ski** (descente, fond, luge,
 *   randonnée à skis) : damée l'hiver, fermée aux voitures. À pied on y
 *   marche (`voiePietonne`), en voiture non. Un itinéraire piéton ou raquette
 *   (`hike`, `walk`) tracé sur une rue déneigée la laisse ouverte.
 */
export function voieRoutiere(tags: Readonly<Record<string, string>> | undefined): boolean {
  if (!tags) return false;
  const h = tags.highway;
  if (!h || !VOIES_ROUTIERES.includes(h)) return false;
  if (tags.area === "yes") return false;
  const hiver = CLES_ACCES.map((k) => valeurDHiver(tags, k)).find((v) => v != null);
  const acces = hiver ?? tags.motorcar ?? tags.motor_vehicle ?? tags.vehicle ?? tags.access;
  if (acces && !acces.split(";").some((v) => VEHICULE_PERMIS.has(v.trim()))) return false;
  if (tags.seasonal === "summer" || tags.seasonal === "yes" || tags.winter_road === "no") return false;
  if (tags.winter_service === "no" || tags.snowplowing === "no") return false;
  if (tags.service === "emergency_access") return false;
  const piste = tags["piste:type"];
  if (piste && piste.split(";").some((p) => PISTES_SANS_PIETON.has(p.trim()))) return false;
  return true;
}

/** Le sens unique d'une voie, l'hiver : 1 dans l'ordre de ses nœuds, -1 à
 *  rebours, 0 dans les deux sens. Le sens d'hiver (`oneway:conditional=-1 @
 *  winter`) l'emporte ; un rond-point est à sens unique. */
export function sensVoie(tags: Readonly<Record<string, string>> | undefined): -1 | 0 | 1 {
  const o = (tags && valeurDHiver(tags, "oneway")) ?? tags?.oneway;
  if (o === "yes" || o === "1" || o === "true") return 1;
  if (o === "-1" || o === "reverse") return -1;
  if (o === "no") return 0;
  if (tags?.junction === "roundabout" || tags?.junction === "circular") return 1;
  return 0;
}

/* ---------- Construction : l'emprise et la requête ---------- */

export type Emprise = { s: number; o: number; n: number; e: number };

/** L'emprise de points, élargie de `margeM` mètres de chaque côté. */
export function empriseAutour(points: readonly { lat: number; lon: number }[], margeM: number): Emprise | null {
  if (!points.length) return null;
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const e = echelle((Math.min(...lats) + Math.max(...lats)) / 2);
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    s: r6(Math.min(...lats) - margeM / e.y),
    n: r6(Math.max(...lats) + margeM / e.y),
    o: r6(Math.min(...lons) - margeM / e.x),
    e: r6(Math.max(...lons) + margeM / e.x),
  };
}

/** La requête Overpass : les voies des types retenus, à pied ou en voiture,
 *  dans les emprises (une par repère, la station et chacun de ses villages :
 *  leur union coûte moins que le rectangle qui les englobe), et leurs nœuds.
 *  Une seule réponse sert aux deux réseaux. Le tri fin (`voiePietonne`,
 *  `voieRoutiere`) se fait ici, pas chez Overpass : il se teste sans réseau. */
export function requeteOverpass(emprises: readonly Emprise[], timeoutS = 180): string {
  const types = [...new Set([...VOIES_PIETONNES, ...VOIES_ROUTIERES])].join("|");
  const voies = emprises.map((b) => `way["highway"~"^(${types})$"](${b.s},${b.o},${b.n},${b.e});`).join("");
  return `[out:json][timeout:${timeoutS}];(${voies});(._;>;);out body qt;`;
}

/* ---------- Construction : les gares d'une station ---------- */

/** Une gare des données du dépôt (`OsmPt`). */
export type PointGare = { n: string | null; k: string; lat: number; lon: number };
export type Repere = { lat: number; lon: number };

/** Les gares d'une station et de ses villages : celles de `pool` à `rayonM`
 *  au plus d'un repère, sans doublon, chacune avec l'autre gare de son
 *  appareil (même nom, même genre, la plus éloignée entre 8 m et 12 km,
 *  comme `mateOf`), cherchée dans `pool` entier. */
export function garesAutour(
  reperes: readonly Repere[],
  pool: readonly PointGare[],
  rayonM: number,
): GareSource[] {
  const out: GareSource[] = [];
  const vues = new Set<string>();
  for (const p of pool) {
    const cle = `${p.n}|${p.k}|${p.lat}|${p.lon}`;
    if (vues.has(cle)) continue;
    if (!reperes.some((r) => metres(r.lat, r.lon, p.lat, p.lon) <= rayonM)) continue;
    vues.add(cle);
    let autre: PointGare | null = null;
    let loin = 0;
    for (const q of pool) {
      if (q.n !== p.n || q.k !== p.k) continue;
      const m = metres(p.lat, p.lon, q.lat, q.lon);
      if (m >= 8 && m <= 12_000 && m > loin) {
        loin = m;
        autre = q;
      }
    }
    out.push({ n: p.n, k: p.k, lat: p.lat, lon: p.lon, olat: autre?.lat ?? null, olon: autre?.lon ?? null });
  }
  return out;
}

/** Une emprise par repère : le repère et ses gares (à `rayonM` au plus),
 *  élargis de `margeM`. */
export function emprisesAutour(
  reperes: readonly Repere[],
  gares: readonly { lat: number; lon: number }[],
  rayonM: number,
  margeM: number,
): Emprise[] {
  const out: Emprise[] = [];
  for (const r of reperes) {
    const pts = [r, ...gares.filter((g) => metres(r.lat, r.lon, g.lat, g.lon) <= rayonM)];
    const b = empriseAutour(pts, margeM);
    if (b) out.push(b);
  }
  return out;
}

/* ---------- Construction : le graphe ---------- */

/** Un élément de la réponse JSON d'Overpass. */
export type ElementOverpass = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
};

/** Une gare telle que le script la lit dans les données du dépôt
 *  (`osmAccess.snapshot.json`, `osmLifts.json`). */
export type GareSource = {
  n: string | null;
  k: string;
  lat: number;
  lon: number;
  /** L'autre gare du même appareil (`mateOf`). */
  olat: number | null;
  olon: number | null;
};

/** Une gare branchée : `i` est son nœud dans le graphe. */
export type GareFichier = GareSource & { i: number };

/** Le fichier `public/reseau-pieton/<station>.json`. */
export type FichierReseau = {
  v: 1;
  station: string;
  nom: string;
  /** Date de la réponse Overpass, AAAA-MM-JJ. */
  le: string;
  source: string;
  /** Les nœuds : longitude et latitude en millionièmes de degré, chacune
   *  écrite en écart à celle du nœud précédent (le premier en absolu). */
  n: number[];
  /** Les voies : suites d'indices de nœuds, deux nœuds voisins étant reliés. */
  w: number[][];
  g: GareFichier[];
  /** Absent : à pied. */
  mode?: ModeReseau;
  /** En voiture : les indices (dans `w`) des voies à sens unique, qu'on ne
   *  parcourt que dans l'ordre de leurs nœuds. */
  s?: number[];
  /** En voiture : les indices (dans `w`) des liens droits gare-route. Ils
   *  finissent un trajet, à pied, mais un logement ne s'y accroche pas :
   *  ce ne sont pas des routes. */
  l?: number[];
};

export type BilanReseau = {
  voiesLues: number;
  voiesRetenues: number;
  noeuds: number;
  troncons: number;
  gares: number;
  garesNonBranchees: number;
  /** Morceaux de réseau sans gare, retirés : on n'y rejoint aucune remontée. */
  morceauxRetires: number;
};

/** Douglas-Peucker en mètres sur une suite de [lat, lon] ; les deux bouts
 *  restent. Rend les indices gardés. */
function simplifier(pts: readonly [number, number][], toleranceM: number): number[] {
  if (pts.length <= 2) return pts.map((_, i) => i);
  const garder = new Uint8Array(pts.length);
  garder[0] = garder[pts.length - 1] = 1;
  const pile: [number, number][] = [[0, pts.length - 1]];
  while (pile.length) {
    const [a, b] = pile.pop()!;
    let max = 0;
    let k = -1;
    for (let i = a + 1; i < b; i++) {
      const { d } = projeter(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1]);
      if (d > max) {
        max = d;
        k = i;
      }
    }
    if (k >= 0 && max > toleranceM) {
      garder[k] = 1;
      pile.push([a, k], [k, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < pts.length; i++) if (garder[i]) out.push(i);
  return out;
}

const quant = (v: number) => Math.round(v * QUANTUM);

/**
 * La réponse Overpass, convertie en graphe compact, gares branchées.
 *
 * 1. Les voies retenues par `voiePietonne`, coupées à chaque carrefour (nœud
 *    partagé par deux voies, ou bout de voie) ; chaque tronçon est simplifié
 *    à `TOLERANCE_M` près, ses deux bouts gardés : le graphe ne perd aucun
 *    carrefour.
 * 2. Chaque gare est projetée sur le tronçon le plus proche ; à `GARE_MAX_M`
 *    au plus, le point projeté devient un nœud du tronçon, et la gare un nœud
 *    relié à lui en ligne droite (le parvis, le front de neige).
 * 3. Les morceaux du réseau qui ne portent aucune gare sont retirés : un
 *    logement qui s'y raccrocherait ne rejoindrait aucune remontée.
 *
 * En voiture (`mode: "voiture"`) : les voies de `voieRoutiere`, et les sens
 * uniques gardés (une voie `oneway=-1` est retournée, pour que tout sens
 * unique se lise dans l'ordre de ses nœuds). Une gare se branche sur le
 * tronçon le plus proche de chaque morceau du réseau routier à sa portée.
 * Le lien de la route à la gare se fait à pied, dans les deux sens ; il est
 * noté (`l`), pour qu'aucun logement ne s'y accroche.
 */
export function construireReseau(o: {
  elements: readonly ElementOverpass[];
  gares: readonly GareSource[];
  station: string;
  nom: string;
  le: string;
  source: string;
  mode?: ModeReseau;
  toleranceM?: number;
  gareMaxM?: number;
}): { fichier: FichierReseau; bilan: BilanReseau } {
  const mode = o.mode ?? "pied";
  const toleranceM = o.toleranceM ?? TOLERANCE_M;
  const gareMaxM = o.gareMaxM ?? GARE_MAX_M;
  const coords = new Map<number, [number, number]>();
  for (const el of o.elements) {
    if (el.type === "node" && el.lat != null && el.lon != null) coords.set(el.id, [el.lat, el.lon]);
  }
  const voies = o.elements.filter((el) => el.type === "way");
  const garder = mode === "voiture" ? voieRoutiere : voiePietonne;
  const retenuesSens = voies
    .filter((w) => garder(w.tags))
    .map((w) => {
      const ids = (w.nodes ?? []).filter((id) => coords.has(id));
      const sens = mode === "voiture" ? sensVoie(w.tags) : 0;
      return { ids: sens === -1 ? ids.reverse() : ids, unique: sens !== 0 };
    })
    .filter((v) => v.ids.length >= 2);
  const retenues = retenuesSens.map((v) => v.ids);

  // Les carrefours : bouts de voie, et nœuds vus plus d'une fois.
  const vus = new Map<number, number>();
  for (const ids of retenues) {
    for (const id of ids) vus.set(id, (vus.get(id) ?? 0) + 1);
    vus.set(ids[0], (vus.get(ids[0]) ?? 0) + 1);
    vus.set(ids[ids.length - 1], (vus.get(ids[ids.length - 1]) ?? 0) + 1);
  }
  const carrefour = (id: number) => (vus.get(id) ?? 0) >= 2;

  // Les nœuds gardés, dans l'ordre où on les rencontre.
  const lat: number[] = [];
  const lon: number[] = [];
  const indice = new Map<number, number>();
  const noeud = (id: number) => {
    let i = indice.get(id);
    if (i === undefined) {
      const [la, lo] = coords.get(id)!;
      i = lat.length;
      lat.push(la);
      lon.push(lo);
      indice.set(id, i);
    }
    return i;
  };
  const chaines: number[][] = [];
  /** `true` : la chaîne de même rang est à sens unique. */
  const uniques: boolean[] = [];
  /** `true` : la chaîne de même rang est le lien droit d'une gare à la voie
   *  (le parvis, le parking). */
  const liens: boolean[] = [];
  for (const { ids, unique } of retenuesSens) {
    const chaine: number[] = [];
    let debut = 0;
    for (let k = 1; k < ids.length; k++) {
      if (!carrefour(ids[k]) && k < ids.length - 1) continue;
      const morceau = ids.slice(debut, k + 1);
      const garde = simplifier(
        morceau.map((id) => coords.get(id)!),
        toleranceM,
      );
      for (const g of garde) {
        const i = noeud(morceau[g]);
        if (chaine[chaine.length - 1] !== i) chaine.push(i);
      }
      debut = k;
    }
    if (chaine.length >= 2) {
      chaines.push(chaine);
      uniques.push(unique);
      liens.push(false);
    }
  }

  // En voiture, les morceaux du réseau routier : une route damée ou fermée
  // l'hiver coupe souvent le parking du front de neige de la route du
  // village. Une gare se branche alors sur chacun des morceaux à sa portée,
  // pas seulement sur le plus proche, que l'on retirerait sinon avec la route
  // du village.
  const nbVoies = chaines.length;
  const morceauDe: number[] = [];
  if (mode === "voiture") {
    const pere = Array.from({ length: lat.length }, (_, i) => i);
    const chef = (i: number): number => {
      while (pere[i] !== i) {
        pere[i] = pere[pere[i]];
        i = pere[i];
      }
      return i;
    };
    for (const ch of chaines) for (let k = 1; k < ch.length; k++) pere[chef(ch[k])] = chef(ch[0]);
    for (const ch of chaines) morceauDe.push(chef(ch[0]));
  }

  // Les gares, branchées sur le tronçon le plus proche (en voiture : de
  // chaque morceau), par un lien droit.
  const gares: GareFichier[] = [];
  const dejaVues = new Set<string>();
  let nonBranchees = 0;
  for (const g of o.gares) {
    const cle = `${g.n}|${g.k}|${g.lat}|${g.lon}`;
    if (dejaVues.has(cle)) continue;
    dejaVues.add(cle);
    // À pied, les liens des gares déjà branchées comptent comme des voies (le
    // parvis) ; en voiture, seules les routes.
    const limite = mode === "voiture" ? nbVoies : chaines.length;
    const meilleurs = new Map<number, { c: number; k: number; d: number; t: number }>();
    for (let c = 0; c < limite; c++) {
      const ch = chaines[c];
      const m = mode === "voiture" ? morceauDe[c] : 0;
      for (let k = 0; k + 1 < ch.length; k++) {
        const p = projeter(g.lat, g.lon, lat[ch[k]], lon[ch[k]], lat[ch[k + 1]], lon[ch[k + 1]]);
        const best = meilleurs.get(m);
        if (!best || p.d < best.d) meilleurs.set(m, { c, k, d: p.d, t: p.t });
      }
    }
    const choisis = [...meilleurs.values()].filter((x) => x.d <= gareMaxM).sort((x, y) => x.d - y.d);
    if (!choisis.length) {
      nonBranchees++;
      continue;
    }
    let i = -1;
    for (const meilleur of choisis) {
      const ch = chaines[meilleur.c];
      const a = ch[meilleur.k];
      const b = ch[meilleur.k + 1];
      const pLat = lat[a] + meilleur.t * (lat[b] - lat[a]);
      const pLon = lon[a] + meilleur.t * (lon[b] - lon[a]);
      // Le point projeté : un bout du tronçon s'il en est à moins d'un mètre.
      let p: number;
      if (metres(pLat, pLon, lat[a], lon[a]) < 1) p = a;
      else if (metres(pLat, pLon, lat[b], lon[b]) < 1) p = b;
      else {
        p = lat.length;
        lat.push(pLat);
        lon.push(pLon);
        ch.splice(meilleur.k + 1, 0, p);
      }
      const lier = (x: number, y: number) => {
        chaines.push([x, y]);
        uniques.push(false);
        liens.push(true);
      };
      if (i < 0) {
        i = p;
        if (meilleur.d >= 1) {
          i = lat.length;
          lat.push(g.lat);
          lon.push(g.lon);
          lier(i, p);
        }
      } else if (p !== i) lier(i, p);
    }
    gares.push({ ...g, i });
  }

  // Les morceaux sans gare : retirés (union-find sur les voies).
  const parent = Array.from({ length: lat.length }, (_, i) => i);
  const racine = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (const ch of chaines) for (let k = 1; k < ch.length; k++) parent[racine(ch[k])] = racine(ch[0]);
  const avecGare = new Set(gares.map((g) => racine(g.i)));
  const morceaux = new Set<number>();
  for (const ch of chaines) morceaux.add(racine(ch[0]));
  const gardees: number[] = [];
  chaines.forEach((ch, k) => {
    if (avecGare.has(racine(ch[0]))) gardees.push(k);
  });

  // Renumérotation dans l'ordre des voies gardées : les écarts restent petits.
  const neuf = new Map<number, number>();
  const n: number[] = [];
  let px = 0;
  let py = 0;
  const renumeroter = (i: number) => {
    let j = neuf.get(i);
    if (j === undefined) {
      j = neuf.size;
      neuf.set(i, j);
      const x = quant(lon[i]);
      const y = quant(lat[i]);
      n.push(x - px, y - py);
      px = x;
      py = y;
    }
    return j;
  };
  const w = gardees.map((k) => chaines[k].map(renumeroter));
  const g = gares.map((x) => ({ ...x, i: renumeroter(x.i) }));
  const sens =
    mode === "voiture"
      ? {
          mode,
          s: gardees.flatMap((k, j) => (uniques[k] ? [j] : [])),
          l: gardees.flatMap((k, j) => (liens[k] ? [j] : [])),
        }
      : {};

  return {
    fichier: { v: 1, station: o.station, nom: o.nom, le: o.le, source: o.source, n, w, g, ...sens },
    bilan: {
      voiesLues: voies.length,
      voiesRetenues: retenues.length,
      noeuds: neuf.size,
      troncons: w.reduce((s, ch) => s + ch.length - 1, 0),
      gares: g.length,
      garesNonBranchees: nonBranchees,
      morceauxRetires: morceaux.size - avecGare.size,
    },
  };
}

/* ---------- Lecture : le graphe décodé ---------- */

export type Reseau = {
  station: string;
  lat: Float64Array;
  lon: Float64Array;
  /** Voisins en liste compacte : ceux d'où l'on rejoint le nœud `i` sont
   *  `cible[debut[i]..debut[i+1]]` (à pied, tous ses voisins). */
  debut: Int32Array;
  cible: Int32Array;
  longueur: Float64Array;
  /** Les tronçons, deux nœuds chacun, et leur longueur. */
  troncons: Int32Array;
  longueurTroncon: Float64Array;
  /** 1 : le tronçon ne se parcourt que de son premier nœud au second. */
  sensUnique: Uint8Array;
  gares: readonly GareFichier[];
  /** Grille d'accroche : case → tronçons qui la traversent. */
  grille: Map<number, number[]>;
  pasLat: number;
  pasLon: number;
};

/** Un fichier lisible : la forme attendue, sans quoi l'écran garde le vol d'oiseau. */
export function fichierValide(f: unknown): f is FichierReseau {
  if (!f || typeof f !== "object") return false;
  const x = f as Partial<FichierReseau>;
  return x.v === 1 && Array.isArray(x.n) && x.n.length % 2 === 0 && Array.isArray(x.w) && Array.isArray(x.g);
}

const cleCase = (cy: number, cx: number) => cy * 100_003 + cx;

export function lireReseau(f: FichierReseau): Reseau {
  const nb = f.n.length / 2;
  const lat = new Float64Array(nb);
  const lon = new Float64Array(nb);
  let x = 0;
  let y = 0;
  for (let i = 0; i < nb; i++) {
    x += f.n[2 * i];
    y += f.n[2 * i + 1];
    lon[i] = x / QUANTUM;
    lat[i] = y / QUANTUM;
  }
  const paires: number[] = [];
  const sens: number[] = [];
  const horsGrille: number[] = [];
  const uniques = new Set(Array.isArray(f.s) ? f.s : []);
  const liensGare = new Set(Array.isArray(f.l) ? f.l : []);
  f.w.forEach((ch, c) => {
    for (let k = 1; k < ch.length; k++) {
      const a = ch[k - 1];
      const b = ch[k];
      if (a !== b && a >= 0 && b >= 0 && a < nb && b < nb) {
        paires.push(a, b);
        sens.push(uniques.has(c) ? 1 : 0);
        horsGrille.push(liensGare.has(c) ? 1 : 0);
      }
    }
  });
  const nt = paires.length / 2;
  const troncons = Int32Array.from(paires);
  const sensUnique = Uint8Array.from(sens);
  const longueurTroncon = new Float64Array(nt);
  // Le champ part des gares et remonte les tronçons : on note, pour chaque
  // nœud, les voisins d'où on y arrive. Un sens unique de a vers b mène à b
  // depuis a, pas l'inverse.
  const degre = new Int32Array(nb + 1);
  for (let t = 0; t < nt; t++) {
    const a = troncons[2 * t];
    const b = troncons[2 * t + 1];
    longueurTroncon[t] = metres(lat[a], lon[a], lat[b], lon[b]);
    degre[b + 1]++;
    if (!sensUnique[t]) degre[a + 1]++;
  }
  const debut = new Int32Array(nb + 1);
  for (let i = 0; i < nb; i++) debut[i + 1] = debut[i] + degre[i + 1];
  const cible = new Int32Array(debut[nb]);
  const longueur = new Float64Array(debut[nb]);
  const pos = debut.slice(0, nb);
  for (let t = 0; t < nt; t++) {
    const a = troncons[2 * t];
    const b = troncons[2 * t + 1];
    cible[pos[b]] = a;
    longueur[pos[b]++] = longueurTroncon[t];
    if (sensUnique[t]) continue;
    cible[pos[a]] = b;
    longueur[pos[a]++] = longueurTroncon[t];
  }
  // La grille : chaque tronçon dans les cases de son emprise. Les liens
  // gare-route d'un réseau routier n'y sont pas : on ne s'y accroche pas.
  let latMoy = 0;
  for (let i = 0; i < nb; i++) latMoy += lat[i];
  const e = echelle(nb ? latMoy / nb : 45);
  const pasLat = CASE_M / e.y;
  const pasLon = CASE_M / e.x;
  const grille = new Map<number, number[]>();
  for (let t = 0; t < nt; t++) {
    if (horsGrille[t]) continue;
    const a = troncons[2 * t];
    const b = troncons[2 * t + 1];
    const y0 = Math.floor(Math.min(lat[a], lat[b]) / pasLat);
    const y1 = Math.floor(Math.max(lat[a], lat[b]) / pasLat);
    const x0 = Math.floor(Math.min(lon[a], lon[b]) / pasLon);
    const x1 = Math.floor(Math.max(lon[a], lon[b]) / pasLon);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = cleCase(cy, cx);
        const l = grille.get(k);
        if (l) l.push(t);
        else grille.set(k, [t]);
      }
    }
  }
  const gares = f.g.filter((g) => Number.isInteger(g.i) && g.i >= 0 && g.i < nb);
  return {
    station: f.station,
    lat,
    lon,
    debut,
    cible,
    longueur,
    troncons,
    longueurTroncon,
    sensUnique,
    gares,
    grille,
    pasLat,
    pasLon,
  };
}

/* ---------- Lecture : le champ de distances ---------- */

export type Champ = {
  /** Marche jusqu'à la gare la plus proche, en mètres ; `Infinity` : aucune. */
  dist: Float64Array;
  /** L'indice (dans `reseau.gares`) de cette gare, ou -1. */
  gare: Int32Array;
  /** Le nœud suivant vers cette gare, ou -1 (pour tracer le chemin). */
  suivant: Int32Array;
};

/** Un Dijkstra à sources multiples : toutes les gares partent à zéro. */
export function champDepuisGares(r: Reseau): Champ {
  const nb = r.lat.length;
  const dist = new Float64Array(nb).fill(Infinity);
  const gare = new Int32Array(nb).fill(-1);
  const suivant = new Int32Array(nb).fill(-1);
  // Tas binaire de (distance, nœud), entrées périmées sautées à la sortie.
  let tasD = new Float64Array(64);
  let tasN = new Int32Array(64);
  let taille = 0;
  const pousser = (d: number, i: number) => {
    if (taille === tasD.length) {
      const d2 = new Float64Array(taille * 2);
      d2.set(tasD);
      tasD = d2;
      const n2 = new Int32Array(taille * 2);
      n2.set(tasN);
      tasN = n2;
    }
    let k = taille++;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (tasD[p] <= d) break;
      tasD[k] = tasD[p];
      tasN[k] = tasN[p];
      k = p;
    }
    tasD[k] = d;
    tasN[k] = i;
  };
  const sortir = () => {
    const i = tasN[0];
    const d = tasD[--taille];
    const n = tasN[taille];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= taille) break;
      if (c + 1 < taille && tasD[c + 1] < tasD[c]) c++;
      if (tasD[c] >= d) break;
      tasD[k] = tasD[c];
      tasN[k] = tasN[c];
      k = c;
    }
    tasD[k] = d;
    tasN[k] = n;
    return i;
  };
  r.gares.forEach((g, k) => {
    if (dist[g.i] > 0) {
      dist[g.i] = 0;
      gare[g.i] = k;
      pousser(0, g.i);
    }
  });
  const fait = new Uint8Array(nb);
  while (taille > 0) {
    const u = sortir();
    if (fait[u]) continue;
    fait[u] = 1;
    const du = dist[u];
    for (let e = r.debut[u]; e < r.debut[u + 1]; e++) {
      const v = r.cible[e];
      const d = du + r.longueur[e];
      if (d < dist[v]) {
        dist[v] = d;
        gare[v] = gare[u];
        suivant[v] = u;
        pousser(d, v);
      }
    }
  }
  return { dist, gare, suivant };
}

/* ---------- Lecture : un logement ---------- */

export type MarcheVersGare = {
  /** Mètres à pied jusqu'à la gare, arrondis au mètre. */
  m: number;
  /** L'indice de la gare dans `reseau.gares`. */
  gare: number;
  /** Le bout fait hors des voies, du logement à la voie (ou à la gare). */
  horsVoieM: number;
  /** `voie` : par le réseau ; `tout-droit` : gare à `TOUT_DROIT_MAX_M` au plus. */
  par: "voie" | "tout-droit";
  /** Pour tracer le chemin : le point d'accroche et le premier nœud. */
  accroche: { lat: number; lon: number; noeud: number } | null;
};

/**
 * La marche d'un point jusqu'à la gare la plus proche **à pied**, ou `null`
 * si le point n'est pas sur le réseau (aucune voie à `ACCROCHE_MAX_M`, ou
 * seulement des voies qui ne mènent à aucune gare).
 *
 * Le point se raccroche en ligne droite à une voie (`horsVoieM`), suit la
 * voie jusqu'à l'un de ses deux nœuds, puis le champ. Jamais moins que la
 * distance à vol d'oiseau jusqu'à la même gare : l'arrondi des coordonnées
 * ne fait pas passer un chemin sous la ligne droite.
 *
 * Sur un réseau routier (`mode: "voiture"`), c'est le trajet en voiture :
 * même calcul, sens uniques respectés.
 */
export function marcheVersGare(r: Reseau, c: Champ, lat: number, lon: number): MarcheVersGare | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let meilleur: MarcheVersGare | null = null;
  const garder = (m: MarcheVersGare) => {
    if (!meilleur || m.m < meilleur.m) meilleur = m;
  };
  // Tout droit, à deux pas d'une gare.
  r.gares.forEach((g, k) => {
    const d = metres(lat, lon, g.lat, g.lon);
    if (d <= TOUT_DROIT_MAX_M) garder({ m: d, gare: k, horsVoieM: d, par: "tout-droit", accroche: null });
  });

  // Les tronçons des cases voisines, à `ACCROCHE_MAX_M` au plus.
  const ry = Math.ceil(ACCROCHE_MAX_M / CASE_M);
  const cy0 = Math.floor(lat / r.pasLat);
  const cx0 = Math.floor(lon / r.pasLon);
  const vus = new Set<number>();
  const proches: { t: number; d: number; tt: number }[] = [];
  let plusPres = Infinity;
  for (let cy = cy0 - ry; cy <= cy0 + ry; cy++) {
    for (let cx = cx0 - ry - 1; cx <= cx0 + ry + 1; cx++) {
      for (const t of r.grille.get(cleCase(cy, cx)) ?? []) {
        if (vus.has(t)) continue;
        vus.add(t);
        const a = r.troncons[2 * t];
        const b = r.troncons[2 * t + 1];
        const p = projeter(lat, lon, r.lat[a], r.lon[a], r.lat[b], r.lon[b]);
        if (p.d > ACCROCHE_MAX_M) continue;
        // Un tronçon sans issue (une impasse à sens unique) ne mène à aucune
        // gare : il ne doit pas écarter, par la marge, la route d'à côté.
        const issue = (!r.sensUnique[t] && Number.isFinite(c.dist[a])) || Number.isFinite(c.dist[b]);
        if (!issue) continue;
        proches.push({ t, d: p.d, tt: p.t });
        if (p.d < plusPres) plusPres = p.d;
      }
    }
  }
  for (const p of proches) {
    if (p.d > plusPres + ACCROCHE_MARGE_M) continue;
    const a = r.troncons[2 * p.t];
    const b = r.troncons[2 * p.t + 1];
    const L = r.longueurTroncon[p.t];
    // Un sens unique ne se remonte pas : de l'accroche, on ne va que vers b.
    const parA = r.sensUnique[p.t] ? Infinity : p.d + p.tt * L + c.dist[a];
    const parB = p.d + (1 - p.tt) * L + c.dist[b];
    const [m, n] = parA <= parB ? [parA, a] : [parB, b];
    if (!Number.isFinite(m) || c.gare[n] < 0) continue;
    garder({
      m,
      gare: c.gare[n],
      horsVoieM: p.d,
      par: "voie",
      accroche: {
        lat: r.lat[a] + p.tt * (r.lat[b] - r.lat[a]),
        lon: r.lon[a] + p.tt * (r.lon[b] - r.lon[a]),
        noeud: n,
      },
    });
  }
  const m = meilleur as MarcheVersGare | null;
  if (!m) return null;
  const g = r.gares[m.gare];
  const droit = metres(lat, lon, g.lat, g.lon);
  return { ...m, m: Math.round(Math.max(m.m, droit)) };
}

/**
 * Le chemin à pied du point à sa gare, pour la carte de la fiche : le point,
 * l'accroche, les nœuds du champ, la gare. `null` hors réseau.
 */
export function cheminVersGare(r: Reseau, c: Champ, lat: number, lon: number): { lat: number; lon: number }[] | null {
  const m = marcheVersGare(r, c, lat, lon);
  if (!m) return null;
  const g = r.gares[m.gare];
  const out = [{ lat, lon }];
  if (m.par === "voie" && m.accroche) {
    out.push({ lat: m.accroche.lat, lon: m.accroche.lon });
    let i = m.accroche.noeud;
    for (let garde = 0; i >= 0 && garde <= r.lat.length; garde++) {
      out.push({ lat: r.lat[i], lon: r.lon[i] });
      i = c.suivant[i];
    }
  }
  const dernier = out[out.length - 1];
  if (dernier.lat !== g.lat || dernier.lon !== g.lon) out.push({ lat: g.lat, lon: g.lon });
  return out;
}
