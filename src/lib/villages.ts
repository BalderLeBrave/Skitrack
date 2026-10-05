/**
 * Le référentiel des stations selon la logique de Skiinfo : **une station,
 * une fiche Skiinfo** — deux exceptions décidées par le propriétaire, Val d'Ese
 * et Haut Asco (`STATIONS_AJOUTEES`). Table validée par le propriétaire le
 * 5 octobre 2026 (`docs/REFERENTIEL-SKIINFO.md`).
 *
 * Skiinfo sert de référence pour construire cette table à la main : aucune
 * page n'est aspirée. Quatre tables, toutes lues par `stations.ts` :
 *
 * - `VILLAGES` — les villages sans fiche propre, rattachés à leur station :
 *   Plagne Centre, Belle Plagne et Aime 2000 sont La Plagne ; Lanslebourg,
 *   Lanslevillard et Termignon sont Val Cenis. Ils ne sont plus des stations :
 *   leur identifiant se résout vers la station (`stationById`), sans migration
 *   de ce qui a été enregistré sous lui. Chacun garde ses coordonnées, qui
 *   servent au rattachement des logements (`rattachement.ts`). Un village qui
 *   a sa propre fiche (Montchavin - La Plagne, Champagny, Peisey-Vallandry,
 *   Saint-Martin-de-Belleville, Brides-les-Bains, Bramans, Aussois,
 *   Sollières-Sardières) reste une station.
 * - `STATIONS_SANS_FICHE` — les lignes du classeur sans fiche Skiinfo ni
 *   station où les rattacher : retirées. Comme une station fermée, leur
 *   identifiant ne résout plus rien.
 * - `FUSIONS` — un doublon : deux identifiants pour une même station.
 * - `ALIAS_SKIINFO` — le slug Skiinfo quand il diffère de notre identifiant.
 *
 * Les coordonnées viennent de trois sources, dites ligne à ligne (`source`) :
 * le relevé à la main du 15 septembre 2026 (`GPS_FIXES` de `classeur.ts`),
 * le toponyme de la BD TOPO de l'IGN (géocodage public `data.geopf.fr`, lu le
 * 5 octobre 2026), ou le repère du classeur quand l'IGN ne nomme pas le lieu.
 * Chacune a été proposée avec sa source et validée avant d'être inscrite.
 */

/** D'où vient une position : le relevé du 15 septembre 2026, le classeur, ou
 *  le toponyme IGN qui la porte. */
export type SourcePosition = "releve" | "classeur" | `ign:${string}`;

export type Village = {
  id: string;
  nom: string;
  /** La station à fiche Skiinfo qui le porte. */
  station: string;
  lat: number;
  lon: number;
  source: SourcePosition;
  /** D'autres noms sous lesquels une annonce le publie (« Val Claret »). */
  alias?: readonly string[];
};

/**
 * Distance au-delà de laquelle un logement n'est rattaché à aucune station par
 * ses coordonnées, en kilomètres.
 *
 * Mesurée au repère le plus proche, station ou village. Douze kilomètres
 * couvrent les plus longs écarts entre un village et le repère de sa station
 * relevés dans la table (Vallorcine, 12,4 km de Chamonix ; Hauteluce-Val Joly,
 * 11,9 km des Contamines), sans aller chercher une station de l'autre côté
 * d'un massif. Au-delà, le logement est « non rattaché », et l'écran le dit
 * avec son motif. Le dépôt n'a pas de contour de domaine (les polygones
 * OpenSkiMap ne sont que dans les tuiles hors dépôt) : le repère le plus
 * proche fait foi.
 */
export const RATTACHEMENT_MAX_KM = 12;

