/**
 * La liste des stations de ski françaises, telle que France Montagnes la publie.
 *
 * ## Pourquoi cette liste fait autorité ici
 *
 * France Montagnes est l'association des acteurs de la montagne française —
 * domaines skiables, offices de tourisme, écoles de ski. Sa liste répond à la
 * seule question que le référentiel ne sait pas trancher : **qu'est-ce qu'une
 * station de ski française ?** Le fichier `referentiel.json` mélange stations,
 * domaines et secteurs ; la base OpenSkiMap indexe des domaines cartographiés,
 * y compris des téléskis de village et des sites nordiques. Ni l'un ni l'autre
 * ne dit où s'arrête le catalogue.
 *
 * Elle en est donc le **filtre** : l'application ne présente que les stations
 * qui y figurent. Une entrée du référentiel qui n'y est pas — Gap,
 * Barcelonnette, le Plateau des Glières, l'Espace Nordique du Capcir — est une
 * ville ou un site nordique, pas une station de ski alpin.
 *
 * ## Ce que cette liste n'est pas
 *
 * Ce ne sont **que des noms**. Aucune altitude, aucun kilométrage, aucune
 * coordonnée n'en vient : ces valeurs restent celles du référentiel ou du
 * moteur local. Une station listée ici mais absente des deux sources de données
 * n'apparaît pas dans l'application — elle manque, et l'audit le dit
 * (`npm run refs:audit`) plutôt que de la faire exister sans rien savoir d'elle.
 *
 * Les noms sont recopiés **tels que le site les affiche**, capitales et
 * graphies comprises — « LES ARCS BOURG ST MAURICE », « Gourrette » (sic).
 * C'est cette forme-là qu'on compare ; rien n'est jamais affiché depuis ici.
 *
 * Source  : https://www.france-montagnes.com/les-stations-de-ski/ (pages 1 à 20)
 * Relevé  : 18 août 2026 — 233 entrées, 232 stations distinctes
 *           (« CHAMONIX-MONT-BLANC » et « Chamonix Mont-Blanc » sont la même).
 */

/** Mots vides du français : ils ne distinguent aucune station. */
const ARTICLES = new Set(['le', 'la', 'les', 'l', 'du', 'de', 'des', 'd', 'au', 'aux', 'en', 'sur', 'et'])

/** Nombres en lettres : « Les Deux Alpes » et « LES 2 ALPES » sont une station. */
const NUMBERS: Record<string, string> = {
  un: '1', une: '1', deux: '2', trois: '3', quatre: '4', cinq: '5',
  six: '6', sept: '7', huit: '8', neuf: '9', dix: '10'
}

/** Mots significatifs d'un nom de lieu, comparables d'une source à l'autre. */
export function placeTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 0 && !ARTICLES.has(word))
    .map((word) => (word === 'st' ? 'saint' : word))
    .map((word) => NUMBERS[word] ?? word)
}

/**
 * Deux noms désignent-ils la même station ?
 *
 * Les sources n'écrivent pas pareil : France Montagnes met en capitales et
 * accole la vallée (« LES ARCS BOURG ST MAURICE »), le référentiel abrège
 * (« Les Arcs – Peisey-Vallandry »). La règle : **chaque mot du nom le plus
 * court doit amorcer un mot de l'autre**. « sixt » rejoint « sixtferacheval »,
 * « avoriaz » rejoint « avoriaz 1800 ».
 *
 * Deux gardes, que les faux rapprochements ont imposés : une amorce partielle
 * exige quatre lettres — « or » de Mont d'Or amorçait « Orange », « roc » de
 * Rochejean amorçait « Roc d'Enfer » — mais l'égalité vaut toujours, sans quoi
 * « val » ne rejoindrait plus « val ».
 */
export function samePlace(a: string, b: string): boolean {
  const ta = placeTokens(a)
  const tb = placeTokens(b)
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  if (short.length === 0) return false
  if (short.length === 1 && short[0].length < 4) return false
  const starts = (x: string, y: string): boolean => x === y || (x.startsWith(y) && y.length >= 4)
  return short.every((word) => long.some((other) => starts(other, word) || starts(word, other)))
}

