/** Appariement du classeur France Montagnes avec le référentiel du dépôt.
 *
 *  Le classeur (`franceMontagnes.data.ts`, généré par `npm run catalogue:import`
 *  depuis `docs/sources/stations-ski-france-montagnes.xlsx`) décrit 284 lignes.
 *  Le dépôt en décrit 231, avec des noms curés, des altitudes vérifiées, l'IGN
 *  RGE ALTI au pin, la photo et le mix Skiinfo.
 *
 *  Échelles, à ne jamais confondre :
 *  - **domaine** — km, tronçons, remontées, comptages par couleur, bas et haut
 *    des pistes : mesurés par OpenSkiMap sur le domaine skiable. Deux stations
 *    des 3 Vallées portent les mêmes, et c'est voulu.
 *  - **station** — altitude du village (RGE ALTI au point de la station),
 *    coordonnées, distance à la piste la plus proche.
 *
 *  Aucune valeur n'est estimée ici. Un champ non mesuré vaut `null` et l'écran
 *  affiche l'absence. */

import { FM_STATIONS, type FmStation } from "./franceMontagnes.data.ts";
import depotRows from "./stations.data.json" with { type: "json" };

export type StationKind = "station" | "village-station";

/** D'où vient un chiffre. Une valeur de domaine ne se compare pas à une valeur
 *  de fiche : l'écran affiche l'échelle plutôt que de les fondre. */
export type MeasureScale = "domaine" | "fiche";

export type ColorShare = { green: number; blue: number; red: number; black: number };
export type ColorCounts = ColorShare & { other: number };

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Rattachements que le classeur attribue par vote de proximité, et qu'il rate.
 *  Vérifiés contre le catalogue de forfaits du dépôt. Corriger ici plutôt que
 *  dans le fichier généré, qui serait écrasé au prochain import. */
export const DOMAIN_FIXES: Record<string, string> = {
  "Auris en Oisans": "Alpe d'Huez Grand Domaine",
  Orelle: "Les Trois Vallées",
  Samoens: "Le Grand Massif",
};

/** Libellé que le classeur emploie quand OpenSkiMap ne publie pas de nom de
 *  domaine. **Ce n'est pas une identité partagée** : trois domaines distincts
 *  et sans nom le portent, chacun avec ses mesures propres (1,4 / 0,4 / 0,2 km).
 *  C'est donc le seul libellé exempté de la règle « un domaine, un jeu de
 *  chiffres », et l'exemption est vérifiée par `classeur.test.ts`. */
export const UNNAMED_DOMAIN = "domaine non nommé (OpenStreetMap)";

/** Les chiffres d'échelle domaine, pris ensemble.
 *
 *  Ils vont ensemble parce qu'ils décrivent le même objet : corriger le
 *  rattachement d'une station sans les déplacer laissait le libellé annoncer
 *  « Les Trois Vallées » à côté des 195,7 km de Galibier-Thabor, c'est-à-dire
 *  deux affirmations contradictoires sur le même écran. */
export type DomainMeasure = {
  km: number | null;
  slopes: number | null;
  lifts: number | null;
  counts: ColorCounts | null;
  /** Domaine sur lequel OpenSkiMap a mesuré ces chiffres. */
  measuredOn: string | null;
  /** Vrai quand `DOMAIN_FIXES` a corrigé le rattachement et que les chiffres
   *  ont suivi, au lieu de rester ceux du domaine que le classeur avait retenu. */
  realigned: boolean;
};

/** Garde-fou de dernier recours sur les correspondances de nom. Généreux : les
 *  deux sources posent le pin à des endroits différents d'une même station
 *  étendue — Les Menuires 5,7 km, Monts Jura 8,0 km, Le Corbier 5,9 km. Il
 *  n'est là que pour attraper une dérive future des données. */
const NAME_MATCH_MAX_KM = 15;

/** Stations du dépôt dont le nom existe au classeur sans désigner le même lieu.
 *  Le classeur nomme « Le Granier » une station de Saint-Pierre-de-Chartreuse ;
 *  le dépôt nomme « Le Granier » le domaine de la vallée des Entremonts, à
 *  9,2 km. Deux lieux, deux domaines. */
const NAME_MATCH_EXCEPTIONS = new Set<string>(["le-granier-vallee-des-entremonts"]);