/** Les villages rattachés à leur station, par station. */
export const VILLAGES: readonly Village[] = [
  {
    id: "argentiere",
    nom: "Argentière",
    station: "chamonix",
    lat: 45.984,
    lon: 6.928,
    source: "releve",
  },
  {
    id: "le-tour",
    nom: "Le Tour",
    station: "chamonix",
    lat: 45.9997,
    lon: 6.9473,
    source: "releve",
  },
  {
    id: "vallorcine",
    nom: "Vallorcine",
    station: "chamonix",
    lat: 46.02819,
    lon: 6.92584,
    source: "ign:Vallorcine",
  },
  {
    id: "chamrousse-1650",
    nom: "Chamrousse 1650",
    station: "chamrousse",
    lat: 45.12526,
    lon: 5.87525,
    source: "ign:le Recoin",
    alias: ["Recoin"],
  },
  {
    id: "chamrousse-1750",
    nom: "Chamrousse 1750",
    station: "chamrousse",
    lat: 45.11069,
    lon: 5.87524,
    source: "ign:Roche Béranger",
    alias: ["Roche Béranger"],
  },
  {
    id: "courchevel-le-praz",
    nom: "Courchevel Le Praz",
    station: "courchevel",
    lat: 45.43202,
    lon: 6.62165,
    source: "ign:Courchevel le Praz",
    alias: ["Courchevel 1300"],
  },
  {
    id: "courchevel-moriond-1650",
    nom: "Courchevel Moriond 1650",
    station: "courchevel",
    lat: 45.4165,
    lon: 6.652,
    source: "releve",
    alias: ["Moriond", "Courchevel 1650"],
  },
  {
    id: "courchevel-village-1550",
    nom: "Courchevel Village 1550",
    station: "courchevel",
    lat: 45.42221,
    lon: 6.64143,
    source: "ign:Courchevel Village",
    alias: ["Courchevel 1550"],
  },
  {
    id: "plateau-de-beauregard",
    nom: "Plateau de Beauregard",
    station: "la-clusaz",
    lat: 45.89538,
    lon: 6.41247,
    source: "ign:Beauregard",
  },
  {
    id: "bareges",
    nom: "Barèges",
    station: "la-mongie-bareges",
    lat: 42.89642,
    lon: 0.06284,
    source: "ign:Barèges",
  },
  {
    id: "la-mongie",
    nom: "La Mongie",
    station: "la-mongie-bareges",
    lat: 42.91015,
    lon: 0.17511,
    source: "ign:la Mongie",
  },
  {
    id: "aime-2000",
    nom: "Aime 2000",
    station: "la-plagne",
    lat: 45.5085,
    lon: 6.6725,
    source: "releve",
  },
  {
    id: "belle-plagne",
    nom: "Belle Plagne",
    station: "la-plagne",
    lat: 45.5128,
    lon: 6.706,
    source: "releve",
  },
  {
    id: "la-plagne-montalbert",
    nom: "La Plagne Montalbert",
    station: "la-plagne",
    lat: 45.53415,
    lon: 6.63702,
    source: "ign:Montalbert",
    alias: ["Montalbert"],
  },
  {
    id: "plagne-1800",
    nom: "Plagne 1800",
    station: "la-plagne",
    lat: 45.50872,
    lon: 6.6769,
    source: "ign:Plagne 1800",
  },
  {
    id: "plagne-bellecote",
    nom: "Plagne Bellecôte",
    station: "la-plagne",
    lat: 45.51294,
    lon: 6.69835,
    source: "ign:Plagne Bellecôte",
  },
  {
    id: "plagne-centre",
    nom: "Plagne Centre",
    station: "la-plagne",
    lat: 45.50751,
    lon: 6.67691,
    source: "ign:Police municipale - Plagne Centre",
  },
  {
    id: "plagne-soleil",
    nom: "Plagne Soleil",
    station: "la-plagne",
    lat: 45.50639,
    lon: 6.68525,
    source: "ign:Plagne Soleil",
  },
  {
    id: "plagne-villages",
    nom: "Plagne Villages",
    station: "la-plagne",
    lat: 45.50496,
    lon: 6.68709,
    source: "ign:Plagne Villages",
  },
  {
    id: "le-chinaillon",
    nom: "Le Chinaillon",
    station: "le-grand-bornand",
    lat: 45.9647,
    lon: 6.4509,
    source: "releve",
  },
  {
    id: "le-barioz-alpin",
    nom: "Le Barioz Alpin",
    station: "les-7-laux",
    lat: 45.33141,
    lon: 6.02698,
    source: "ign:Col du Barioz",
    alias: ["Le Barioz", "Col du Barioz"],
  },
  {
    id: "le-pleynet",
    nom: "Le Pleynet",
    station: "les-7-laux",
    lat: 45.27233,
    lon: 6.05559,
    source: "ign:le Pleynet",
  },
  {
    id: "pipay",
    nom: "Pipay",
    station: "les-7-laux",
    lat: 45.26498,
    lon: 6.01548,
    source: "ign:Pipay",
  },
  {
    id: "prapoutel",
    nom: "Prapoutel",
    station: "les-7-laux",
    lat: 45.25464,
    lon: 5.99385,
    source: "ign:Prapoutel",
  },
  {
    id: "arc-1600",
    nom: "Arc 1600",
    station: "les-arcs-bourg-st-maurice",
    lat: 45.5735,
    lon: 6.796,
    source: "releve",
    alias: ["Arcs 1600"],
  },
  {
    id: "arc-1800",
    nom: "Arc 1800",
    station: "les-arcs-bourg-st-maurice",
    lat: 45.5717,
    lon: 6.806,
    source: "releve",
    alias: ["Arcs 1800"],
  },
  {
    id: "arc-1950",
    nom: "Arc 1950",
    station: "les-arcs-bourg-st-maurice",
    lat: 45.5731,
    lon: 6.8285,
    source: "releve",
    alias: ["Arcs 1950"],
  },
  {
    id: "arc-2000",
    nom: "Arc 2000",
    station: "les-arcs-bourg-st-maurice",
    lat: 45.5715,
    lon: 6.8319,
    source: "releve",
    alias: ["Arcs 2000"],
  },
  {
    id: "villaroger",
    nom: "Villaroger",
    station: "les-arcs-bourg-st-maurice",
    lat: 45.59053,
    lon: 6.87512,
    source: "ign:Villaroger",
  },
  {
    id: "hauteluce-val-joly",
    nom: "Hauteluce Val Joly",
    station: "les-contamines-montjoie",
    lat: 45.7593,
    lon: 6.6046,
    source: "releve",
    alias: ["Val Joly"],
  },
  {
    id: "reberty",
    nom: "Reberty",
    station: "les-menuires",
    lat: 45.31455,
    lon: 6.54458,
    source: "ign:Reberty",
  },
  {
    id: "les-orres-1650",
    nom: "Les Orres 1650",
    station: "les-orres",
    lat: 44.49328,
    lon: 6.55666,
    source: "ign:les Orres 1650",
  },
  {
    id: "les-orres-1800",
    nom: "Les Orres 1800",
    station: "les-orres",
    lat: 44.48362,
    lon: 6.55361,
    source: "ign:les Orres 1800",
  },
  {
    id: "bisanne-1500",
    nom: "Bisanne 1500",
    station: "les-saisies",
    lat: 45.7526,
    lon: 6.5243,
    source: "releve",
  },
  {
    id: "meribel-mottaret",
    nom: "Méribel-Mottaret",
    station: "meribel",
    lat: 45.37308,
    lon: 6.57727,
    source: "ign:Méribel-Mottaret",
    alias: ["Mottaret"],
  },
  {
    id: "meribel-village",
    nom: "Méribel Village",
    station: "meribel",
    lat: 45.41593,
    lon: 6.56438,
    source: "ign:Méribel Village",
  },
  {
    id: "les-coches",
    nom: "Les Coches",
    station: "montchavin-les-coches",
    lat: 45.5472,
    lon: 6.743,
    source: "releve",
  },
  {
    id: "pra-loup-1500",
    nom: "Pra Loup 1500",
    station: "praloup",
    lat: 44.35984,
    lon: 6.61236,
    source: "ign:les Molanès",
    alias: ["Molanès"],
  },
  {
    id: "puy-saint-vincent-1600",
    nom: "Puy-Saint-Vincent 1600",
    station: "puy-saint-vincent",
    lat: 44.81919,
    lon: 6.48635,
    source: "ign:Station 1600",
  },
  {
    id: "puy-saint-vincent-1800",
    nom: "Puy-Saint-Vincent 1800",
    station: "puy-saint-vincent",
    lat: 44.81672,
    lon: 6.48108,
    source: "ign:Station 1800",
  },
  {
    id: "le-bettex",
    nom: "Le Bettex",
    station: "saint-gervais-mont-blanc",
    lat: 45.86,
    lon: 6.696,
    source: "releve",
  },
  {
    id: "saint-nicolas-de-veroce",
    nom: "Saint-Nicolas de Véroce",
    station: "saint-gervais-mont-blanc",
    lat: 45.85502,
    lon: 6.72284,
    source: "ign:Saint-Nicolas de Véroce",
    alias: ["Saint-Nicolas-de-Véroce"],
  },
  {
    id: "espiaube",
    nom: "Espiaube",
    station: "saint-lary-soulan",
    lat: 42.82569,
    lon: 0.25866,
    source: "ign:Espiaube",
  },
  {
    id: "saint-lary-pla-d-adet",
    nom: "Saint-Lary Pla d'Adet",
    station: "saint-lary-soulan",
    lat: 42.81339,
    lon: 0.29658,
    source: "ign:le Pla d'Adet",
    alias: ["Pla d'Adet"],
  },
  {
    id: "samoens-1600",
    nom: "Samoëns 1600",
    station: "samoens",
    lat: 46.05502,
    lon: 6.70127,
    source: "ign:Station de Samoëns 1600",
  },
  {
    id: "super-sauze",
    nom: "Super Sauze",
    station: "sauze-supersauze",
    lat: 44.35806,
    lon: 6.68648,
    source: "ign:le Super Sauze",
  },
  {
    id: "serre-chevalier-briancon",
    nom: "Serre Chevalier Briançon",
    station: "serre-chevalier",
    lat: 44.90451,
    lon: 6.63122,
    source: "ign:le Prorel",
    alias: ["Briançon"],
  },
  {
    id: "serre-chevalier-chantemerle",
    nom: "Serre Chevalier Chantemerle",
    station: "serre-chevalier",
    lat: 44.93175,
    lon: 6.58944,
    source: "classeur",
    alias: ["Chantemerle"],
  },
  {
    id: "serre-chevalier-le-monetier",
    nom: "Serre Chevalier Le Monêtier",
    station: "serre-chevalier",
    lat: 44.97526,
    lon: 6.51079,
    source: "ign:Le Monêtier-les-Bains",
    alias: ["Monêtier"],
  },
  {
    id: "haut-giffre",
    nom: "Haut Giffre",
    station: "sixt-fer-a-cheval",
    lat: 46.04148,
    lon: 6.77085,
    source: "ign:Salvagny",
    alias: ["Salvagny"],
  },
  {
    id: "la-joue-du-loup",
    nom: "La Joue du Loup",
    station: "superdevoluy-la-joue-du-loup",
    lat: 44.68999,
    lon: 5.89362,
    source: "ign:la Joue du Loup",
  },
  {
    id: "le-devoluy",
    nom: "Le Devoluy",
    station: "superdevoluy-la-joue-du-loup",
    lat: 44.67834,
    lon: 5.92701,
    source: "ign:Superdévoluy",
    alias: ["Superdévoluy"],
  },
  {
    id: "tignes-le-lac",
    nom: "Tignes Le Lac",
    station: "tignes",
    lat: 45.46834,
    lon: 6.90629,
    source: "ign:Tignes le Lac",
  },
  {
    id: "tignes-les-boisses",
    nom: "Tignes Les Boisses",
    station: "tignes",
    lat: 45.49524,
    lon: 6.92555,
    source: "ign:les Boisses",
    alias: ["Les Boisses"],
  },
  {
    id: "tignes-les-brevieres",
    nom: "Tignes Les Brévières",
    station: "tignes",
    lat: 45.50878,
    lon: 6.92025,
    source: "ign:les Brévières",
    alias: ["Les Brévières"],
  },
  {
    id: "tignes-val-claret",
    nom: "Tignes Val Claret",
    station: "tignes",
    lat: 45.45644,
    lon: 6.89979,
    source: "ign:Val Claret",
    alias: ["Val Claret"],
  },
  {
    id: "lanslebourg",
    nom: "Lanslebourg",
    station: "val-cenis",
    lat: 45.286,
    lon: 6.879,
    source: "releve",
  },
  {
    id: "lanslevillard",
    nom: "Lanslevillard",
    station: "val-cenis",
    lat: 45.29,
    lon: 6.908,
    source: "releve",
  },
  {
    id: "termignon",
    nom: "Termignon",
    station: "val-cenis",
    lat: 45.27934,
    lon: 6.8153,
    source: "ign:Termignon",
  },
  {
    id: "la-foux-d-allos",
    nom: "La Foux d'Allos",
    station: "val-dallos-la-foux-le-seignus",
    lat: 44.29029,
    lon: 6.57021,
    source: "ign:la Foux d'Allos",
  },
  {
    id: "le-seignus",
    nom: "Le Seignus",
    station: "val-dallos-la-foux-le-seignus",
    lat: 44.24185,
    lon: 6.6166,
    source: "ign:le Seignus Bas",
  },
  {
    id: "la-daille",
    nom: "La Daille",
    station: "val-disere",
    lat: 45.4595,
    lon: 6.962,
    source: "releve",
    alias: ["Daille"],
  },
  {
    id: "le-fornet",
    nom: "Le Fornet",
    station: "val-disere",
    lat: 45.4397,
    lon: 7.019,
    source: "releve",
    alias: ["Fornet"],
  },
  {
    id: "les-claux",
    nom: "Les Claux",
    station: "vars",
    lat: 44.57061,
    lon: 6.68299,
    source: "ign:les Claux",
  },
  {
    id: "vars-sainte-marie",
    nom: "Vars Sainte-Marie",
    station: "vars",
    lat: 44.59763,
    lon: 6.69249,
    source: "ign:Sainte-Marie",
  },
];

