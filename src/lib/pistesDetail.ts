/**
 * Le détail des pistes d'une station, piste par piste.
 *
 * Les tronçons viennent d'openskidata (`public/pistes-detail/<domaine>.json`,
 * écrit par `scripts/build-pistes-detail.py`, voir `docs/PISTES-DETAIL.md`).
 * Un fichier couvre un domaine de tête (Les Trois Vallées) et les domaines
 * qu'il contient (Val Thorens, Méribel…) ; chaque tronçon dit les siens.
 * `portionStation` en tire les pistes d'une station : celles de son domaine,
 * moins celles qu'openskidata range dans le domaine d'une station voisine,
 * et, quand deux stations partagent un même domaine sans secteur publié
 * (Tignes et Val d'Isère), celles dont le point bas est plus près d'elle.
 *
 * Un tronçon OSM n'est pas une piste : ceux d'un même nom, d'une même couleur
 * et d'un même secteur sont réunis ici, les tronçons sans nom restent à part. Les couleurs
 * passent par `difficultyToColor`, comme partout dans l'application ; ce qui
 * n'est ni vert, ni bleu, ni rouge, ni noir va dans « autres ».
 *
 * Un tracé qui part d'une remontée ou y mène sans rejoindre de piste nommée
 * n'est pas une piste : il sort de la liste dès sa construction (`regrouper`),
 * et les totaux du tableau (`totauxPistes`) ne le comptent pas.
 *
 * Les totaux et les parts de couleur affichés au-dessus du tableau restent
 * ceux de Skiinfo (`docs/PISTES.md`) : ce module ne les remplace pas.
 */

import { difficultyToColor, type PisteColor } from "./pistes.ts";
import type { OsmVerdict } from "./openskimap.ts";
import { langueIntl } from "./i18n/langue.ts";

export type TronconDetail = {
  nom: string | null;
  ref: string | null;
  difficulte: string | null;
  longueurM: number | null;
  departM: number | null;
  arriveeM: number | null;
  hautM: number | null;
  basM: number | null;
  damage: string | null;
  eclairee: boolean | null;
  surface: boolean;
  /** Point le plus bas, [lon, lat]. */
  bas: [number, number] | null;
  /** Rangs, dans `DetailDomaine.aires`, des domaines qui portent ce tronçon. */
  a: number[];
  /** Liaison sans nom : le nom de la piste qu'elle rejoint (ou d'où elle part). */
  nomDeduit?: string;
  /** Surface sans nom qui contient le tracé d'une piste nommée : son contour dessiné. */
  recouvre?: boolean;
  /** Liaison vers ou depuis une remontée, sans piste nommée : « Accès au télésiège X ». */
  acces?: string;
  /** Ni piste ni accès : zone dessinée sans piste nommée, bout de moins de 100 m relié à rien. */
  ecarte?: "surface" | "fragment";
  /** Piste restée sans nom : la remontée la plus proche de son départ, « près du téléski X ». */
  pres?: string;
};

/** Un domaine d'openskidata, et son nombre de tronçons de descente en Europe. */
export type AireDetail = { id: string; nom: string; n: number };

export type DetailDomaine = {
  domaine: string;
  nom: string;
  le: string;
  source: string;
  /** Du plus grand au plus petit ; le premier est le domaine de tête. */
  aires: AireDetail[];
  troncons: TronconDetail[];
};

/** L'entrée d'une station dans `pistesDetail.index.json`. */
export type IndexStation = {
  /** Le domaine de tête, nom du fichier. */
  fichier: string;
  /** Le domaine de la station dans ce fichier (témoin OpenSkiMap). */
  aire: string;
  /** Les stations dont le domaine est celui-ci ou l'un de ceux qu'il contient, elle comprise. */
  voisines: string[];
};

export type PisteDetail = {
  /** Clé stable pour React : nom replié et couleur, ou rang pour un tronçon sans nom. */
  cle: string;
  nom: string | null;
  couleur: PisteColor;
  /** Somme des tronçons ; `null` si aucun n'a de longueur (surface). */
  longueurM: number | null;
  /** Plus haut moins plus bas point de la piste. */
  denivelleM: number | null;
  departM: number | null;
  arriveeM: number | null;
  /** Vrai si un tronçon est damé, faux si tous sont dits non damés, `null` sinon. */
  damee: boolean | null;
  eclairee: boolean | null;
  /** Le plus petit domaine publié qui porte la piste, sous celui du tableau. */
  secteur: string | null;
  troncons: number;
  /** Liaisons sans nom rendues à la piste qu'elles rejoignent. */
  rattaches: number;
};

