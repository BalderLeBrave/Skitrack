/**
 * La gare de remontée la plus proche d'un point, toutes stations confondues.
 *
 * `nearestLift` ne lit que les gares de la station cherchée, et cette liste
 * est incomplète pour plusieurs stations : au repère de Saint-Martin-de-
 * Belleville, elle mesurait 2 839 m (gare « Olympic ») quand la gare
 * « Village » est à 27 m. La règle des 2 km (`dansLaStation`) écartait ainsi
 * des villages entiers. Les 7 030 gares de `osmLifts.json` donnent la vraie
 * distance.
 *
 * Module léger : il ne charge que `osmLifts.json`, jamais l'index par station
 * (`osmAccess.snapshot.json`, 1,9 Mo), car l'onglet budget remesure chaque
 * annonce enregistrée à sa lecture. Chargé tel quel par
 * `node --experimental-strip-types` : imports relatifs avec leur extension.
 */
import lifts from "./osmLifts.json" with { type: "json" };
import type { OsmPt } from "./osmAccess.data.ts";
import type { OsmHit } from "./osmAccess.ts";

/** Les remontées en projet (« (Project) Télécabine Bozel… », « (Proposed) … »)
 *  n'existent pas : au repère de Courchevel, l'une passait devant la vraie. */
const PROJET = /^((project|proposed))/i;

const GARES: readonly OsmPt[] = (lifts as OsmPt[]).filter((p) => !PROJET.test(p.n ?? ""));

/** Une gare de l'index national ne fait un logement de station que si elle est
 *  à 3 km au plus du repère d'une station : le téléphérique de la Bastille à
 *  Grenoble, le funiculaire d'Évian ou un téléski de Moûtiers ne font pas d'un
 *  appartement de ville un logement au pied des pistes. */
export const RAYON_GARE_STATION_M = 3000;

type Repere = { lat: number; lon: number };

const R_TERRE = 6371000;
const RAD = Math.PI / 180;

/** Venue telle quelle de `osmAccess.ts`, qui la réexporte : le calcul reste
 *  au bit près celui des distances déjà mesurées. */