/** Correspondances qu'aucune règle ne trouve : graphie différente, station
 *  nommée par son domaine, ou village-station absorbé. Distance relevée en
 *  commentaire ; au-delà de 3 km, le nom porte la preuve, pas la distance. */
const MANUAL_PAIRS: [depotId: string, fmName: string][] = [
  ["espace-alpin-bellefontaine", "Bellefontaine"], // 105 m
  ["sixt-fer-a-cheval", "Sixt"], // 110 m
  ["le-schnepfenried", "Schnepfenried"], // 114 m
  ["col-de-marcieu", "Le Col De Marcieu - Chartreuse"], // 155 m
  ["superdevoluy-la-joue-du-loup", "Superdévoluy"], // 164 m
  ["ristolas", "Abriès Aiguilles & Ristolas"], // 183 m
  ["flumet-st-nicolas-la-chapelle", "Flumet - Saint Nicolas La Chapelle"], // 204 m
  ["saint-jean-montclar", "Montclar"], // 214 m
  ["le-collet-dallevard", "Le Collet"], // 272 m
  ["serre-chevalier", "Serre Chevalier Villeneuve"], // 313 m
  ["ventoux-mont-serein", "Mont Serein / Ventoux Sud"], // 360 m
  ["metabief-mont-dor", "Métabief"], // 452 m
  ["manigod", "Manigod/Col de Merdassier"], // 467 m
  ["saint-jean-daulps", "Espace Roc d'Enfer"], // 490 m
  ["bellevaux-hirmentaz", "Hirmentaz"], // 526 m
  ["la-rosiere-1850", "La Rosiere"], // 616 m
  ["ancelle", "Ancelle Village Station"], // 674 m
  ["le-champ-du-feu", "Champ Du Feu"], // 679 m
  ["la-croix-de-bauzon", "Croix de Bauzon"], // 690 m
  ["col-de-rousset", "Col du Rousset"], // 778 m
  ["montmin-col-de-la-forclaz", "Montmin"], // 779 m
  ["puyvalador", "Puyvalador Rieutort"], // 808 m
  ["molines-en-queyras", "Molines Saint-Véran en Queyras"], // 857 m
  ["font-romeu-pyrenees-2000", "Font-Romeu"], // 913 m
  ["luchon-superbagneres", "Superbagnères"], // 1 005 m
  ["chaillol", "Saint Michel de Chaillol"], // 1 050 m
  ["les-haberes", "Habère Poche"], // 1 086 m
  ["la-chapelle-dabondance", "Chapelle d'Abondance"], // 1 255 m
  ["font-durle", "Fond d'Urle"], // 1 417 m — coquille du classeur
  ["romme", "Nancy sur Cluses"], // 1 456 m
  ["eyne-cambre-daze", "Le Cambre d'Aze"], // 1 460 m
  ["la-grave-la-meije", "La Grave"], // 1 543 m
  ["les-carroz", "Les Carroz d'Araches"], // 1 586 m
  ["la-bresse-lispach", "Lispach - La Bresse"], // 2 026 m
  ["autrans", "Autrans Méaudres en Vercors"], // 2 263 m
  ["les-egaux", "Saint Hugues - Les Egaux"], // 2 411 m
  ["xonrupt-le-poli", "Xonrupt Longemer"], // 2 419 m
  ["villard-de-lans", "Villard De Lans - Correncon"], // 2 564 m
  ["avoriaz", "Avoriaz 1800"], // 2 864 m
  ["gourette", "Gourrette"], // 3 178 m — coquille du classeur
  // Le dépôt décrit le domaine entier ; le classeur le découpe en Barèges,
  // La Mongie et Grand Tourmalet. C'est le domaine qui correspond.
  ["la-mongie-bareges", "Grand Tourmalet"],
  // Le nom du dépôt dit « Le Planolet » ; le classeur a les deux lignes, et
  // « Le Granier » est une autre station du même domaine.
  ["saint-pierre-de-chartreuse", "Le Planolet"], // 3 191 m
  ["laudibergue-la-mouliere", "Audibergue"], // 3 519 m
  ["goulier", "Goulier Neige"], // 3 675 m
  ["praboure", "Saint-Anthème - Praboure"], // 4 226 m
  ["les-plans-dhotonnes-plateau-de-retord", "Plateau de Retord"], // 5 387 m
  ["mont-aigoual", "Prat Peyrot / Mont Aigoual"], // 8 206 m
  // Le dépôt décrit la station, le classeur ses deux fronts de neige.
  ["praloup", "Pra Loup 1600"], // 329 m
];