/** Les libellés des couleurs, écrits en toutes lettres à côté de la pastille. */
export const COULEUR_LIBELLE: Record<PisteColor, string> = {
  green: "Verte",
  blue: "Bleue",
  red: "Rouge",
  black: "Noire",
  other: "Autre",
};

/** L'ordre des couleurs dans le tableau et dans le tri. */
export const ORDRE_COULEUR: PisteColor[] = ["green", "blue", "red", "black", "other"];

/**
 * Damage d'openskidata (`grooming`) : `classic`, `skating`, `classic+skating`,
 * `scooter` sont damés ; `backcountry` (hors-piste) et `mogul` (bosses) ne le
 * sont pas ; l'absence n'est rien.
 */
export function estDamee(grooming: string | null | undefined): boolean | null {
  if (!grooming) return null;
  if (grooming === "backcountry" || grooming === "mogul") return false;
  return true;
}

function plierNom(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Vrai si l'un l'est, faux si tous disent non, `null` si rien n'est su. */
function union(valeurs: (boolean | null)[]): boolean | null {
  if (valeurs.some((v) => v === true)) return true;
  if (valeurs.length > 0 && valeurs.every((v) => v === false)) return false;
  return null;
}

function max(v: (number | null)[]): number | null {
  const n = v.filter((x): x is number => x != null);
  return n.length ? Math.max(...n) : null;
}

function min(v: (number | null)[]): number | null {
  const n = v.filter((x): x is number => x != null);
  return n.length ? Math.min(...n) : null;
}

function enPiste(
  cle: string,
  nom: string | null,
  couleur: PisteColor,
  secteur: string | null,
  ts: TronconDetail[],
): PisteDetail {
  const longueurs = ts.map((t) => t.longueurM).filter((x): x is number => x != null);
  const haut = max(ts.map((t) => t.hautM));
  const bas = min(ts.map((t) => t.basM));
  return {
    cle,
    nom,
    couleur,
    longueurM: longueurs.length ? longueurs.reduce((a, b) => a + b, 0) : null,
    denivelleM: haut != null && bas != null ? haut - bas : null,
    // Le départ d'une piste faite de tronçons est le plus haut de leurs
    // départs, son arrivée le plus bas de leurs arrivées.
    departM: max(ts.map((t) => t.departM)),
    arriveeM: min(ts.map((t) => t.arriveeM)),
    damee: union(ts.map((t) => estDamee(t.damage))),
    eclairee: union(ts.map((t) => t.eclairee)),
    secteur,
    troncons: ts.length,
    rattaches: ts.filter((t) => !t.nom?.trim() && t.nomDeduit).length,
  };
}

export type Regroupement = {
  /** Les pistes nommées. */
  pistes: PisteDetail[];
  /** Les pistes qu'OpenStreetMap ne nomme pas, reliées à aucune piste nommée ni remontée. */
  sansNom: PisteDetail[];
};

/**
 * Les pistes d'un tableau, tronçons d'un même nom, d'une même couleur et d'un
 * même secteur réunis. Une « Verte » de Méribel et une « Verte » de Courchevel
 * restent deux pistes dès que le secteur est connu.
 *
 * Un tronçon sans nom n'est pas une piste à part (`scripts/build-pistes-detail.py`,
 * `rattacher`) : une liaison rendue à sa piste (`nomDeduit`) la rejoint. Ne
 * sont pas des pistes, et sortent de la liste : un tracé qui part d'une
 * remontée ou y mène sans rejoindre de piste nommée (`acces`), une surface qui
 * dessine une piste déjà listée (`recouvre`), et ce qui n'est ni piste ni accès
 * (`ecarte`). Ne reste sans nom que ce qu'OpenStreetMap laisse sans nom et que
 * rien ne relie.
 */
export function regrouper(
  troncons: readonly TronconDetail[],
  secteur: (t: TronconDetail) => string | null = () => null,
): Regroupement {
  type Groupe = { nom: string; couleur: PisteColor; secteur: string | null; ts: TronconDetail[] };
  const groupes = new Map<string, Groupe>();
  const sansNom: PisteDetail[] = [];
  troncons.forEach((t, i) => {
    const couleur = difficultyToColor(t.difficulte ?? undefined);
    const nom = t.nom?.trim() || t.nomDeduit?.trim() || null;
    const sect = secteur(t);
    if (nom) {
      const cle = `${plierNom(nom)}|${couleur}|${sect ?? ""}`;
      const g = groupes.get(cle) ?? { nom, couleur, secteur: sect, ts: [] };
      g.ts.push(t);
      groupes.set(cle, g);
      return;
    }
    // Pas une piste : ni affiché, ni compté.
    if (t.recouvre || t.ecarte || t.acces) return;
    sansNom.push(enPiste(`sans-nom-${i}`, t.pres ? `Sans nom, ${t.pres}` : null, couleur, sect, [t]));
  });
  const pistes = [...groupes.entries()].map(([cle, g]) => enPiste(cle, g.nom, g.couleur, g.secteur, g.ts));
  return {
    pistes: trier(pistes, "nom", "asc"),
    sansNom: trier(sansNom, "longueur", "desc"),
  };
}

/** Le nombre de pistes et leurs kilomètres, sur la liste construite : les
 *  tracés qui ne sont pas des pistes en sont déjà sortis. */
export function totauxPistes(r: Regroupement): { pistes: number; km: number } {
  const toutes = [...r.pistes, ...r.sansNom];
  const m = toutes.reduce((s, p) => s + (p.longueurM ?? 0), 0);
  return { pistes: toutes.length, km: m / 1000 };
}

export type CleTri = "nom" | "couleur" | "longueur" | "denivelle";

/** Tri stable ; une valeur absente va toujours en fin de liste. */
export function trier(pistes: readonly PisteDetail[], cle: CleTri, sens: "asc" | "desc"): PisteDetail[] {
  const s = sens === "asc" ? 1 : -1;
  const val = (p: PisteDetail): string | number | null =>
    cle === "nom"
      ? p.nom
      : cle === "couleur"
        ? ORDRE_COULEUR.indexOf(p.couleur)
        : cle === "longueur"
          ? p.longueurM
          : p.denivelleM;
  return pistes
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const va = val(a.p);
      const vb = val(b.p);
      if (va == null && vb == null) return a.i - b.i;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = typeof va === "string" ? va.localeCompare(String(vb), "fr", { sensitivity: "base" }) : va - (vb as number);
      return c !== 0 ? s * c : a.i - b.i;
    })
    .map((x) => x.p);
}