/**
 * Lignes du classeur sans fiche Skiinfo, et sans station voisine où les
 * rattacher : retirées du référentiel le 5 octobre 2026. Aucune n'a de fiche,
 * ni dans l'index par massif ni dans les listes par département de Skiinfo.
 * Leur identifiant ne résout plus rien (`stationById` rend `undefined`).
 */
export const STATIONS_SANS_FICHE: readonly { id: string; nom: string }[] = [
  { id: "col-de-l-arzelier", nom: "Col de l'Arzelier" },
  { id: "la-motte-d-aveillans", nom: "La Motte-d'Aveillans" },
  { id: "lullin", nom: "Lullin" },
  { id: "megevette", nom: "Mégevette" },
  { id: "orange", nom: "Orange" },
  { id: "montagne-de-lure", nom: "Montagne de Lure" },
  { id: "nevache", nom: "Névache" },
  { id: "le-queyras", nom: "Le Queyras" },
  { id: "le-larmont", nom: "Le Larmont" },
  { id: "chaux-de-gilley", nom: "Chaux de Gilley" },
  { id: "hauteville-lompnes", nom: "Hauteville - Lompnes" },
  { id: "val-de-morteau", nom: "Val de Morteau" },
  { id: "la-bourboule", nom: "La Bourboule" },
  { id: "les-monts-du-pilat", nom: "Les Monts du Pilat" },
  { id: "le-somport-candanchu", nom: "Le Somport / Candanchu" },
  { id: "le-frenz", nom: "Le Frenz" },
  { id: "le-schlumpf", nom: "Le Schlumpf" },
];