type DepotGeo = { id: string; name: string; lat: number; lon: number };
const DEPOT_GEO = depotRows as unknown as DepotGeo[];

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 78);
}

/** Le classeur a porté un doublon (« Chamonix Mont-Blanc » et
 *  « Chamonix-Mont-Blanc », mêmes coordonnées), retiré de la source le
 *  12 septembre 2026. Le garde-fou reste : deux lignes qui se réduisent au même
 *  identifiant sont écartées et listées par `CLASSEUR_DUPLICATES`. */
export type ClasseurEntry = {
  fm: FmStation;
  /** Identifiant retenu : celui du dépôt quand la station y existe. */
  id: string;
  depotId: string | null;
  kind: StationKind;
  domain: string | null;
  /** Chiffres d'échelle domaine, réalignés si le rattachement a été corrigé. */
  measure: DomainMeasure;
};

function buildEntries(): {
  entries: ClasseurEntry[];
  duplicates: string[];
  collisions: string[];
  realigned: string[];
} {
  const byDepotId = new Map(DEPOT_GEO.map((d) => [d.id, d]));
  const byDepotName = new Map<string, DepotGeo>();
  for (const d of DEPOT_GEO) {
    const k = slugify(d.name);
    if (!byDepotName.has(k)) byDepotName.set(k, d);
  }
  const manual = new Map(MANUAL_PAIRS.map(([depotId, fmName]) => [fmName, depotId]));

  // 1. Deux lignes du classeur qui se réduisent au même identifiant décrivent
  //    la même station : « Chamonix Mont-Blanc » et « Chamonix-Mont-Blanc ».
  const duplicates: string[] = [];
  const unique: FmStation[] = [];
  const seenSlug = new Set<string>();
  for (const fm of FM_STATIONS) {
    const key = slugify(fm.fmName);
    if (seenSlug.has(key)) duplicates.push(fm.fmName);
    else {
      seenSlug.add(key);
      unique.push(fm);
    }
  }

  // 2. Les correspondances manuelles d'abord : elles portent la preuve du nom
  //    et ne doivent jamais se faire souffler leur ligne par l'ordre de lecture.
  const pairedDepot = new Map<FmStation, DepotGeo>();
  const taken = new Set<string>();
  for (const fm of unique) {
    const depotId = manual.get(fm.fmName);
    const depot = depotId ? byDepotId.get(depotId) : undefined;
    if (depot && !taken.has(depot.id)) {
      taken.add(depot.id);
      pairedDepot.set(fm, depot);
    }
  }

  // 3. Puis l'identifiant ou le nom, à condition que les deux pins soient au
  //    même endroit — même nom ne veut pas dire même lieu.
  for (const fm of unique) {
    if (pairedDepot.has(fm)) continue;
    const key = slugify(fm.fmName);
    const candidate = byDepotId.get(key) ?? byDepotName.get(key);
    if (!candidate || taken.has(candidate.id)) continue;
    if (NAME_MATCH_EXCEPTIONS.has(candidate.id)) continue;
    if (distanceKm(fm, candidate) > NAME_MATCH_MAX_KM) continue;
    taken.add(candidate.id);
    pairedDepot.set(fm, candidate);
  }

  // 4. Identifiants. Les stations appariées prennent celui du dépôt ; les
  //    autres le tirent de leur nom. Le classeur nomme « Praloup » une ligne
  //    distincte de « Pra Loup 1600 », déjà appariée à la station `praloup` du
  //    dépôt : la ligne n'est pas supprimée, elle reçoit le code INSEE de sa
  //    commune en suffixe. Le numéro de ligne du classeur ferait un suffixe
  //    instable — il glisse dès qu'on ajoute ou retire une ligne.
  const collisions: string[] = [];
  const assigned = new Set<string>();
  const ordered = [...unique].sort(
    (a, b) => Number(pairedDepot.has(b)) - Number(pairedDepot.has(a)),
  );
  const idOf = new Map<FmStation, string>();
  for (const fm of ordered) {
    const depot = pairedDepot.get(fm);
    const base = depot?.id ?? slugify(fm.fmName);
    let id = base;
    if (assigned.has(id)) {
      id = `${base}-${fm.insee || slugify(fm.commune)}`;
      for (let n = 2; assigned.has(id); n += 1) id = `${base}-${fm.insee}-${n}`;
      collisions.push(`${fm.fmName} → ${id}`);
    }
    assigned.add(id);
    idOf.set(fm, id);
  }

  // 5. Chiffres d'échelle domaine. Une ligne dont `DOMAIN_FIXES` corrige le
  //    rattachement garde, dans le classeur, les mesures du domaine que le vote
  //    de proximité lui avait attribué : Orelle porte les 195,7 km de
  //    Galibier-Thabor tout en étant rattachée aux Trois Vallées. Le libellé et
  //    les chiffres se contredisaient alors sur le même écran. On prend donc les
  //    mesures du domaine d'arrivée, telles qu'une ligne non corrigée de ce
  //    domaine les publie. Rien n'est recalculé ni moyenné : les chiffres
  //    existent déjà, ils changent seulement de porteur.
  const measureOf = (fm: FmStation): DomainMeasure => ({
    km: fm.km,
    slopes: fm.slopes,
    lifts: fm.lifts,
    counts: countsOf(fm),
    measuredOn: fm.domain,
    realigned: false,
  });

  const nativeByDomain = new Map<string, DomainMeasure>();
  for (const fm of unique) {
    if (!fm.domain || fm.domain === UNNAMED_DOMAIN) continue;
    // Une ligne corrigée ne fait pas autorité sur le domaine qu'elle rejoint.
    if (DOMAIN_FIXES[fm.fmName]) continue;
    if (!nativeByDomain.has(fm.domain)) nativeByDomain.set(fm.domain, measureOf(fm));
  }

  const realigned: string[] = [];
  const entries = unique.map((fm) => {
    const depot = pairedDepot.get(fm);
    const fixedTo = DOMAIN_FIXES[fm.fmName];
    const target = fixedTo ? nativeByDomain.get(fixedTo) : undefined;
    let measure = measureOf(fm);
    if (fixedTo && target) {
      measure = { ...target, realigned: true };
      realigned.push(`${fm.fmName} : ${fm.domain ?? "sans domaine"} → ${fixedTo}`);
    }
    return {
      fm,
      id: idOf.get(fm)!,
      depotId: depot?.id ?? null,
      kind: fm.kind === "village" ? ("village-station" as const) : ("station" as const),
      domain: fixedTo ?? fm.domain,
      measure,
    };
  });
  return { entries, duplicates, collisions, realigned };
}

