/**
 * Les pays qui portent des stations, et ce qu'il faut savoir d'eux pour les
 * afficher : leur continent, leur devise, leur fuseau, leur cadrage, et le mot
 * par lequel ils nomment leur découpage régional.
 *
 * ## D'où vient chaque valeur
 *
 * | Champ | Source | Contrôle |
 * | --- | --- | --- |
 * | `code` | ISO 3166-1 alpha-2 | `Intl.DisplayNames` rend un nom pour le code |
 * | `nomFr`, `nomEn` | CLDR, par `Intl.DisplayNames` | `geo.test.ts` compare à ICU |
 * | `devise` | ISO 4217 | `geo.test.ts` compare à `Intl.supportedValuesOf` |
 * | `fuseau` | base IANA | `geo.test.ts` le fait accepter par `Intl.DateTimeFormat` |
 * | `cadre` | Natural Earth 1:50m, `ne_50m_admin_0_countries`, lu le 18 septembre 2026 | calculé, jamais écrit à la main |
 * | `decoupageFr`, `decoupageEn` | le nom que le pays donne à sa subdivision de premier niveau | relu à la main |
 *
 * Les 27 pays ajoutés le 19 septembre 2026 sortent des mêmes sources, lues
 * cette fois plutôt que sues : la liste ISO 4217 publiée par SIX Group
 * (`list-one.xml`, édition du 17 septembre 2026) pour les devises, la table
 * `zone.tab` du dépôt IANA pour les fuseaux, et le même fichier Natural Earth
 * pour les cadrages. La méthode de cadrage a d'abord été vérifiée en la
 * recalculant sur les 44 pays déjà écrits : **43 ressortent identiques**, le
 * seul écart étant l'Australie, dont le cadrage écrit exclut l'île Christmas
 * que la règle des huit degrés fait entrer. Aucune valeur des 44 n'a été
 * touchée.
 *
 * **Le fuseau d'un pays à plusieurs zones est celui de sa capitale**, et c'est
 * la règle que suivent les douze pays multi-zones déjà écrits — Sydney pour
 * Canberra, Toronto pour Ottawa, Shanghai pour Pékin. Sept des nouveaux sont
 * dans ce cas. La règle « le fuseau le plus proche des stations » a été
 * essayée et écartée : les points de référence de `zone.tab` sont des villes
 * quelconques, et elle donnait `Europe/Busingen` pour l'Allemagne.
 *
 * Les noms sont recopiés de CLDR plutôt que traduits : le test échoue si l'un
 * d'eux s'en écarte, ce qui évite qu'une graphie personnelle s'installe.
 *
 * ## Ce que le cadrage vaut, et ne vaut pas
 *
 * Il est calculé sur l'emprise du pays, bloc principal et blocs qui le
 * jouxtent à moins de huit degrés : la Corse entre avec la France, Hokkaido
 * avec Honshu, la Guyane reste dehors.
 *
 * **C'est une vue de départ, pas la bonne vue.** L'emprise d'un pays n'est pas
 * celle de ses pistes : cadrer l'Australie sur ses frontières montre Perth
 * pour atteindre trois stations de Nouvelle-Galles du Sud, et l'Espagne se
 * trouve tirée aux Canaries. La phase 2 calcule le cadrage des stations de
 * chaque pays et le range dans `monde/data/index.json` ; la carte le préférera
 * à celui-ci. Les pays les plus mal servis par cette approximation, et donc
 * ceux à vérifier en premier ensuite, sont l'Australie, l'Espagne, la Russie,
 * le Canada, les États-Unis et le Chili.
 *
 * ## Portée de la liste : le périmètre, et rien d'autre
 *
 * La règle est « les pays du périmètre du référentiel », et ce périmètre est
 * l'**Europe** depuis le 21 septembre 2026, sur décision du propriétaire. Il
 * est écrit une fois, dans `PERIMETRE` de `scripts/build-monde.py`, et
 * `monde.test.ts` vérifie que cette liste-ci ne s'en écarte pas : un pays
 * décrit ici sans domaine fait échouer la suite, et réciproquement.
 *
 * Trente-deux pays en sont sortis avec le périmètre — de l'Argentine au Japon,
 * des États-Unis à la Nouvelle-Zélande. Leurs devises, fuseaux et cadrages
 * étaient sourcés comme les autres ; ils sont dans l'historique, et
 * reviendront avec le périmètre s'il s'élargit. La **Russie**, elle, est
 * sortie pour elle-même, et figure dans `PAYS_ECARTES`.
 *
 * Ce qui a disparu avec eux : les quatre rattachements transcontinentaux que
 * cette liste arbitrait — Turquie, Géorgie et Kazakhstan en Asie, Russie en
 * Europe. Le choix se lisait à l'emplacement des stations plutôt qu'à la
 * convention politique. Il n'a plus d'objet tant que le périmètre est
 * l'Europe ; `geo.test.ts` en garde la trace.
 *
 * **Un pays du référentiel reste sans fiche**, et c'est une absence sourcée :
 * le **Kosovo**, que ni la liste ISO 4217 ni `zone.tab` ne connaissent, `XK`
 * étant un code d'usage et non un code ISO 3166-1. Il est bien en Europe — 42°
 * nord, 21° est — et le périmètre le porte ; ce qui lui manque est une devise
 * et un fuseau, pas un continent. `paysSansFiche()` rend exactement celui-là.
 *
 * La France y figure comme les autres, bien que son référentiel reste celui du
 * classeur France Montagnes : les écrans ont besoin de sa devise, de son
 * fuseau et de son continent comme de ceux de l'Autriche.
 */

