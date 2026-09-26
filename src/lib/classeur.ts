/** Appariement du classeur France Montagnes avec le référentiel du dépôt.
 *
 *  Le classeur (`franceMontagnes.data.ts`, généré par `npm run catalogue:import`
 *  depuis `docs/sources/stations-ski-france-montagnes.xlsx`) décrit 284 lignes,
 *  dont 4 en double d'une autre station (`LIGNES_EN_DOUBLE`) : 280 entrent.
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

/** Chiffres d'un domaine tels qu'OpenSkiMap les publie : km, tronçons,
 *  remontées, tronçons par couleur, bas et haut des pistes. */
export type ChiffresDomaine = {
  km: number;
  slopes: number;
  lifts: number;
  counts: ColorCounts;
  bas: number;
  haut: number;
};

/** Un rattachement corrigé, libellé et chiffres ensemble. `domain` à `null` :
 *  la station n'est rattachée à aucun domaine alpin, et n'a donc aucun chiffre
 *  de domaine. */
export type DomaineCorrige = {
  domain: string | null;
  chiffres: ChiffresDomaine | null;
};

/**
 * Rattachements corrigés **avec leurs chiffres**, par identifiant de station.
 *
 * `DOMAIN_FIXES` ne sait que changer de libellé, en prenant les chiffres d'une
 * ligne non corrigée du domaine d'arrivée. Il ne sait ni retirer un domaine, ni
 * donner des chiffres qu'aucune ligne du classeur ne porte. Les trois cas
 * ci-dessous demandent l'un ou l'autre ; trouvés par l'audit du 26 septembre
 * 2026 dans les relevés du propriétaire, et vérifiés sur openskidata.org
 * (export du 22 septembre 2026).
 *
 * - **La Bourboule** n'a plus de ski alpin : la télécabine de Charlannes est
 *   désaffectée, et la première remontée de ski est à 5,8 km, au Mont-Dore. Le
 *   classeur la range dans « Super Besse » (64,1 km, 37 remontées) par le vote
 *   de proximité. Chercher à La Bourboule rendait donc 37 annonces du
 *   Mont-Dore, jugées « dans le domaine » : « Appartement Mont-Dore, 4 pièces,
 *   6 pers. » à 749 m du Capucin, 5 km du bourg. Elle garde son identifiant, sa
 *   commune et son repère : elle a une vraie zone nordique, et ses relevés
 *   doivent se relire. Pas de règle de distance : elle prendrait dix-huit
 *   stations, dont de vraies stations alpines.
 * - **La Bresse-Lispach** et **Xonrupt** : le classeur décale les libellés.
 *   Lispach porte « Gérardmer » et ses 22,8 km, Xonrupt porte « La Bresse -
 *   Lispach » et ses 3,3 km. Le repère de Lispach est à 86 m du téléski de
 *   Saichy, zone OpenSkiMap « La Bresse - Lispach » ; les remontées de
 *   Gérardmer sont à 2 km, dans une autre zone. Effet sur le relevé de
 *   Lispach : 31 annonces sur 33 étaient en ville de Gérardmer (« Au cœur de
 *   Gérardmer, bel appartement rénové », 5,7 km du Saichy), jugées « dans le
 *   domaine ». Les chiffres de Lispach sont ceux que le classeur publie sur la
 *   ligne de Xonrupt (11 tronçons, dont 1 non classé) ; ceux de Xonrupt, ceux
 *   qu'OpenSkiMap mesure sur sa zone « Xonrupt-Longemer »
 *   (`openskimap.snapshot.json`, 3 tronçons), qu'aucune ligne du classeur ne
 *   porte. Corriger le classeur xlsx aurait le même effet au prochain
 *   `npm run catalogue:import` ; la correction vit ici, comme `DOMAIN_FIXES`,
 *   et `stationMigration.test.ts` dit quand elle devient inutile.
 */