/** Les 232 stations, telles que France Montagnes les écrit. */
export const FRANCE_MONTAGNES: readonly string[] = [
  "LE COLLET",
  "VALLOIRE",
  "LES ANGLES",
  "LANS EN VERCORS",
  "LA CLUSAZ",
  "LES SAISIES",
  "LA TOUSSUIRE",
  "LA PLAGNE MONTALBERT",
  "AUSSOIS",
  "LES 2 ALPES",
  "GERARDMER",
  "COMBLOUX",
  "SERRE-EYRAUD",
  "LA NORMA",
  "VAL D'ISERE",
  "ALPE D'HUEZ",
  "BRIDES LES BAINS",
  "OZ 3300",
  "PEISEY-VALLANDRY",
  "BERNEX",
  "LE COL DE MARCIEU - CHARTREUSE",
  "NOTRE DAME DE BELLECOMBE",
  "VALFREJUS",
  "VILLARD DE LANS - CORRENCON",
  "LE CORBIER",
  "VALBERG",
  "SAINT-LEGER-LES-MELEZES",
  "LE LAC BLANC",
  "BONNEVAL SUR ARC",
  "VALMEINIER",
  "CHAMPAGNY EN VANOISE",
  "SAINT LARY SOULAN",
  "SAINT COLOMBAN DES VILLARDS",
  "MONTCHAVIN LA PLAGNE",
  "AURON",
  "LA COLMIANE",
  "ARECHES BEAUFORT",
  "VARS",
  "AX 3 DOMAINES",
  "VAL CENIS",
  "VENTRON",
  "SAINT SORLIN D'ARVES",
  "GREOLIERES LES NEIGES",
  "MONTCLAR",
  "PRALOGNAN LA VANOISE",
  "VALMOREL",
  "PUY SAINT VINCENT",
  "LA PLAGNE",
  "LE MONT DORE",
  "MERIBEL",
  "CREST-VOLAND COHENNOZ",
  "LES KARELLIS",
  "MONTS JURA",
  "SAINTE FOY TARENTAISE",
  "CHAMP DU FEU",
  "LES 7 LAUX",
  "CHABANON",
  "FONT-ROMEU",
  "TIGNES",
  "MONTGENEVRE",
  "SAINT FRANCOIS LONGCHAMP",
  "SERRE CHEVALIER BRIANCON",
  "ISOLA 2000",
  "PEYRAGUDES",
  "THOLLON LES MEMISES",
  "BOLQUERE PYRENEES 2000",
  "LES CONTAMINES MONTJOIE",
  "VAL THORENS",
  "SAINT MAURICE SUR MOSELLE",
  "LES HOUCHES",
  "LES ARCS BOURG ST MAURICE",
  "LES ORRES",
  "LA GIETTAZ",
  "FLUMET - SAINT NICOLAS LA CHAPELLE",
  "COURCHEVEL",
  "CHAMONIX-MONT-BLANC",
  "LA BRESSE HOHNECK",
  "VAUJANY",
  "RISOUL",
  "VAL D'ALLOS",
  "ALBIEZ MONTROND",
  "BESSE SUPER BESSE",
  "LE DEVOLUY",
  "SAINT MARTIN DE BELLEVILLE",
  "ORCIERES MERLETTE",
  "ALPE DU GRAND-SERRE",
  "LES MENUIRES",
  "LA ROSIERE",
  "GRAND TOURMALET",
  "CHAMROUSSE",
  "LE GRAND-BORNAND",
  "Le Cambre d'Aze",
  "Montagne de Lure",
  "Orelle",
  "Puyvalador Rieutort",
  "la Planche des Belles Filles",
  "Le Chioula",
  "Les Brasses",
  "Aillons-Margeriaz",
  "Val d'Azun",
  "Saint-Gervais Mont-Blanc",
  "Chastreix-Sancy",
  "Ascou-Pailheres",
  "Montriond",
  "Bessans",
  "Le Somport / Candanchu",
  "Gresse en Vercors",
  "Les Gets",
  "Espace Aubrac",
  "Col d'Ornon",
  "Argentière",
  "Bellefontaine",
  "Puigmal",
  "Crévoux",
  "Prat Peyrot / Mont Aigoual",
  "Formiguères",
  "Autrans Méaudres en Vercors",
  "Chalmazel",
  "Montmin",
  "Val de Morteau",
  "Samoens",
  "Morzine",
  "Nancy sur Cluses",
  "Ceillac en Queyras",
  "Le Lioran",
  "Les Estables",
  "Le Granier",
  "Passy Plaine Joux",
  "Hauteville - Lompnes",
  "Guzet",
  "Hirmentaz",
  "La Bresse Brabant",
  "Saint-Pancrace les Bottières",
  "Hauteluce Val Joly",
  "Molines Saint-Véran en Queyras",
  "Villard-Reculas",
  "Seyne les Alpes",
  "Val Louron",
  "Megevette",
  "Audibergue",
  "Le Grand Puy",
  "Les Monts d'Olmes",
  "Col du Rousset",
  "Valdrôme",
  "Saint-Pierre de Chartreuse",
  "Le Barioz Alpin",
  "Saint Hugues - Les Egaux",
  "La Motte d'Aveillans",
  "Auris en Oisans",
  "Roubion les Buisses",
  "Névache",
  "Plateau de Beauregard",
  "Avoriaz 1800",
  "Xonrupt Longemer",
  "Mijanes - Donezan",
  "Orange",
  "Manigod/Col de Merdassier",
  "Artouste",
  "Espace Roc d'Enfer",
  "Le Frenz",
  "Lullin",
  "Les Monts du Pilat",
  "La Sambuy Pays de Faverges",
  "Superbagnères",
  "La Bourboule",
  "Habère Poche",
  "Arvieux",
  "Les Rousses",
  "Abriès Aiguilles & Ristolas",
  "Le Planolet",
  "Les Carroz d'Araches",
  "Croix de Bauzon",
  "Lus la Croix Haute",
  "Goulier Neige",
  "Camurac",
  "Piau Engaly",
  "Praloup",
  "Soleilhas - Vauplane",
  "Abondance",
  "Morillon",
  "Mont-Saxonnex",
  "Le Ballon d'Alsace",
  "Le Bleymard Mont Lozère",
  "La Loge des Gardes",
  "Le Schlumpf",
  "Lispach - La Bresse",
  "La Schlucht",
  "La Combe Saint-Pierre",
  "Vallorcine",
  "Schnepfenried",
  "Le Reposoir",
  "Métabief",
  "Col de l'Arzelier",
  "Villaroger",
  "Saint-Nicolas de Véroce",
  "Laguiole",
  "Plateau de Beille",
  "Laye en Champsaur",
  "Fond d'Urle",
  "Saint-Hilaire du touvet",
  "Sauze Supersauze",
  "Le Larmont",
  "Les Fourgs",
  "Megève",
  "Praz sur Arly",
  "Saint-Jean d'Arves",
  "Gavarnie - Gèdre",
  "La Grave",
  "Sixt",
  "Haut Giffre",
  "Pelvoux Vallouise",
  "Le Semnoz",
  "Le Queyras",
  "Gourrette",
  "Le Mourtis",
  "Saint Michel de Chaillol",
  "Chapelle d'Abondance",
  "Le Markstein",
  "Porte Puymorens",
  "Flaine",
  "Plateau de Retord",
  "Ancelle Village Station",
  "Saint-Anthème - Praboure",
  "Réallon",
  "Savoie Grand Revard",
  "Mont Serein / Ventoux Sud",
  "Chaux de Gilley",
  "Châtel",
  "Luz Ardiden",
  "Cordon",
  "Hautacam",
  "Le Tanet"
]

/** Le nom France Montagnes de cette station, ou `null` si elle n'y figure pas. */
export function franceMontagnesName(name: string): string | null {
  return FRANCE_MONTAGNES.find((official) => samePlace(official, name)) ?? null
}

/** Cette station figure-t-elle au catalogue de France Montagnes ? */
export function isFranceMontagnes(name: string): boolean {
  return franceMontagnesName(name) !== null
}
