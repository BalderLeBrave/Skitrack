/**
 * Le référentiel mondial : 5 720 domaines de ski alpin, 73 pays.
 *
 * Frère de `stations.ts`, qui décrit les 320 stations françaises et ne bouge
 * pas. Les deux ne se mélangent jamais : la France garde le classeur France
 * Montagnes, qui la décrit mieux qu'OpenSkiMap ne le ferait, et ce fichier
 * sert le reste du monde — France comprise, mais par sa seule entrée
 * OpenSkiMap, qui n'est pas la même chose et ne prétend pas l'être.
 *
 * ## Les deux portes, et pourquoi elles diffèrent
 *
 * `STATIONS` est construit au chargement du module, et trente-six fichiers
 * l'importent. Le même geste sur 5 720 domaines ferait payer le monde entier à
 * tout écran qui touche au référentiel — c'est ce que l'audit du 18 septembre
 * 2026 nomme comme le point qui décide si l'extension tient.
 *
 * D'où deux portes de formes différentes, à dessein :
 *
 * - `STATIONS` reste synchrone et inchangé, pour la France ;
 * - `domainesPays(cc)` est **asynchrone** et n'ouvre qu'un pays à la fois,
 *   par un `import()` que le bundler découpe en autant de morceaux.
 *
 * Seul `index.json` est importé statiquement. Il ne porte que des compteurs et
 * un cadrage par pays — 6 Ko — et c'est lui qui permet à un écran d'annoncer
 * « 381 domaines en Autriche » sans ouvrir l'Autriche.
 *
 * ## Ce qu'une clé absente veut dire
 *
 * La règle du référentiel français, tenue à l'identique : **une valeur absente
 * n'est pas un zéro.** Les fichiers omettent les clés non relevées plutôt que
 * de recopier 5 720 `null` ; la lecture ci-dessous les rétablit en `null`, pour
 * que les écrans voient une forme unique et que `atLeast` écarte un domaine non
 * mesuré au lieu de le compter comme nul.
 *
 * Un `0` écrit, lui, est un zéro relevé — un domaine dont aucune piste n'est
 * cartographiée en a un, et ce n'est pas la même chose qu'une absence.
 */

import type { ColorShare } from "../classeur.ts";
import { paysByCode, type Pays } from "../geo/pays.ts";
import type { Cadre } from "../geo/continents.ts";
import INDEX from "./data/index.json" with { type: "json" };

/** D'où vient une entrée. Le schéma d'OpenSkiMap n'en admet que deux. */
export type SourceMonde = {
  type: "openstreetmap" | "skimap.org";
  id: string | number;
};

/**
 * Un domaine du référentiel mondial.
 *
 * **Une station est un domaine**, et non une localité. Le recensement l'a
 * tranché : trois domaines autrichiens sur quatre ne portent aucune localité,
 * et quand elle existe elle nomme la commune et non la station — « Axamer
 * Lizum » a pour localité Axams, et un domaine viennois a simplement Vienna.
 * Ranger par localité aurait rebaptisé les stations du nom de leur mairie.
 * `localite` reste donc un champ d'appoint, jamais la clé.
 */
export type DomaineMonde = {
  /** Clé construite, stable d'un relevé au suivant. Voir `identifiant()` dans
   *  `scripts/build-monde.py` : l'`id` d'OpenSkiMap est un condensé du contenu
   *  et change dès qu'une piste bouge. */
  id: string;
  nom: string;
  /** Tous les pays du domaine, le principal en tête. Un seul, sauf pour les 68
   *  domaines à cheval sur une frontière. */
  pays: string[];
  /** La subdivision de premier niveau, en anglais : c'est la seule langue
   *  qu'OpenSkiMap traduit. Absente pour une part des domaines. */
  region: string | null;
  /** ISO 3166-2, quand la source la donne. */
  iso3166_2: string | null;
  localite: string | null;
  lat: number;
  lon: number;
  /** Km de pistes de descente, à l'échelle du domaine. */
  km: number | null;
  /** Tronçons de pistes de descente. */
  n: number | null;
  /** Tronçons dont la difficulté n'entre dans aucune des quatre couleurs. */
  nOther: number | null;
  lifts: number | null;
  /** Tronçons par couleur. Même forme que le `ColorShare` du référentiel
   *  français, dont le type est réemployé plutôt que redéclaré. */
  counts: ColorShare | null;
  /** Km par couleur. */
  kms: ColorShare | null;
  /** Altitudes du **domaine**, et non d'un village : le point bas d'un domaine
   *  n'est pas l'altitude de la station au sens du référentiel français. */
  minM: number | null;
  maxM: number | null;
  sites: string[];
  wikidata: string | null;
  sources: SourceMonde[];
};