export function metresBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat);
  const dLon = toR(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TERRE * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function asHit(p: OsmPt, m: number, other: OsmPt | null): OsmHit {
  return {
    name: p.n,
    kind: p.k,
    m,
    lat: p.lat,
    lon: p.lon,
    otherLat: other?.lat ?? null,
    otherLon: other?.lon ?? null,
  };
}

/** L'autre gare du même appareil : même nom, même genre, la plus éloignée
 *  entre 8 m et 12 km. */
export function mateOf(lifts: readonly OsmPt[], p: OsmPt): OsmPt | null {
  let best: OsmPt | null = null;
  let bestM = 0;
  for (const q of lifts) {
    if (q.n !== p.n || q.k !== p.k) continue;
    const m = metresBetween(p.lat, p.lon, q.lat, q.lon);
    if (m < 8 || m > 12_000) continue;
    if (m > bestM) {
      bestM = m;
      best = q;
    }
  }
  return best;
}

/* ---------- Grille ---------- */

/** Pas de la grille, en degrés : 2,2 km en latitude, 1,3 à 1,6 km en
 *  longitude sous nos latitudes. Un logement à 2 km d'une gare se tranche en
 *  deux ou trois couronnes de cases. */
const PAS = 0.02;
/** Au-delà de huit couronnes (plus de 11 km), les cases sont presque toutes
 *  vides : parcourir les 7 030 gares coûte moins. */
const COURONNES_MAX = 8;

type Index = {
  cases: Map<number, number[]>;
  /** Cosinus de la plus forte latitude des gares : minore l'écart en longitude. */
  cosMax: number;
  /** Les gares de même nom et de même genre, dans l'ordre du fichier. */
  appareils: Map<string | null, Map<string, OsmPt[]>>;
  /** L'autre gare de chaque gare déjà rendue, par rang. */
  jumelles: Map<number, OsmPt | null>;
};

let index: Index | null = null;

/** i ∈ [-4 500, 4 500] et j ∈ [-9 000, 9 000] : une clé entière unique. */
function cle(i: number, j: number): number {
  return i * 100_000 + j;
}

/** Bâti au premier appel, une fois : l'import du module ne coûte rien. */
function indexer(): Index {
  if (index) return index;
  const cases = new Map<number, number[]>();
  const appareils = new Map<string | null, Map<string, OsmPt[]>>();
  let latMax = 0;
  GARES.forEach((p, k) => {
    const c = cle(Math.floor(p.lat / PAS), Math.floor(p.lon / PAS));
    const dans = cases.get(c);
    if (dans) dans.push(k);
    else cases.set(c, [k]);
    latMax = Math.max(latMax, Math.abs(p.lat));
    let parGenre = appareils.get(p.n);
    if (!parGenre) appareils.set(p.n, (parGenre = new Map()));
    const memes = parGenre.get(p.k);
    if (memes) memes.push(p);
    else parGenre.set(p.k, [p]);
  });
  index = { cases, cosMax: Math.cos(latMax * RAD), appareils, jumelles: new Map() };
  return index;
}

/**
 * Minore la distance de `lat` à toute gare hors des couronnes 0 à `r`. Une
 * telle gare est à plus de `r` pas en latitude, donc à plus de R·r·pas, ou à
 * plus de `r` pas en longitude ; l'haversine donne alors
 * sin(d/2R) ≥ √(cos φ · cos φmax) · sin(r·pas/2), φmax la plus forte latitude
 * des gares.
 */
function horsCouronnes(r: number, lat: number, cosMax: number): number {
  const ecart = r * PAS * RAD;
  const parLat = R_TERRE * ecart;
  const facteur = Math.sqrt(Math.max(0, Math.cos(lat * RAD) * cosMax));
  const parLon = 2 * R_TERRE * Math.asin(Math.min(1, facteur * Math.sin(ecart / 2)));
  return Math.min(parLat, parLon);
}

function jumelle(ix: Index, k: number): OsmPt | null {
  const connue = ix.jumelles.get(k);
  if (connue !== undefined) return connue;
  const p = GARES[k] as OsmPt;
  const trouvee = mateOf(ix.appareils.get(p.n)?.get(p.k) ?? [], p);
  ix.jumelles.set(k, trouvee);
  return trouvee;
}

/**
 * La gare la plus proche de (lat, lon) parmi toutes celles de
 * `osmLifts.json`, avec l'autre gare de son appareil : le même résultat qu'un
 * parcours complet, à égalité la première du fichier. Les cases se lisent par
 * couronnes autour du point, jusqu'à ce qu'aucune case restante ne puisse
 * tenir une gare plus proche ; loin de toute gare, le parcours complet.
 * `null` : position invalide.
 */
export function nearestAnyLift(lat: number, lon: number): OsmHit | null {
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || GARES.length === 0) return null;
  const ix = indexer();
  const i0 = Math.floor(lat / PAS);
  const j0 = Math.floor(lon / PAS);
  let meilleure = -1;
  let meilleureM = Number.POSITIVE_INFINITY;
  const voir = (k: number) => {
    const p = GARES[k] as OsmPt;
    const m = metresBetween(lat, lon, p.lat, p.lon);
    if (m < meilleureM || (m === meilleureM && k < meilleure)) {
      meilleureM = m;
      meilleure = k;
    }
  };
  let trouvee = false;
  for (let r = 0; r <= COURONNES_MAX && !trouvee; r++) {
    for (let i = i0 - r; i <= i0 + r; i++) {
      // Sur les rangées du bord, toute la rangée ; entre elles, les deux extrémités.
      const bord = i === i0 - r || i === i0 + r;
      for (let j = j0 - r; j <= j0 + r; j += bord ? 1 : 2 * r) {
        const dans = ix.cases.get(cle(i, j));
        if (dans) for (const k of dans) voir(k);
      }
    }
    // Un millimètre de jeu couvre les arrondis du flottant, aux bords des cases.
    trouvee = meilleureM + 0.001 <= horsCouronnes(r, lat, ix.cosMax);
  }
  if (!trouvee) for (let k = 0; k < GARES.length; k++) voir(k);
  const p = GARES[meilleure];
  return p ? asHit(p, Math.round(meilleureM), jumelle(ix, meilleure)) : null;
}

/**
 * La gare la plus proche, toutes stations confondues, pourvu qu'elle soit à
 * `RAYON_GARE_STATION_M` au plus de l'un des repères donnés (station cherchée,
 * station la plus proche du logement). `null` sinon : la liste de la station
 * reste alors la seule mesure.
 */
export function nearestStationLift(
  lat: number,
  lon: number,
  reperes: readonly (Repere | null | undefined)[],
): OsmHit | null {
  const g = nearestAnyLift(lat, lon);
  if (!g) return null;
  const pres = reperes.some(
    (r) => r != null && metresBetween(g.lat, g.lon, r.lat, r.lon) <= RAYON_GARE_STATION_M,
  );
  return pres ? g : null;
}