const built = buildEntries();

export const CLASSEUR: ClasseurEntry[] = built.entries;

/** Lignes du classeur écartées parce qu'une autre porte déjà leur identifiant. */
export const CLASSEUR_DUPLICATES: string[] = built.duplicates;

/** Lignes distinctes dont le nom se réduisait à un identifiant déjà pris, et
 *  qui ont reçu leur numéro de classeur en suffixe. */
export const CLASSEUR_ID_COLLISIONS: string[] = built.collisions;

/** Stations dont les chiffres de domaine ont suivi la correction de
 *  rattachement. Exporté pour que la correction se lise, plutôt que d'agir en
 *  silence sur trois lignes perdues dans 284. */
export const CLASSEUR_REALIGNED: string[] = built.realigned;

/** Répartition par couleur en %, dérivée des tronçons du domaine. `null` quand
 *  aucune couleur n'est comptée — jamais un zéro inventé. */
export function shareFromCounts(cnt: ColorCounts | null): ColorShare | null {
  if (!cnt) return null;
  const total = cnt.green + cnt.blue + cnt.red + cnt.black;
  if (total <= 0) return null;
  return {
    green: Math.round((cnt.green / total) * 100),
    blue: Math.round((cnt.blue / total) * 100),
    red: Math.round((cnt.red / total) * 100),
    black: Math.round((cnt.black / total) * 100),
  };
}

/** Comptages par couleur du domaine. `null` si le classeur n'en compte aucun. */
export function countsOf(fm: FmStation): ColorCounts | null {
  const { green, blue, red, black, unclassed } = fm;
  if (green == null && blue == null && red == null && black == null) return null;
  return {
    green: green ?? 0,
    blue: blue ?? 0,
    red: red ?? 0,
    black: black ?? 0,
    other: unclassed ?? 0,
  };
}