import type { Cadre, ContinentId } from "./continents.ts";

export type Pays = {
  /** ISO 3166-1 alpha-2, en majuscules. */
  code: string;
  nomFr: string;
  nomEn: string;
  continent: ContinentId;
  /** ISO 4217, en majuscules. Jamais convertie : c'est la devise d'affichage. */
  devise: string;
  /** Le fuseau de référence du pays, au sens de la base IANA. */
  fuseau: string;
  /**
   * Le pays s'étend-il sur plusieurs fuseaux ?
   *
   * Quand c'est vrai, `fuseau` ne suffit pas pour une prévision : une station
   * du Colorado et une du Vermont ne partagent pas l'heure de leur bulletin.
   * La phase 6 résoudra le fuseau au point de la station plutôt que de prendre
   * celui-ci. Le champ existe pour que ce cas ne s'oublie pas en silence.
   */
  plusieursFuseaux: boolean;
  cadre: Cadre;
  /** Le mot du pays pour sa subdivision de premier niveau, au singulier. */
  decoupageFr: string;
  decoupageEn: string;
};

/**
 * Quatre pays sont à cheval sur deux continents. La consigne tranche par
 * l'emplacement des stations, pas par la convention politique, et le résultat
 * n'est pas toujours celui qu'on attend.
 *
 * - **Turquie : Asie.** Uludağ, Kartalkaya, Palandöken, Erciyes, toutes les
 *   stations turques sont en Anatolie, donc du côté asiatique des détroits.
 *   Aucune n'est en Thrace.
 * - **Géorgie : Asie.** Gudauri et Bakuriani sont au sud de la ligne de crête
 *   du Grand Caucase, qui est la limite conventionnelle entre les deux
 *   continents.
 * - **Russie : écartée du référentiel** le 21 septembre 2026, sur décision du
 *   propriétaire. Elle figurait ici en Europe — Krasnaïa Poliana est au nord
 *   de la crête du Caucase, comme l'Oural et la péninsule de Kola, et seule
 *   Cheregech est en Sibérie. Le choix de continent n'a plus d'objet : la
 *   règle de cette liste est « les pays ayant au moins une station retenue »,
 *   et la Russie n'en a plus aucune. `scripts/build-monde.py` porte
 *   l'exclusion dans `PAYS_ECARTES`, et l'index en publie le compte — 244
 *   domaines — pour qu'elle se voie au lieu de se deviner.
 * - **Kazakhstan : Asie.** Chymboulak domine Almaty, à l'est de l'Oural et de
 *   la Caspienne. Aucune ambiguïté.
 */