export const DOMAINES_CORRIGES: Record<string, DomaineCorrige> = {
  "la-bourboule": { domain: null, chiffres: null },
  "la-bresse-lispach": {
    domain: "La Bresse - Lispach",
    chiffres: {
      km: 3.3,
      slopes: 11,
      lifts: 5,
      counts: { green: 4, blue: 4, red: 1, black: 1, other: 1 },
      bas: 909,
      haut: 1116,
    },
  },
  "xonrupt-le-poli": {
    domain: "Xonrupt-Longemer",
    chiffres: {
      km: 1.5,
      slopes: 3,
      lifts: 2,
      counts: { green: 1, blue: 2, red: 0, black: 0, other: 0 },
      bas: 807,
      haut: 972,
    },
  },
};

/**
 * La station n'a pas de domaine alpin, et on le sait : `DOMAINES_CORRIGES` lui
 * retire son rattachement (La Bourboule).
 *
 * Distinct d'un domaine absent : là où le domaine n'est pas relevé, l'écran
 * écrit « non renseigné » ; ici la réponse est connue, et elle est « non ».
 * Ses altitudes de pistes valent 0 au référentiel : ce n'est pas une mesure.
 */
export function sansDomaineAlpin(id: string): boolean {
  const corrige = DOMAINES_CORRIGES[id] as DomaineCorrige | undefined;
  return corrige !== undefined && corrige.domain === null;
}

/**
 * Lignes du classeur qui décrivent une station déjà présente sous un autre
 * identifiant : même lieu, même domaine, mêmes logements. Relevées par l'audit
 * du 26 septembre 2026. Elles sont écartées à l'entrée, comme
 * `CLASSEUR_DUPLICATES`, et leur identifiant renvoie à la station gardée
 * (`IDS_RETIRES`) : un séjour, une comparaison ou un relevé enregistrés sous
 * l'ancien identifiant retrouvent la station.
 *
 * - « Sainte-Foy Station » : à 117 m de Sainte-Foy-Tarentaise, mêmes
 *   remontées (Grand Plan à 8 m, Marmottes à 58 m), une seule zone OpenSkiMap.
 * - « Saint-Pancrace les Bottières » : à 138 m des Bottières, mêmes téléskis
 *   (Marmottes, Cabri).
 * - « Praloup » (`praloup-04226`) : même nom et même commune (Uvernet-Fours)
 *   que Praloup, repère à 2,8 km de toute remontée ; le vote de proximité le
 *   rangeait au Sauze (51,7 km, 21 remontées) et lui prêtait sa photo.
 * - « Espace Aubrac » : ligne identique à celle de Laguiole (même point à 1 m,
 *   même domaine, mêmes mesures) ; son repère tombait dans le bourg, à 4,4 km
 *   de toute remontée.
 *
 * Ce qui n'y est pas, exprès : Chamrousse 1750 (Roche Béranger, un autre
 * village, avec ses remontées et son forfait), les paires station et village
 * (Tignes et Tignes-le-Lac, Chamrousse et 1650, Les 7 Laux et Prapoutel), et
 * « Le Granier », dont l'identité avec la station du dépôt n'est pas prouvée
 * (voir `NAME_MATCH_EXCEPTIONS`).
 */
const LIGNES_EN_DOUBLE: { ligne: string; retire: string; garde: string }[] = [
  { ligne: "Sainte-Foy Station", retire: "sainte-foy-station", garde: "sainte-foy-tarentaise" },
  {
    ligne: "Saint-Pancrace les Bottières",
    retire: "saint-pancrace-les-bottieres",
    garde: "les-bottieres",
  },
  { ligne: "Praloup", retire: "praloup-04226", garde: "praloup" },
  { ligne: "Espace Aubrac", retire: "espace-aubrac", garde: "laguiole" },
];

/**
 * Identifiants retirés du référentiel, vers la station qui les remplace.
 *
 * Les quatre lignes en double, plus Lus-la-Croix-Haute : sa ligne du classeur
 * est appariée depuis le 26 septembre 2026 à la station du dépôt
 * `lus-la-jarjatte` (voir `MANUAL_PAIRS`) et en prend l'identifiant. Une seule
 * zone OpenSkiMap, « Lus la Jarjatte » ; la première remontée est à 120 m du
 * repère du dépôt et à 3,1 km de celui du classeur, au centre du village.
 *
 * `stationById` les résout : rien de ce qui a été enregistré ne se perd.
 */
export const IDS_RETIRES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(LIGNES_EN_DOUBLE.map((d) => [d.retire, d.garde])),
  "lus-la-croix-haute": "lus-la-jarjatte",
};