/**
 * Deux identifiants pour une même station : l'ancien se résout vers le gardé.
 *
 * - **Le Granier.** La ligne « Le Granier » du classeur n'a aucune mesure
 *   propre : ses 7,2 km, ses 10 remontées et son domaine sont ceux du
 *   Planolet, par vote de proximité, et son repère est à 2,4 km de toute
 *   piste. Elle porte la même commune (Saint-Pierre-d'Entremont) que la
 *   station de la fiche Skiinfo, relevée sur la vraie zone OpenSkiMap
 *   « Le Granier » (8 pistes, 4 remontées). On garde l'identifiant Skiinfo.
 */
export const FUSIONS: Readonly<Record<string, string>> = {
  "le-granier": "le-granier-vallee-des-entremonts",
};

/** Le slug de la fiche Skiinfo quand il diffère de notre identifiant. */
export const ALIAS_SKIINFO: Readonly<Record<string, string>> = {
  "alpe-dhuez": "alpe-d-huez",
};

/**
 * Repères de station revus le 5 octobre 2026, avec l'altitude IGN RGE ALTI au
 * nouveau point. Ils priment le pin du dépôt et `GPS_FIXES`.
 *
 * Les trois pins du dépôt étaient posés dans un village voisin : celui de
 * La Plagne à 270 m de Montchavin, celui des Menuires à 310 m de
 * Saint-Martin-de-Belleville, celui des Saisies près de
 * Notre-Dame-de-Bellecombe. Au plus proche, Plagne Centre allait à Champagny
 * et Reberty à Val Thorens.
 */