export const PAYS: readonly Pays[] = [
  /* ---------- Europe ---------- */
  // La Bulgarie est passée à l'euro le 1er janvier 2026, le lev cessant d'avoir
  // cours le 1er février. Écrire « BGN » de mémoire aurait été faux.
  // La France nomme ses zones de montagne par massif, pas par région
  // administrative : c'est le découpage que le référentiel porte depuis
  // l'origine, et celui des bulletins d'avalanche.
  //
  // `plusieursFuseaux` décrit le territoire, Réunion et Antilles comprises, et
  // non les stations : les 320 du référentiel sont toutes en Europe/Paris,
  // Corse incluse. La prévision française passe de toute façon par AROME, que
  // `country === "FR"` suffit à choisir.
  /* ---------- Amérique du Nord ---------- */
  /* ---------- Amérique du Sud ---------- */
  /* ---------- Asie ---------- */
  /* ---------- Océanie ---------- */

  /* ---------- Afrique ---------- */
  { code: "AD", nomFr: "Andorre", nomEn: "Andorra", continent: "europe", devise: "EUR", fuseau: "Europe/Andorra", plusieursFuseaux: false, cadre: [1.41, 42.43, 1.74, 42.64], decoupageFr: "paroisse", decoupageEn: "parish" },
  { code: "AL", nomFr: "Albanie", nomEn: "Albania", continent: "europe", devise: "ALL", fuseau: "Europe/Tirane", plusieursFuseaux: false, cadre: [19.28, 39.65, 21.03, 42.65], decoupageFr: "préfecture", decoupageEn: "county" },
  { code: "AM", nomFr: "Arménie", nomEn: "Armenia", continent: "asie", devise: "AMD", fuseau: "Asia/Yerevan", plusieursFuseaux: false, cadre: [43.44, 38.87, 46.58, 41.29], decoupageFr: "région", decoupageEn: "province" },
  { code: "AT", nomFr: "Autriche", nomEn: "Austria", continent: "europe", devise: "EUR", fuseau: "Europe/Vienna", plusieursFuseaux: false, cadre: [9.52, 46.4, 17.15, 49], decoupageFr: "Land", decoupageEn: "state" },
  { code: "AZ", nomFr: "Azerbaïdjan", nomEn: "Azerbaijan", continent: "asie", devise: "AZN", fuseau: "Asia/Baku", plusieursFuseaux: false, cadre: [44.77, 38.4, 50.37, 41.89], decoupageFr: "rayon", decoupageEn: "district" },
  { code: "BA", nomFr: "Bosnie-Herzégovine", nomEn: "Bosnia & Herzegovina", continent: "europe", devise: "BAM", fuseau: "Europe/Sarajevo", plusieursFuseaux: false, cadre: [15.74, 42.56, 19.58, 45.28], decoupageFr: "canton", decoupageEn: "canton" },
  { code: "BE", nomFr: "Belgique", nomEn: "Belgium", continent: "europe", devise: "EUR", fuseau: "Europe/Brussels", plusieursFuseaux: false, cadre: [2.52, 49.51, 6.36, 51.49], decoupageFr: "province", decoupageEn: "province" },
  { code: "BG", nomFr: "Bulgarie", nomEn: "Bulgaria", continent: "europe", devise: "EUR", fuseau: "Europe/Sofia", plusieursFuseaux: false, cadre: [22.34, 41.24, 28.59, 44.24], decoupageFr: "oblast", decoupageEn: "province" },
  { code: "BY", nomFr: "Biélorussie", nomEn: "Belarus", continent: "europe", devise: "BYN", fuseau: "Europe/Minsk", plusieursFuseaux: false, cadre: [23.18, 51.27, 32.71, 56.15], decoupageFr: "voblast", decoupageEn: "region" },
  { code: "CH", nomFr: "Suisse", nomEn: "Switzerland", continent: "europe", devise: "CHF", fuseau: "Europe/Zurich", plusieursFuseaux: false, cadre: [5.97, 45.83, 10.45, 47.78], decoupageFr: "canton", decoupageEn: "canton" },
  { code: "CY", nomFr: "Chypre", nomEn: "Cyprus", continent: "europe", devise: "EUR", fuseau: "Asia/Nicosia", plusieursFuseaux: false, cadre: [32.3, 34.57, 34.05, 35.18], decoupageFr: "district", decoupageEn: "district" },
  { code: "CZ", nomFr: "Tchéquie", nomEn: "Czechia", continent: "europe", devise: "CZK", fuseau: "Europe/Prague", plusieursFuseaux: false, cadre: [12.09, 48.58, 18.83, 51.04], decoupageFr: "région", decoupageEn: "region" },
  { code: "DE", nomFr: "Allemagne", nomEn: "Germany", continent: "europe", devise: "EUR", fuseau: "Europe/Berlin", plusieursFuseaux: false, cadre: [5.86, 47.28, 15.02, 55.06], decoupageFr: "Land", decoupageEn: "state" },
  { code: "DK", nomFr: "Danemark", nomEn: "Denmark", continent: "europe", devise: "DKK", fuseau: "Europe/Copenhagen", plusieursFuseaux: false, cadre: [8.12, 54.63, 15.14, 57.74], decoupageFr: "région", decoupageEn: "region" },
  { code: "EE", nomFr: "Estonie", nomEn: "Estonia", continent: "europe", devise: "EUR", fuseau: "Europe/Tallinn", plusieursFuseaux: false, cadre: [21.85, 57.53, 28.15, 59.64], decoupageFr: "comté", decoupageEn: "county" },
  { code: "ES", nomFr: "Espagne", nomEn: "Spain", continent: "europe", devise: "EUR", fuseau: "Europe/Madrid", plusieursFuseaux: true, cadre: [-17.32, 27.75, 4.32, 43.76], decoupageFr: "communauté autonome", decoupageEn: "autonomous community" },
  { code: "FI", nomFr: "Finlande", nomEn: "Finland", continent: "europe", devise: "EUR", fuseau: "Europe/Helsinki", plusieursFuseaux: false, cadre: [20.62, 59.82, 31.54, 70.06], decoupageFr: "région", decoupageEn: "region" },
  { code: "FR", nomFr: "France", nomEn: "France", continent: "europe", devise: "EUR", fuseau: "Europe/Paris", plusieursFuseaux: true, cadre: [-4.76, 41.38, 9.56, 51.1], decoupageFr: "massif", decoupageEn: "range" },
  { code: "GB", nomFr: "Royaume-Uni", nomEn: "United Kingdom", continent: "europe", devise: "GBP", fuseau: "Europe/London", plusieursFuseaux: false, cadre: [-8.14, 50.02, 1.75, 60.83], decoupageFr: "nation", decoupageEn: "nation" },
  { code: "GE", nomFr: "Géorgie", nomEn: "Georgia", continent: "asie", devise: "GEL", fuseau: "Asia/Tbilisi", plusieursFuseaux: false, cadre: [39.98, 41.07, 46.67, 43.57], decoupageFr: "région", decoupageEn: "region" },
  { code: "GR", nomFr: "Grèce", nomEn: "Greece", continent: "europe", devise: "EUR", fuseau: "Europe/Athens", plusieursFuseaux: false, cadre: [19.65, 34.93, 28.23, 41.74], decoupageFr: "périphérie", decoupageEn: "region" },
  { code: "HR", nomFr: "Croatie", nomEn: "Croatia", continent: "europe", devise: "EUR", fuseau: "Europe/Zagreb", plusieursFuseaux: false, cadre: [13.52, 42.43, 19.4, 46.53], decoupageFr: "comitat", decoupageEn: "county" },
  { code: "HU", nomFr: "Hongrie", nomEn: "Hungary", continent: "europe", devise: "HUF", fuseau: "Europe/Budapest", plusieursFuseaux: false, cadre: [16.09, 45.75, 22.88, 48.55], decoupageFr: "comitat", decoupageEn: "county" },
  { code: "IE", nomFr: "Irlande", nomEn: "Ireland", continent: "europe", devise: "EUR", fuseau: "Europe/Dublin", plusieursFuseaux: false, cadre: [-10.39, 51.47, -6.03, 55.37], decoupageFr: "comté", decoupageEn: "county" },
  { code: "IS", nomFr: "Islande", nomEn: "Iceland", continent: "europe", devise: "ISK", fuseau: "Atlantic/Reykjavik", plusieursFuseaux: false, cadre: [-24.48, 63.41, -13.56, 66.53], decoupageFr: "région", decoupageEn: "region" },
  { code: "IT", nomFr: "Italie", nomEn: "Italy", continent: "europe", devise: "EUR", fuseau: "Europe/Rome", plusieursFuseaux: false, cadre: [6.63, 36.69, 18.49, 47.08], decoupageFr: "région", decoupageEn: "region" },
  { code: "KZ", nomFr: "Kazakhstan", nomEn: "Kazakhstan", continent: "asie", devise: "KZT", fuseau: "Asia/Almaty", plusieursFuseaux: true, cadre: [46.61, 40.61, 87.32, 55.39], decoupageFr: "région", decoupageEn: "region" },
  { code: "LI", nomFr: "Liechtenstein", nomEn: "Liechtenstein", continent: "europe", devise: "CHF", fuseau: "Europe/Vaduz", plusieursFuseaux: false, cadre: [9.48, 47.06, 9.61, 47.27], decoupageFr: "commune", decoupageEn: "municipality" },
  { code: "LT", nomFr: "Lituanie", nomEn: "Lithuania", continent: "europe", devise: "EUR", fuseau: "Europe/Vilnius", plusieursFuseaux: false, cadre: [20.9, 53.89, 26.78, 56.41], decoupageFr: "apskritis", decoupageEn: "county" },
  { code: "LU", nomFr: "Luxembourg", nomEn: "Luxembourg", continent: "europe", devise: "EUR", fuseau: "Europe/Luxembourg", plusieursFuseaux: false, cadre: [5.72, 49.45, 6.49, 50.17], decoupageFr: "canton", decoupageEn: "canton" },
  { code: "LV", nomFr: "Lettonie", nomEn: "Latvia", continent: "europe", devise: "EUR", fuseau: "Europe/Riga", plusieursFuseaux: false, cadre: [21.01, 55.67, 28.2, 58.06], decoupageFr: "municipalité", decoupageEn: "municipality" },
  { code: "MC", nomFr: "Monaco", nomEn: "Monaco", continent: "europe", devise: "EUR", fuseau: "Europe/Monaco", plusieursFuseaux: false, cadre: [7.38, 43.73, 7.44, 43.77], decoupageFr: "quartier", decoupageEn: "ward" },
  { code: "MD", nomFr: "Moldavie", nomEn: "Moldova", continent: "europe", devise: "MDL", fuseau: "Europe/Chisinau", plusieursFuseaux: false, cadre: [26.62, 45.45, 30.13, 48.48], decoupageFr: "raion", decoupageEn: "district" },
  { code: "ME", nomFr: "Monténégro", nomEn: "Montenegro", continent: "europe", devise: "EUR", fuseau: "Europe/Podgorica", plusieursFuseaux: false, cadre: [18.44, 41.87, 20.35, 43.54], decoupageFr: "commune", decoupageEn: "municipality" },
  { code: "MK", nomFr: "Macédoine du Nord", nomEn: "North Macedonia", continent: "europe", devise: "MKD", fuseau: "Europe/Skopje", plusieursFuseaux: false, cadre: [20.45, 40.85, 23.01, 42.36], decoupageFr: "région", decoupageEn: "region" },
  { code: "MT", nomFr: "Malte", nomEn: "Malta", continent: "europe", devise: "EUR", fuseau: "Europe/Malta", plusieursFuseaux: false, cadre: [14.18, 35.82, 14.57, 36.08], decoupageFr: "région", decoupageEn: "region" },
  { code: "NL", nomFr: "Pays-Bas", nomEn: "Netherlands", continent: "europe", devise: "EUR", fuseau: "Europe/Amsterdam", plusieursFuseaux: false, cadre: [3.35, 50.75, 7.2, 53.63], decoupageFr: "province", decoupageEn: "province" },
  { code: "NO", nomFr: "Norvège", nomEn: "Norway", continent: "europe", devise: "NOK", fuseau: "Europe/Oslo", plusieursFuseaux: false, cadre: [4.8, 58.02, 30.96, 80.05], decoupageFr: "comté", decoupageEn: "county" },
  { code: "PL", nomFr: "Pologne", nomEn: "Poland", continent: "europe", devise: "PLN", fuseau: "Europe/Warsaw", plusieursFuseaux: false, cadre: [14.13, 49.02, 24.11, 54.84], decoupageFr: "voïvodie", decoupageEn: "voivodeship" },
  { code: "PT", nomFr: "Portugal", nomEn: "Portugal", continent: "europe", devise: "EUR", fuseau: "Europe/Lisbon", plusieursFuseaux: true, cadre: [-17.24, 32.65, -6.21, 42.14], decoupageFr: "district", decoupageEn: "district" },
  { code: "RO", nomFr: "Roumanie", nomEn: "Romania", continent: "europe", devise: "RON", fuseau: "Europe/Bucharest", plusieursFuseaux: false, cadre: [20.24, 43.67, 29.71, 48.26], decoupageFr: "judeţ", decoupageEn: "county" },
  { code: "RS", nomFr: "Serbie", nomEn: "Serbia", continent: "europe", devise: "RSD", fuseau: "Europe/Belgrade", plusieursFuseaux: false, cadre: [18.84, 42.24, 22.98, 46.17], decoupageFr: "district", decoupageEn: "district" },
  { code: "SE", nomFr: "Suède", nomEn: "Sweden", continent: "europe", devise: "SEK", fuseau: "Europe/Stockholm", plusieursFuseaux: false, cadre: [11.15, 55.35, 24.16, 69.04], decoupageFr: "comté", decoupageEn: "county" },
  { code: "SI", nomFr: "Slovénie", nomEn: "Slovenia", continent: "europe", devise: "EUR", fuseau: "Europe/Ljubljana", plusieursFuseaux: false, cadre: [13.38, 45.43, 16.52, 46.86], decoupageFr: "région", decoupageEn: "region" },
  { code: "SK", nomFr: "Slovaquie", nomEn: "Slovakia", continent: "europe", devise: "EUR", fuseau: "Europe/Bratislava", plusieursFuseaux: false, cadre: [16.86, 47.76, 22.54, 49.6], decoupageFr: "région", decoupageEn: "region" },
  { code: "SM", nomFr: "Saint-Marin", nomEn: "San Marino", continent: "europe", devise: "EUR", fuseau: "Europe/San_Marino", plusieursFuseaux: false, cadre: [12.4, 43.89, 12.51, 43.99], decoupageFr: "castello", decoupageEn: "castle" },
  { code: "TR", nomFr: "Turquie", nomEn: "Türkiye", continent: "asie", devise: "TRY", fuseau: "Europe/Istanbul", plusieursFuseaux: false, cadre: [25.67, 35.83, 44.82, 42.09], decoupageFr: "province", decoupageEn: "province" },
  { code: "UA", nomFr: "Ukraine", nomEn: "Ukraine", continent: "europe", devise: "UAH", fuseau: "Europe/Kyiv", plusieursFuseaux: false, cadre: [22.13, 45.23, 40.13, 52.35], decoupageFr: "oblast", decoupageEn: "oblast" },
  { code: "VA", nomFr: "État de la Cité du Vatican", nomEn: "Vatican City", continent: "europe", devise: "EUR", fuseau: "Europe/Vatican", plusieursFuseaux: false, cadre: [12.43, 41.9, 12.44, 41.91], decoupageFr: "aucune subdivision", decoupageEn: "no subdivision" },
];

const PAR_CODE = new Map(PAYS.map((p) => [p.code, p]));

export function paysByCode(code: string | null | undefined): Pays | undefined {
  return code ? PAR_CODE.get(code.toUpperCase()) : undefined;
}

/** Les pays d'un continent, dans l'ordre alphabétique de leur nom français. */
export function paysDuContinent(id: ContinentId): Pays[] {
  return PAYS.filter((p) => p.continent === id).sort((a, b) => a.nomFr.localeCompare(b.nomFr, "fr"));
}