/** Ce que l'index sait d'un pays sans qu'on ouvre son fichier. */
export type PaysIndex = {
  code: string;
  domaines: number;
  /** Cadrage calculé sur les stations du pays, pas sur ses frontières. */
  cadre: Cadre | null;
  kmTotal: number | null;
  maxM: number | null;
};

type IndexBrut = typeof INDEX;

/** La date du relevé OpenSkiMap dont sortent ces fichiers. */
export const RELEVE_MONDE: string = INDEX.releve;

/** Le seuil retenu, en toutes lettres, pour que l'écran puisse le dire. */
export const SEUIL_MONDE: string = INDEX.seuil;

export const DOMAINES_MONDE: number = INDEX.domaines;

/**
 * Les trois domaines qu'OpenSkiMap ne rattache à aucun pays, et qui sont donc
 * hors du référentiel. Leurs coordonnées les placeraient en Chine, aux îles
 * Åland et au Svalbard, mais un référentiel qui range par pays ne devine pas
 * celui-là : l'audit demande un branchement sur `country`, jamais sur une
 * devinette. Le compte est publié pour que l'absence se voie.
 */
export const SANS_PAYS: number = INDEX.sansPays;

/** Un cadrage lu du JSON, où il n'est qu'un tableau de nombres. Quatre bornes
 *  ou rien : un cadrage tronqué cadrerait la planète entière. */
function versCadre(v: readonly number[] | undefined): Cadre | null {
  return v && v.length === 4 ? [v[0], v[1], v[2], v[3]] : null;
}

const PAR_CODE = new Map<string, PaysIndex>(
  (INDEX.pays as IndexBrut["pays"]).map((p) => [
    p.code,
    {
      code: p.code,
      domaines: p.domaines,
      cadre: versCadre(p.cadre),
      kmTotal: p.kmTotal ?? null,
      maxM: p.maxM ?? null,
    },
  ]),
);

/** Les codes des pays qui portent au moins un domaine retenu, triés. */
export const PAYS_AVEC_DOMAINES: readonly string[] = [...PAR_CODE.keys()].sort();

export function indexPays(cc: string): PaysIndex | undefined {
  return PAR_CODE.get(cc.toUpperCase());
}

/**
 * Les pays du référentiel que `geo/pays.ts` ne décrit pas encore.
 *
 * `pays.ts` annonce sa liste comme provisoire et confie à cette phase le soin
 * de la confronter au référentiel. Le résultat se publie plutôt qu'il ne se
 * comble : un pays sans devise ni fuseau doit se voir, parce qu'un écran qui
 * affiche un prix sans devise ment, alors qu'un écran qui dit « nous ne savons
 * pas encore » ne ment pas.
 */
export function paysSansFiche(): string[] {
  return PAYS_AVEC_DOMAINES.filter((cc) => !paysByCode(cc));
}

/**
 * Le cadrage à montrer pour un pays.
 *
 * Celui des stations l'emporte sur celui des frontières, comme `geo/pays.ts`
 * l'annonce : l'emprise d'un pays n'est pas celle de ses pistes, et cadrer
 * l'Australie sur ses frontières montre Perth pour atteindre trois stations de
 * Nouvelle-Galles du Sud.
 */
export function cadrePays(cc: string): Cadre | null {
  return indexPays(cc)?.cadre ?? paysByCode(cc)?.cadre ?? null;
}

/** La fiche pays, quand `geo/pays.ts` la connaît. */
export function fichePays(cc: string): Pays | undefined {
  return paysByCode(cc);
}

type FicheBrute = Partial<Omit<DomaineMonde, "id" | "nom" | "lat" | "lon">> &
  Pick<DomaineMonde, "id" | "nom" | "lat" | "lon">;

/** Rétablit la forme unique : ce que le fichier omet vaut `null`. */
function lire(f: FicheBrute, cc: string): DomaineMonde {
  return {
    id: f.id,
    nom: f.nom,
    pays: f.pays ?? [cc],
    region: f.region ?? null,
    iso3166_2: f.iso3166_2 ?? null,
    localite: f.localite ?? null,
    lat: f.lat,
    lon: f.lon,
    km: f.km ?? null,
    n: f.n ?? null,
    nOther: f.nOther ?? null,
    lifts: f.lifts ?? null,
    counts: f.counts ?? null,
    kms: f.kms ?? null,
    minM: f.minM ?? null,
    maxM: f.maxM ?? null,
    sites: f.sites ?? [],
    wikidata: f.wikidata ?? null,
    sources: f.sources ?? [],
  };
}

const CACHE = new Map<string, Promise<DomaineMonde[]>>();