export const REPERES_REVUS: Readonly<
  Record<string, { lat: number; lon: number; demM: number; source: SourcePosition }>
> = {
  "la-plagne": {
    lat: 45.50751,
    lon: 6.67691,
    demM: 1965,
    source: "ign:Police municipale - Plagne Centre",
  },
  "les-menuires": { lat: 45.32739, lon: 6.53682, demM: 1781, source: "ign:les Menuires" },
  "les-saisies": { lat: 45.75615, lon: 6.5407, demM: 1617, source: "ign:les Saisies" },
};

/**
 * Stations absentes du dépôt comme du classeur, ajoutées le 5 octobre 2026.
 * Repère au toponyme IGN, altitude IGN RGE ALTI au point.
 *
 * - **Sollières-Sardières** : sa fiche Skiinfo est rangée sous un chemin de
 *   département (`skiinfo.fr/savoie/la-chevrerie/`), absent de l'index par
 *   massif. Domaine nordique du Monolithe, sans remontée : altitudes de la
 *   fiche (1 300 – 1 600 m).
 * - **Val d'Ese** et **Haut Asco** : **sans fiche Skiinfo**, gardées par
 *   décision du propriétaire. Skiinfo n'a qu'une fiche en Corse (Ghisoni) et
 *   ne cite ces deux stations que dans le texte de sa page régionale
 *   (`skiinfo.fr/corse/stations-de-ski`), d'où viennent leurs altitudes :
 *   Val d'Ese de 1 620 à 1 825 m (plus haute remontée) ; Haut Asco à 1 450 m,
 *   sans altitude de sommet publiée (0 : non relevé, pas une mesure).
 *
 * Photos (`photoUrl`) : choisies par le propriétaire le 5 octobre 2026, copiées
 * dans `public/stations/<id>.jpg` (ramenées à 1 200 px de large, métadonnées
 * retirées). L'adresse d'origine donne le crédit (`photoCredits.ts`).
 */