/**
 * Le nom affiché d'une station, quand ses deux sources ne l'écrivent pas pareil.
 *
 * Le dépôt Skiinfo écrit « Brides les Bains », « Chatel », « Saint Martin de
 * Belleville » ; France Montagnes écrit « Brides Les Bains », « Châtel »,
 * « Serre Chevalier Briancon ». Aucune des deux ne tient la typographie
 * française des noms de lieux, et la fiche affichait l'une pendant que les
 * listes affichaient l'autre.
 *
 * Deux règles, dans cet ordre, et **aucune invention** :
 *
 * 1. La commune du classeur vient de l'INSEE et s'écrit juste. Quand le nom de
 *    la station est celui de sa commune à la casse, aux accents et aux traits
 *    d'union près, c'est l'orthographe de la commune qui s'affiche. « Brides
 *    les Bains » et « Brides-les-Bains » sont le même nom ; le second est le
 *    bon.
 * 2. Les stations dont le nom n'est pas celui d'une commune — Saint-Martin-de-
 *    Belleville est sur la commune des Belleville, Serre Chevalier Briançon sur
 *    celle de La Salle-les-Alpes — ne peuvent pas être corrigées par une règle.
 *    Elles passent par la table ci-dessous, une entrée à la fois, relue.
 */
export const NOMS_FIXES: Record<string, string> = {
  "saint-martin-de-belleville": "Saint-Martin-de-Belleville",
  "serre-chevalier-briancon": "Serre Chevalier Briançon",
  "serre-chevalier-chantemerle": "Serre Chevalier Chantemerle",
  "serre-chevalier-villeneuve": "Serre Chevalier Villeneuve",
};