async function fichier(cc: string): Promise<DomaineMonde[]> {
  const mod = (await import(`./data/${cc}.json`, { with: { type: "json" } })) as {
    default: FicheBrute[];
  };
  return mod.default.map((f) => lire(f, cc));
}

function ouvrir(cc: string): Promise<DomaineMonde[]> {
  const deja = CACHE.get(cc);
  if (deja) return deja;
  const p = fichier(cc);
  CACHE.set(cc, p);
  return p;
}

/**
 * Les domaines d'un pays, frontaliers compris.
 *
 * **Un domaine n'est écrit qu'une fois**, dans le fichier de son pays
 * principal. Les 68 domaines à cheval sur une frontière sont rappelés par
 * l'index, et ramenés ici depuis leur fichier hôte : c'est ce qui fait sortir
 * Les Portes du Soleil sous « France » comme sous « Suisse » sans qu'elles
 * soient copiées des deux côtés, donc sans qu'un relevé puisse les rendre
 * divergentes.
 *
 * Un code inconnu rend un tableau vide plutôt qu'une erreur : un pays sans
 * domaine retenu est un fait du référentiel, pas une panne.
 */
export async function domainesPays(code: string): Promise<DomaineMonde[]> {
  const cc = code.toUpperCase();
  if (!PAR_CODE.has(cc)) return [];

  const hotes = new Set<string>();
  for (const p of INDEX.partages) {
    if (p.hote !== cc && p.pays.includes(cc)) hotes.add(p.hote);
  }

  const [siens, ...ailleurs] = await Promise.all([
    ouvrir(cc),
    ...[...hotes].sort().map((h) => ouvrir(h)),
  ]);

  const partages = ailleurs.flat().filter((d) => d.pays.includes(cc));
  return [...siens, ...partages];
}

/**
 * Le relevé d'altitude du point de référence de chaque domaine.
 *
 * **Fichier distinct du référentiel, et c'est voulu.** Une altitude de modèle
 * de terrain et les `minElevation`/`maxElevation` d'OpenSkiMap ne mesurent pas
 * la même chose ; les ranger dans le même enregistrement les ferait passer
 * pour deux valeurs du même relevé. C'est la règle que l'audit pose pour
 * `alt.ign.json`, tenue ici à l'identique — et c'est aussi ce qui permet de
 * refaire l'un sans refaire l'autre.
 *
 * Le fichier est chargé à la demande, comme un pays : 5 220 entrées n'ont rien
 * à faire dans le lot de départ d'un écran qui n'affiche pas d'altitude.
 */
export type ReleveDem = {
  releve: string;
  /** « Copernicus DEM GLO-90 », à citer à l'écran comme on cite « IGN au pin ». */
  modele: string;
  /** Ce que le point est, et ce qu'il n'est pas. */
  point: string;
  domaines: number;
  manquants: number;
  points: Record<string, number>;
};

let demEnCours: Promise<ReleveDem> | null = null;

export function releveDem(): Promise<ReleveDem> {
  demEnCours ??= import("./data/dem.json", { with: { type: "json" } }).then(
    (m) => m.default as ReleveDem,
  );
  return demEnCours;
}

/**
 * L'altitude relevée au point de référence d'un domaine, ou `null`.
 *
 * Le `null` couvre deux cas qui se ressemblent et ne sont pas les mêmes : un
 * domaine qu'aucun relevé ne couvre, et un domaine dont le relevé n'a rien
 * rendu. Ni l'un ni l'autre n'autorise à écrire un zéro, qui se lirait comme
 * le niveau de la mer.
 */
export async function demDuDomaine(id: string): Promise<number | null> {
  const r = await releveDem();
  return r.points[id] ?? null;
}

/** Les altitudes d'un lot de domaines, le fichier n'étant ouvert qu'une fois. */
export async function demDesDomaines(ids: readonly string[]): Promise<Map<string, number>> {
  const r = await releveDem();
  const out = new Map<string, number>();
  for (const id of ids) {
    const m = r.points[id];
    if (m != null) out.set(id, m);
  }
  return out;
}

/** Les domaines de plusieurs pays, chacun ouvert une seule fois. Sert la carte,
 *  qui ne charge que les pays visibles dans le cadre. */
export async function domainesPaysMulti(codes: readonly string[]): Promise<DomaineMonde[]> {
  const vus = new Set<string>();
  const out: DomaineMonde[] = [];
  for (const lot of await Promise.all(codes.map((c) => domainesPays(c)))) {
    for (const d of lot) {
      if (vus.has(d.id)) continue;
      vus.add(d.id);
      out.push(d);
    }
  }
  return out;
}