/**
 * Les parts de couleur des pistes nommées, en nombre et en pour cent entier.
 * Les pour cent somment exactement à 100 (plus forts restes) : un arrondi
 * naïf rendait 99 ou 101.
 */
export function parts(pistes: readonly PisteDetail[]): Record<PisteColor, { n: number; pct: number }> {
  const n: Record<PisteColor, number> = { green: 0, blue: 0, red: 0, black: 0, other: 0 };
  for (const p of pistes) n[p.couleur] += 1;
  const total = pistes.length;
  const brut = ORDRE_COULEUR.map((c) => (total ? (100 * n[c]) / total : 0));
  const bas = brut.map(Math.floor);
  let reste = total ? 100 - bas.reduce((a, b) => a + b, 0) : 0;
  const ordre = brut.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const { i } of ordre) {
    if (reste <= 0) break;
    bas[i] += 1;
    reste -= 1;
  }
  return Object.fromEntries(ORDRE_COULEUR.map((c, i) => [c, { n: n[c], pct: bas[i]! }])) as Record<
    PisteColor,
    { n: number; pct: number }
  >;
}

/**
 * Le détail piste par piste existe-t-il pour ce verdict du témoin
 * OpenSkiMap ? Non pour `osm_absent` et `osm_vide` : le domaine n'est pas
 * connu, ou n'y compte aucune piste de descente.
 */
export function detailDisponible(verdict: OsmVerdict | "osm_absent" | null | undefined): boolean {
  return !!verdict && verdict !== "osm_absent" && verdict !== "osm_vide";
}