/** La clé de rapprochement de deux graphies d'un même nom de lieu. */
function cleNom(nom: string): string {
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function nomAffiche(
  id: string,
  nomDepot: string | null | undefined,
  nomClasseur: string,
  commune: string | null | undefined,
): string {
  const corrige = NOMS_FIXES[id];
  if (corrige) return corrige;
  const nom = nomDepot ?? nomClasseur;
  if (commune && cleNom(commune) === cleNom(nom)) return commune;
  // À défaut de commune, le classeur porte parfois les accents que le dépôt a
  // perdus : « Châtel » contre « Chatel ». Même nom, plus d'information.
  if (nomClasseur && cleNom(nomClasseur) === cleNom(nom)) {
    const accents = (t: string) => t.length - cleNom(t).length;
    if (accents(nomClasseur) > accents(nom)) return nomClasseur;
  }
  return nom;
}

/** Positions relevées à la main sur le centre de la station, le 15 septembre
 *  2026. Le classeur France Montagnes pose le pin au centre de la **commune** :
 *  Lanslebourg tombait à 5,7 km de ses pistes, Val Joly à 3,5 km, Arc 1600 à
 *  2,3 km. Vingt-deux stations sont concernées.
 *
 *  Corriger ici et non dans le fichier généré, qui serait écrasé au prochain
 *  import — même raison que `DOMAIN_FIXES`.
 *
 *  Trois identifiants diffèrent de ceux du relevé : `avoriaz-1800`,
 *  `chamonix-mont-blanc` et `les-carroz-d-araches` s'appellent ici `avoriaz`,
 *  `chamonix` et `les-carroz`. */
export const GPS_FIXES: Record<string, readonly [number, number]> = {
  "aime-2000": [45.5085, 6.6725], // Aime 2000
  "arc-1600": [45.5735, 6.796], // Arc 1600
  "arc-1800": [45.5717, 6.806], // Arc 1800
  "arc-1950": [45.5731, 6.8285], // Arc 1950
  "arc-2000": [45.5715, 6.8319], // Arc 2000
  "argentiere": [45.984, 6.928], // Argentière
  "avoriaz": [46.1917, 6.7733], // Avoriaz 1800
  "belle-plagne": [45.5128, 6.706], // Belle Plagne
  "bisanne-1500": [45.7526, 6.5243], // Bisanne 1500
  "chamonix": [45.9237, 6.8694], // Chamonix Mont-Blanc
  "courchevel-moriond-1650": [45.4165, 6.652], // Courchevel Moriond 1650
  "flaine": [46.0056, 6.69], // Flaine
  "hauteluce-val-joly": [45.7593, 6.6046], // Hauteluce Val Joly
  "la-daille": [45.4595, 6.962], // La Daille
  "lanslebourg": [45.286, 6.879], // Lanslebourg
  "lanslevillard": [45.29, 6.908], // Lanslevillard
  "le-bettex": [45.86, 6.696], // Le Bettex
  "le-chinaillon": [45.9647, 6.4509], // Le Chinaillon
  "le-fornet": [45.4397, 7.019], // Le Fornet
  "le-tour": [45.9997, 6.9473], // Le Tour
  "les-carroz": [46.0268, 6.6385], // Les Carroz d'Araches
  "les-coches": [45.5472, 6.743], // Les Coches
};

/** Vrai quand la position vient d'un relevé : une correction de `GPS_FIXES`,
 *  ou un pin mesuré du dépôt (`pinKind` autre qu'`inconnu`). Faux quand elle
 *  est le centre de la commune, et l'infobulle de la carte le dit. */
export function posRelevee(id: string, pinKind: string): boolean {
  return id in GPS_FIXES || pinKind !== "inconnu";
}

/** Libellé que le classeur emploie quand OpenSkiMap ne publie pas de nom de
 *  domaine. **Ce n'est pas une identité partagée** : trois domaines distincts
 *  et sans nom le portent, chacun avec ses mesures propres (1,4 / 0,4 / 0,2 km).
 *  C'est donc le seul libellé exempté de la règle « un domaine, un jeu de
 *  chiffres », et l'exemption est vérifiée par `fiche.test.ts`. */
export const UNNAMED_DOMAIN = "domaine non nommé (OpenStreetMap)";

/**
 * Le libellé désigne-t-il un domaine skiable ? Ni vide, ni `UNNAMED_DOMAIN`.
 *
 * Beille (Ariège), Névache (Hautes-Alpes) et Saint-Colomban-des-Villards
 * (Savoie) portent ce libellé sans rien partager : trois zones OpenSkiMap
 * distinctes, de 44 à 471 km l'une de l'autre. Le traiter en domaine les
 * faisait voisines dans le menu « Plus », prêtait à Névache la photo de
 * Saint-Colomban « même domaine », et les comptait « Domaine relié » (audit
 * du 26 septembre 2026). Tout ce qui réunit des stations par leur domaine
 * passe par ce prédicat.
 */
export function domaineNomme(d: string | null | undefined): d is string {
  return d != null && d !== "" && d !== UNNAMED_DOMAIN;
}

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
  /** Bas et haut des pistes du domaine. La fiche Skiinfo du dépôt prime quand
   *  la station en a une. */
  bas: number | null;
  haut: number | null;
  /** Domaine sur lequel OpenSkiMap a mesuré ces chiffres. */
  measuredOn: string | null;
  /** Vrai quand `DOMAIN_FIXES` ou `DOMAINES_CORRIGES` ont corrigé le
   *  rattachement et que les chiffres ont suivi, au lieu de rester ceux du
   *  domaine que le classeur avait retenu. */
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
  // Le classeur pose Lus au centre du village, à 3,1 km de la première
  // remontée ; le dépôt la pose à 120 m. Une seule zone OpenSkiMap, « Lus la
  // Jarjatte » : c'est la même station (audit du 26 septembre 2026).
  ["lus-la-jarjatte", "Lus la Croix Haute"], // 2 964 m
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
  enDouble: string[];
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
  const enDoubleNoms = new Set(LIGNES_EN_DOUBLE.map((d) => d.ligne));

  // 1. Deux lignes du classeur qui se réduisent au même identifiant décrivent
  //    la même station : « Chamonix Mont-Blanc » et « Chamonix-Mont-Blanc ».
  //    Les lignes en double sous un autre nom (`LIGNES_EN_DOUBLE`) sortent
  //    ici aussi : aucune règle ne les trouve, la table les nomme.
  const duplicates: string[] = [];
  const enDouble: string[] = [];
  const unique: FmStation[] = [];
  const seenSlug = new Set<string>();
  for (const fm of FM_STATIONS) {
    if (enDoubleNoms.has(fm.fmName)) {
      enDouble.push(fm.fmName);
      continue;
    }
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
  //    autres le tirent de leur nom. Deux lignes distinctes dont les noms se
  //    réduisent au même identifiant gardent chacune la leur : la seconde
  //    reçoit le code INSEE de sa commune en suffixe. Le numéro de ligne du
  //    classeur ferait un suffixe instable — il glisse dès qu'on ajoute ou
  //    retire une ligne. « Praloup » l'avait reçu (`praloup-04226`) jusqu'à
  //    ce que l'audit du 26 septembre 2026 la reconnaisse en double de
  //    Praloup : le garde-fou reste pour la prochaine.
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
  //    existent déjà, ils changent seulement de porteur. Une station de
  //    `DOMAINES_CORRIGES` reçoit, elle, les chiffres que la table lui donne,
  //    ou aucun quand elle n'a plus de domaine.
  const measureOf = (fm: FmStation): DomainMeasure => ({
    km: fm.km,
    slopes: fm.slopes,
    lifts: fm.lifts,
    counts: countsOf(fm),
    bas: fm.min,
    haut: fm.max,
    measuredOn: fm.domain,
    realigned: false,
  });

  const nativeByDomain = new Map<string, DomainMeasure>();
  for (const fm of unique) {
    if (!domaineNomme(fm.domain)) continue;
    // Une ligne corrigée ne fait pas autorité sur le domaine qu'elle rejoint,
    // ni sur celui qu'elle quitte.
    if (DOMAIN_FIXES[fm.fmName] || DOMAINES_CORRIGES[idOf.get(fm)!]) continue;
    if (!nativeByDomain.has(fm.domain)) nativeByDomain.set(fm.domain, measureOf(fm));
  }

  const realigned: string[] = [];
  const entries = unique.map((fm) => {
    const depot = pairedDepot.get(fm);
    const id = idOf.get(fm)!;
    const corrige = DOMAINES_CORRIGES[id];
    const fixedTo = DOMAIN_FIXES[fm.fmName];
    const target = fixedTo ? nativeByDomain.get(fixedTo) : undefined;
    let measure = measureOf(fm);
    let domain: string | null = fixedTo ?? fm.domain;
    if (corrige) {
      const c = corrige.chiffres;
      domain = corrige.domain;
      measure = {
        km: c?.km ?? null,
        slopes: c?.slopes ?? null,
        lifts: c?.lifts ?? null,
        counts: c ? { ...c.counts } : null,
        bas: c?.bas ?? null,
        haut: c?.haut ?? null,
        measuredOn: c ? corrige.domain : null,
        realigned: true,
      };
      realigned.push(`${fm.fmName} : ${fm.domain ?? "sans domaine"} → ${domain ?? "sans domaine"}`);
    } else if (fixedTo && target) {
      measure = { ...target, realigned: true };
      realigned.push(`${fm.fmName} : ${fm.domain ?? "sans domaine"} → ${fixedTo}`);
    }
    return {
      fm,
      id,
      depotId: depot?.id ?? null,
      kind: fm.kind === "village" ? ("village-station" as const) : ("station" as const),
      domain,
      measure,
    };
  });
  return { entries, duplicates, enDouble, collisions, realigned };
}

const built = buildEntries();

export const CLASSEUR: ClasseurEntry[] = built.entries;

/** Lignes du classeur écartées parce qu'une autre porte déjà leur identifiant. */
export const CLASSEUR_DUPLICATES: string[] = built.duplicates;

/** Lignes du classeur écartées parce qu'elles doublent une station présente
 *  sous un autre nom (`LIGNES_EN_DOUBLE`). */
export const CLASSEUR_EN_DOUBLE: string[] = built.enDouble;

/** Lignes distinctes dont le nom se réduisait à un identifiant déjà pris, et
 *  qui ont reçu leur numéro de classeur en suffixe. */
export const CLASSEUR_ID_COLLISIONS: string[] = built.collisions;

/** Stations dont les chiffres de domaine ont suivi la correction de
 *  rattachement (`DOMAIN_FIXES` et `DOMAINES_CORRIGES`). Exporté pour que la
 *  correction se lise, plutôt que d'agir en silence sur six lignes perdues
 *  dans le classeur. */
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