export const STATIONS_AJOUTEES: readonly {
  id: string;
  name: string;
  massif: string;
  dept: string;
  commune: string;
  villageM: number;
  minM: number;
  maxM: number;
  demM: number;
  lat: number;
  lon: number;
  source: SourcePosition;
  /** Fiche Skiinfo, chemin après `skiinfo.fr/` ; `null` : la station n'en a
   *  pas, et la page qui la cite est dite à côté. */
  ficheSkiinfo: string | null;
  /** Adresse d'origine de la photo copiée dans `public/stations/<id>.jpg`, ou
   *  `null` sans photo. */
  photoUrl: string | null;
}[] = [
  {
    id: "sollieres-sardieres",
    name: "Sollières-Sardières",
    massif: "Alpes du Nord",
    dept: "Savoie",
    commune: "Val-Cenis",
    villageM: 1500,
    minM: 1300,
    maxM: 1600,
    demM: 1502,
    lat: 45.24383,
    lon: 6.78029,
    source: "ign:Sardières",
    ficheSkiinfo: "savoie/la-chevrerie",
    photoUrl: null,
  },
  {
    id: "val-d-ese",
    name: "Val d'Ese",
    massif: "Corse",
    dept: "Corse-du-Sud",
    commune: "Bastelica",
    villageM: 1620,
    minM: 1620,
    maxM: 1825,
    demM: 1626,
    lat: 41.99926,
    lon: 9.12343,
    source: "ign:Station du Val d'Ese",
    ficheSkiinfo: null,
    photoUrl: "https://ajaccio.media.tourinsoft.eu/upload/2021--Val-d-Ese-2.jpg",
  },
  {
    id: "haut-asco",
    name: "Haut Asco",
    massif: "Corse",
    dept: "Haute-Corse",
    commune: "Asco",
    villageM: 1450,
    minM: 1450,
    maxM: 0,
    demM: 1423,
    lat: 42.40328,
    lon: 8.92264,
    source: "ign:Station de Ski du Haut Asco",
    ficheSkiinfo: null,
    photoUrl:
      "https://france3-regions.franceinfo.fr/image/RCQKlInPMdG9Fg9bbFCl7he6fqA/1200x675/regions/2020/06/08/5ede5d6ba34d4_asco_00.jpg",
  },
];