/**
 * Le secteur d'un tronçon dans un tableau : le plus petit domaine publié qui
 * le porte, s'il est plus petit que celui du tableau (`contexte`). Dans le
 * tableau des Trois Vallées, une piste de Val Thorens dit « Val Thorens » ;
 * dans celui de Val Thorens, elle n'a pas de secteur.
 */
export function secteurDe(t: TronconDetail, aires: readonly AireDetail[], contexte: string): string | null {
  const n = aires.find((a) => a.id === contexte)?.n ?? Infinity;
  let meilleur: AireDetail | null = null;
  for (const i of t.a) {
    const a = aires[i];
    if (a && a.n < n && (!meilleur || a.n < meilleur.n)) meilleur = a;
  }
  return meilleur?.nom ?? null;
}

export type Repere = { id: string; lat: number; lon: number };

function metres(bas: [number, number], r: Repere): number {
  const rad = Math.PI / 180;
  const dLat = (r.lat - bas[1]) * rad;
  const dLon = (r.lon - bas[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(bas[1] * rad) * Math.cos(r.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Les tronçons d'une station, tirés du fichier de son domaine de tête.
 *
 * 1. Seuls comptent les tronçons du domaine de la station (`entree.aire`).
 * 2. Un tronçon qu'openskidata range aussi dans le domaine plus petit d'une
 *    voisine (La Chapelle-d'Abondance dans l'Espace Liberté de Châtel) est à
 *    elle.
 * 3. Le reste, quand la station n'est pas seule, va à la voisine la plus
 *    proche de son point bas : openskidata ne sépare pas Tignes de Val
 *    d'Isère. Un tronçon sans position ne se rattache pas.
 *
 * `proximite` compte les tronçons gardés par la règle 3, `nonRattaches` ceux
 * qu'elle n'a pas pu placer.
 */
export function portionStation(
  detail: DetailDomaine,
  station: string,
  entree: IndexStation,
  aireDe: Readonly<Record<string, string>>,
  reperes: readonly Repere[],
): { troncons: TronconDetail[]; proximite: number; nonRattaches: number } {
  const rang = new Map(detail.aires.map((a, i) => [a.id, i]));
  const iAire = rang.get(entree.aire);
  if (iAire == null) return { troncons: [], proximite: 0, nonRattaches: 0 };
  const sous = entree.voisines
    .filter((v) => v !== station && aireDe[v] && aireDe[v] !== entree.aire)
    .map((v) => rang.get(aireDe[v]!))
    .filter((i): i is number => i != null);
  const seule = entree.voisines.length <= 1;
  const candidats = reperes.filter((r) => entree.voisines.includes(r.id));
  const troncons: TronconDetail[] = [];
  let proximite = 0;
  let nonRattaches = 0;
  for (const t of detail.troncons) {
    if (!t.a.includes(iAire)) continue;
    if (sous.some((i) => t.a.includes(i))) continue;
    if (seule) {
      troncons.push(t);
      continue;
    }
    if (!t.bas || candidats.length === 0) {
      nonRattaches += 1;
      continue;
    }
    const bas = t.bas;
    const proche = candidats.reduce((m, r) => (metres(bas, r) < metres(bas, m) ? r : m));
    if (proche.id === station) {
      troncons.push(t);
      proximite += 1;
    }
  }
  return { troncons, proximite, nonRattaches };
}

/**
 * La ligne compacte « nombre de pistes · km » du comparateur, avec sa source :
 * les totaux de Skiinfo, à l'échelle de la fiche (station ou vallée). `null`
 * quand Skiinfo ne publie ni l'un ni l'autre.
 */
export function lignePistes(
  row: { n: number | null; km: number | null; grain: "station" | "valley" } | null | undefined,
): string | null {
  if (!row || (row.n == null && row.km == null)) return null;
  const nb = (v: number, d = 0) => v.toLocaleString(langueIntl(), { maximumFractionDigits: d });
  const morceaux = [
    row.n != null ? `${nb(row.n)}\u00a0piste${row.n > 1 ? "s" : ""}` : null,
    row.km != null ? `${nb(row.km, 1)}\u00a0km` : null,
  ].filter(Boolean);
  return `${morceaux.join(" · ")} (Skiinfo, ${row.grain === "valley" ? "vallée" : "station"})`;
}