/**
 * Départements des stations que le classeur ne décrit pas, ou décrit sans
 * département : posés à la main le 5 octobre 2026, relus contre les listes
 * par département de Skiinfo. Le département est le filtre secondaire du
 * référentiel, après le massif.
 */
export const DEPARTEMENTS: Readonly<Record<string, string>> = {
  "mont-aigoual": "Gard",
  camurac: "Aude",
  bramans: "Savoie",
  "col-de-porte": "Isère",
  "correncon-en-vercors": "Isère",
  doucy: "Savoie",
  "la-sambuy": "Haute-Savoie",
  "le-desert-dentremonts": "Savoie",
  "le-granier-vallee-des-entremonts": "Savoie",
  "le-sappey-en-chartreuse": "Isère",
  "les-coulmes": "Isère",
  "praz-de-lys-sommand": "Haute-Savoie",
  "saint-jean-de-sixt": "Haute-Savoie",
  abries: "Hautes-Alpes",
  aiguilles: "Hautes-Alpes",
  "beuil-les-launes": "Alpes-Maritimes",
  larche: "Alpes-de-Haute-Provence",
  "le-chazelet": "Hautes-Alpes",
  "saint-veran": "Hautes-Alpes",
  "sainte-anne-la-condamine": "Alpes-de-Haute-Provence",
  "turini-camp-dargent": "Alpes-Maritimes",
  "val-pelens": "Alpes-Maritimes",
  ghisoni: "Haute-Corse",
  "source-du-doubs-mouthe": "Doubs",
  menthieres: "Ain",
  brameloup: "Aveyron",
  chalmazel: "Loire",
  "campan-payolle": "Hautes-Pyrénées",
  cauterets: "Hautes-Pyrénées",
  "etang-de-lers": "Ariège",
  "la-pierre-st-martin": "Pyrénées-Atlantiques",
  nistos: "Hautes-Pyrénées",
  puigmal: "Pyrénées-Orientales",
  "bussang-larcenaire": "Vosges",
  "le-gaschney": "Haut-Rhin",
  "le-grand-valtin": "Vosges",
};

const PAR_ID = new Map(VILLAGES.map((v) => [v.id, v]));

/** Le village de cet identifiant, s'il en est un. */
export function villageById(id: string): Village | undefined {
  return PAR_ID.get(id);
}

/** Les villages d'une station. */
export function villagesDe(stationId: string): Village[] {
  return VILLAGES.filter((v) => v.station === stationId);
}

/** Les identifiants retirés du référentiel le 5 octobre 2026. */
export const IDS_SANS_FICHE: ReadonlySet<string> = new Set(STATIONS_SANS_FICHE.map((s) => s.id));

/** Tout identifiant qui n'est plus celui d'une station : village, doublon fusionné, alias. */
export const IDS_NON_STATION: ReadonlySet<string> = new Set([
  ...PAR_ID.keys(),
  ...Object.keys(FUSIONS),
  ...Object.keys(ALIAS_SKIINFO),
]);

/** La station qui porte cet identifiant de village, de doublon ou d'alias, ou rien. */
export function stationDuLieu(id: string): string | undefined {
  return PAR_ID.get(id)?.station ?? FUSIONS[id] ?? ALIAS_SKIINFO[id];
}
