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
 * ## Portée de la liste
 *
 * Elle était provisoire ; elle ne l'est plus. La règle est « les pays ayant au
 * moins une station retenue », et la phase 2 a dit ce que « retenue » veut
 * dire : en exploitation, et mesurée. Les 44 pays d'origine portaient tous des
 * domaines, aucun n'a donc été retiré ; 27 ont été ajoutés, et
 * `monde.test.ts` vérifie les deux sens.
 *
 * **Deux pays du référentiel restent dehors, et pour une raison chacun.**
 *
 * - L'**Antarctique** (`AQ`) porte un téléski en exploitation près de McMurdo,
 *   mais la liste ISO 4217 écrit « No universal currency » en face de lui : il
 *   n'y a pas de devise à recopier, et `continents.ts` n'a de toute façon pas
 *   d'onglet où le mettre.
 * - Le **Kosovo** (`XK`) n'est ni dans la liste ISO 4217, ni dans `zone.tab` :
 *   `XK` est un code d'usage, pas un code ISO 3166-1. Ni sa devise ni son
 *   fuseau ne se sourcent ici.
 *
 * Les deux sortent de `paysSansFiche()`, et leur nombre est verrouillé par un
 * test : ils doivent se voir, pas se deviner.
 *
 * La France y figure comme les autres, bien que son référentiel reste celui du
 * classeur France Montagnes : les écrans ont besoin de sa devise, de son
 * fuseau et de son continent comme de ceux du Japon.
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
 * - **Russie : Europe.** Le choix est le moins net des quatre. Krasnaïa
 *   Poliana est au nord de la crête du Caucase, donc en Europe, comme les
 *   stations de l'Oural et de la péninsule de Kola ; Cheregech est en Sibérie.
 *   Le nombre penche du côté européen, pas l'unanimité.
 * - **Kazakhstan : Asie.** Chymboulak domine Almaty, à l'est de l'Oural et de
 *   la Caspienne. Aucune ambiguïté.
 */
export const PAYS: readonly Pays[] = [
  /* ---------- Europe ---------- */
  { code: "AD", nomFr: "Andorre", nomEn: "Andorra", continent: "europe", devise: "EUR", fuseau: "Europe/Andorra", plusieursFuseaux: false, cadre: [1.41, 42.43, 1.74, 42.64], decoupageFr: "paroisse", decoupageEn: "parish" },
  { code: "AT", nomFr: "Autriche", nomEn: "Austria", continent: "europe", devise: "EUR", fuseau: "Europe/Vienna", plusieursFuseaux: false, cadre: [9.52, 46.4, 17.15, 49], decoupageFr: "Land", decoupageEn: "state" },
  { code: "BA", nomFr: "Bosnie-Herzégovine", nomEn: "Bosnia & Herzegovina", continent: "europe", devise: "BAM", fuseau: "Europe/Sarajevo", plusieursFuseaux: false, cadre: [15.74, 42.56, 19.58, 45.28], decoupageFr: "canton", decoupageEn: "canton" },
  // La Bulgarie est passée à l'euro le 1er janvier 2026, le lev cessant d'avoir
  // cours le 1er février. Écrire « BGN » de mémoire aurait été faux.
  { code: "BG", nomFr: "Bulgarie", nomEn: "Bulgaria", continent: "europe", devise: "EUR", fuseau: "Europe/Sofia", plusieursFuseaux: false, cadre: [22.34, 41.24, 28.59, 44.24], decoupageFr: "oblast", decoupageEn: "province" },
  { code: "CH", nomFr: "Suisse", nomEn: "Switzerland", continent: "europe", devise: "CHF", fuseau: "Europe/Zurich", plusieursFuseaux: false, cadre: [5.97, 45.83, 10.45, 47.78], decoupageFr: "canton", decoupageEn: "canton" },
  { code: "CZ", nomFr: "Tchéquie", nomEn: "Czechia", continent: "europe", devise: "CZK", fuseau: "Europe/Prague", plusieursFuseaux: false, cadre: [12.09, 48.58, 18.83, 51.04], decoupageFr: "région", decoupageEn: "region" },
  { code: "DE", nomFr: "Allemagne", nomEn: "Germany", continent: "europe", devise: "EUR", fuseau: "Europe/Berlin", plusieursFuseaux: false, cadre: [5.86, 47.28, 15.02, 55.06], decoupageFr: "Land", decoupageEn: "state" },
  { code: "ES", nomFr: "Espagne", nomEn: "Spain", continent: "europe", devise: "EUR", fuseau: "Europe/Madrid", plusieursFuseaux: true, cadre: [-17.32, 27.75, 4.32, 43.76], decoupageFr: "communauté autonome", decoupageEn: "autonomous community" },
  { code: "FI", nomFr: "Finlande", nomEn: "Finland", continent: "europe", devise: "EUR", fuseau: "Europe/Helsinki", plusieursFuseaux: false, cadre: [20.62, 59.82, 31.54, 70.06], decoupageFr: "région", decoupageEn: "region" },
  // La France nomme ses zones de montagne par massif, pas par région
  // administrative : c'est le découpage que le référentiel porte depuis
  // l'origine, et celui des bulletins d'avalanche.
  //
  // `plusieursFuseaux` décrit le territoire, Réunion et Antilles comprises, et
  // non les stations : les 320 du référentiel sont toutes en Europe/Paris,
  // Corse incluse. La prévision française passe de toute façon par AROME, que
  // `country === "FR"` suffit à choisir.
  { code: "FR", nomFr: "France", nomEn: "France", continent: "europe", devise: "EUR", fuseau: "Europe/Paris", plusieursFuseaux: true, cadre: [-4.76, 41.38, 9.56, 51.1], decoupageFr: "massif", decoupageEn: "range" },
  { code: "GB", nomFr: "Royaume-Uni", nomEn: "United Kingdom", continent: "europe", devise: "GBP", fuseau: "Europe/London", plusieursFuseaux: false, cadre: [-8.14, 50.02, 1.75, 60.83], decoupageFr: "nation", decoupageEn: "nation" },
  { code: "GR", nomFr: "Grèce", nomEn: "Greece", continent: "europe", devise: "EUR", fuseau: "Europe/Athens", plusieursFuseaux: false, cadre: [19.65, 34.93, 28.23, 41.74], decoupageFr: "périphérie", decoupageEn: "region" },
  { code: "HR", nomFr: "Croatie", nomEn: "Croatia", continent: "europe", devise: "EUR", fuseau: "Europe/Zagreb", plusieursFuseaux: false, cadre: [13.52, 42.43, 19.4, 46.53], decoupageFr: "comitat", decoupageEn: "county" },
  { code: "IS", nomFr: "Islande", nomEn: "Iceland", continent: "europe", devise: "ISK", fuseau: "Atlantic/Reykjavik", plusieursFuseaux: false, cadre: [-24.48, 63.41, -13.56, 66.53], decoupageFr: "région", decoupageEn: "region" },
  { code: "IT", nomFr: "Italie", nomEn: "Italy", continent: "europe", devise: "EUR", fuseau: "Europe/Rome", plusieursFuseaux: false, cadre: [6.63, 36.69, 18.49, 47.08], decoupageFr: "région", decoupageEn: "region" },
  { code: "LI", nomFr: "Liechtenstein", nomEn: "Liechtenstein", continent: "europe", devise: "CHF", fuseau: "Europe/Vaduz", plusieursFuseaux: false, cadre: [9.48, 47.06, 9.61, 47.27], decoupageFr: "commune", decoupageEn: "municipality" },
  { code: "ME", nomFr: "Monténégro", nomEn: "Montenegro", continent: "europe", devise: "EUR", fuseau: "Europe/Podgorica", plusieursFuseaux: false, cadre: [18.44, 41.87, 20.35, 43.54], decoupageFr: "commune", decoupageEn: "municipality" },
  { code: "MK", nomFr: "Macédoine du Nord", nomEn: "North Macedonia", continent: "europe", devise: "MKD", fuseau: "Europe/Skopje", plusieursFuseaux: false, cadre: [20.45, 40.85, 23.01, 42.36], decoupageFr: "région", decoupageEn: "region" },
  { code: "NO", nomFr: "Norvège", nomEn: "Norway", continent: "europe", devise: "NOK", fuseau: "Europe/Oslo", plusieursFuseaux: false, cadre: [4.8, 58.02, 30.96, 80.05], decoupageFr: "comté", decoupageEn: "county" },
  { code: "PL", nomFr: "Pologne", nomEn: "Poland", continent: "europe", devise: "PLN", fuseau: "Europe/Warsaw", plusieursFuseaux: false, cadre: [14.13, 49.02, 24.11, 54.84], decoupageFr: "voïvodie", decoupageEn: "voivodeship" },
  { code: "RO", nomFr: "Roumanie", nomEn: "Romania", continent: "europe", devise: "RON", fuseau: "Europe/Bucharest", plusieursFuseaux: false, cadre: [20.24, 43.67, 29.71, 48.26], decoupageFr: "judeţ", decoupageEn: "county" },
  { code: "RS", nomFr: "Serbie", nomEn: "Serbia", continent: "europe", devise: "RSD", fuseau: "Europe/Belgrade", plusieursFuseaux: false, cadre: [18.84, 42.24, 22.98, 46.17], decoupageFr: "district", decoupageEn: "district" },
  { code: "RU", nomFr: "Russie", nomEn: "Russia", continent: "europe", devise: "RUB", fuseau: "Europe/Moscow", plusieursFuseaux: true, cadre: [19.6, 41.2, 180, 81.85], decoupageFr: "sujet fédéral", decoupageEn: "federal subject" },
  { code: "SE", nomFr: "Suède", nomEn: "Sweden", continent: "europe", devise: "SEK", fuseau: "Europe/Stockholm", plusieursFuseaux: false, cadre: [11.15, 55.35, 24.16, 69.04], decoupageFr: "comté", decoupageEn: "county" },
  { code: "SI", nomFr: "Slovénie", nomEn: "Slovenia", continent: "europe", devise: "EUR", fuseau: "Europe/Ljubljana", plusieursFuseaux: false, cadre: [13.38, 45.43, 16.52, 46.86], decoupageFr: "région", decoupageEn: "region" },
  { code: "SK", nomFr: "Slovaquie", nomEn: "Slovakia", continent: "europe", devise: "EUR", fuseau: "Europe/Bratislava", plusieursFuseaux: false, cadre: [16.86, 47.76, 22.54, 49.6], decoupageFr: "région", decoupageEn: "region" },
  { code: "UA", nomFr: "Ukraine", nomEn: "Ukraine", continent: "europe", devise: "UAH", fuseau: "Europe/Kyiv", plusieursFuseaux: false, cadre: [22.13, 45.23, 40.13, 52.35], decoupageFr: "oblast", decoupageEn: "oblast" },
  { code: "AL", nomFr: "Albanie", nomEn: "Albania", continent: "europe", devise: "ALL", fuseau: "Europe/Tirane", plusieursFuseaux: false, cadre: [19.28, 39.65, 21.03, 42.65], decoupageFr: "préfecture", decoupageEn: "county" },
  { code: "BE", nomFr: "Belgique", nomEn: "Belgium", continent: "europe", devise: "EUR", fuseau: "Europe/Brussels", plusieursFuseaux: false, cadre: [2.52, 49.51, 6.36, 51.49], decoupageFr: "province", decoupageEn: "province" },
  { code: "BY", nomFr: "Biélorussie", nomEn: "Belarus", continent: "europe", devise: "BYN", fuseau: "Europe/Minsk", plusieursFuseaux: false, cadre: [23.18, 51.27, 32.71, 56.15], decoupageFr: "voblast", decoupageEn: "region" },
  { code: "CY", nomFr: "Chypre", nomEn: "Cyprus", continent: "europe", devise: "EUR", fuseau: "Asia/Nicosia", plusieursFuseaux: false, cadre: [32.3, 34.57, 34.05, 35.18], decoupageFr: "district", decoupageEn: "district" },
  { code: "DK", nomFr: "Danemark", nomEn: "Denmark", continent: "europe", devise: "DKK", fuseau: "Europe/Copenhagen", plusieursFuseaux: false, cadre: [8.12, 54.63, 15.14, 57.74], decoupageFr: "région", decoupageEn: "region" },
  { code: "EE", nomFr: "Estonie", nomEn: "Estonia", continent: "europe", devise: "EUR", fuseau: "Europe/Tallinn", plusieursFuseaux: false, cadre: [21.85, 57.53, 28.15, 59.64], decoupageFr: "comté", decoupageEn: "county" },
  { code: "HU", nomFr: "Hongrie", nomEn: "Hungary", continent: "europe", devise: "HUF", fuseau: "Europe/Budapest", plusieursFuseaux: false, cadre: [16.09, 45.75, 22.88, 48.55], decoupageFr: "comitat", decoupageEn: "county" },
  { code: "IE", nomFr: "Irlande", nomEn: "Ireland", continent: "europe", devise: "EUR", fuseau: "Europe/Dublin", plusieursFuseaux: false, cadre: [-10.39, 51.47, -6.03, 55.37], decoupageFr: "comté", decoupageEn: "county" },
  { code: "LT", nomFr: "Lituanie", nomEn: "Lithuania", continent: "europe", devise: "EUR", fuseau: "Europe/Vilnius", plusieursFuseaux: false, cadre: [20.9, 53.89, 26.78, 56.41], decoupageFr: "apskritis", decoupageEn: "county" },
  { code: "LV", nomFr: "Lettonie", nomEn: "Latvia", continent: "europe", devise: "EUR", fuseau: "Europe/Riga", plusieursFuseaux: false, cadre: [21.01, 55.67, 28.2, 58.06], decoupageFr: "municipalité", decoupageEn: "municipality" },
  { code: "NL", nomFr: "Pays-Bas", nomEn: "Netherlands", continent: "europe", devise: "EUR", fuseau: "Europe/Amsterdam", plusieursFuseaux: false, cadre: [3.35, 50.75, 7.2, 53.63], decoupageFr: "province", decoupageEn: "province" },
  { code: "PT", nomFr: "Portugal", nomEn: "Portugal", continent: "europe", devise: "EUR", fuseau: "Europe/Lisbon", plusieursFuseaux: true, cadre: [-17.24, 32.65, -6.21, 42.14], decoupageFr: "district", decoupageEn: "district" },
  /* ---------- Amérique du Nord ---------- */
  { code: "CA", nomFr: "Canada", nomEn: "Canada", continent: "amerique-nord", devise: "CAD", fuseau: "America/Toronto", plusieursFuseaux: true, cadre: [-141, 41.67, -52.65, 83.12], decoupageFr: "province", decoupageEn: "province" },
  { code: "US", nomFr: "États-Unis", nomEn: "United States", continent: "amerique-nord", devise: "USD", fuseau: "America/New_York", plusieursFuseaux: true, cadre: [-168.09, 24.54, -66.99, 71.41], decoupageFr: "État", decoupageEn: "state" },
  { code: "GL", nomFr: "Groenland", nomEn: "Greenland", continent: "amerique-nord", devise: "DKK", fuseau: "America/Nuuk", plusieursFuseaux: true, cadre: [-72.82, 59.82, -11.43, 83.6], decoupageFr: "municipalité", decoupageEn: "municipality" },
  { code: "MX", nomFr: "Mexique", nomEn: "Mexico", continent: "amerique-nord", devise: "MXN", fuseau: "America/Mexico_City", plusieursFuseaux: true, cadre: [-118.4, 14.55, -86.7, 32.72], decoupageFr: "État", decoupageEn: "state" },
  /* ---------- Amérique du Sud ---------- */
  { code: "AR", nomFr: "Argentine", nomEn: "Argentina", continent: "amerique-sud", devise: "ARS", fuseau: "America/Argentina/Buenos_Aires", plusieursFuseaux: false, cadre: [-73.58, -55.03, -53.67, -21.8], decoupageFr: "province", decoupageEn: "province" },
  { code: "CL", nomFr: "Chili", nomEn: "Chile", continent: "amerique-sud", devise: "CLP", fuseau: "America/Santiago", plusieursFuseaux: true, cadre: [-78.99, -55.89, -66.44, -17.51], decoupageFr: "région", decoupageEn: "region" },
  { code: "BR", nomFr: "Brésil", nomEn: "Brazil", continent: "amerique-sud", devise: "BRL", fuseau: "America/Sao_Paulo", plusieursFuseaux: true, cadre: [-74.0, -33.74, -34.81, 5.26], decoupageFr: "État", decoupageEn: "state" },
  /* ---------- Asie ---------- */
  { code: "CN", nomFr: "Chine", nomEn: "China", continent: "asie", devise: "CNY", fuseau: "Asia/Shanghai", plusieursFuseaux: false, cadre: [73.61, 18.22, 134.75, 53.56], decoupageFr: "province", decoupageEn: "province" },
  { code: "GE", nomFr: "Géorgie", nomEn: "Georgia", continent: "asie", devise: "GEL", fuseau: "Asia/Tbilisi", plusieursFuseaux: false, cadre: [39.98, 41.07, 46.67, 43.57], decoupageFr: "région", decoupageEn: "region" },
  { code: "IN", nomFr: "Inde", nomEn: "India", continent: "asie", devise: "INR", fuseau: "Asia/Kolkata", plusieursFuseaux: false, cadre: [68.17, 6.75, 97.34, 35.5], decoupageFr: "État", decoupageEn: "state" },
  { code: "IR", nomFr: "Iran", nomEn: "Iran", continent: "asie", devise: "IRR", fuseau: "Asia/Tehran", plusieursFuseaux: false, cadre: [44.02, 25.1, 63.31, 39.77], decoupageFr: "province", decoupageEn: "province" },
  { code: "JP", nomFr: "Japon", nomEn: "Japan", continent: "asie", devise: "JPY", fuseau: "Asia/Tokyo", plusieursFuseaux: false, cadre: [127.65, 26.09, 145.83, 45.51], decoupageFr: "préfecture", decoupageEn: "prefecture" },
  { code: "KR", nomFr: "Corée du Sud", nomEn: "South Korea", continent: "asie", devise: "KRW", fuseau: "Asia/Seoul", plusieursFuseaux: false, cadre: [126.01, 33.2, 130.93, 38.62], decoupageFr: "province", decoupageEn: "province" },
  { code: "KZ", nomFr: "Kazakhstan", nomEn: "Kazakhstan", continent: "asie", devise: "KZT", fuseau: "Asia/Almaty", plusieursFuseaux: true, cadre: [46.61, 40.61, 87.32, 55.39], decoupageFr: "région", decoupageEn: "region" },
  { code: "LB", nomFr: "Liban", nomEn: "Lebanon", continent: "asie", devise: "LBP", fuseau: "Asia/Beirut", plusieursFuseaux: false, cadre: [35.11, 33.08, 36.58, 34.68], decoupageFr: "gouvernorat", decoupageEn: "governorate" },
  { code: "TR", nomFr: "Turquie", nomEn: "Türkiye", continent: "asie", devise: "TRY", fuseau: "Europe/Istanbul", plusieursFuseaux: false, cadre: [25.67, 35.83, 44.82, 42.09], decoupageFr: "province", decoupageEn: "province" },
  { code: "AM", nomFr: "Arménie", nomEn: "Armenia", continent: "asie", devise: "AMD", fuseau: "Asia/Yerevan", plusieursFuseaux: false, cadre: [43.44, 38.87, 46.58, 41.29], decoupageFr: "région", decoupageEn: "province" },
  { code: "AZ", nomFr: "Azerbaïdjan", nomEn: "Azerbaijan", continent: "asie", devise: "AZN", fuseau: "Asia/Baku", plusieursFuseaux: false, cadre: [44.77, 38.4, 50.37, 41.89], decoupageFr: "rayon", decoupageEn: "district" },
  { code: "IL", nomFr: "Israël", nomEn: "Israel", continent: "asie", devise: "ILS", fuseau: "Asia/Jerusalem", plusieursFuseaux: false, cadre: [34.25, 29.48, 35.89, 33.42], decoupageFr: "district", decoupageEn: "district" },
  { code: "KG", nomFr: "Kirghizstan", nomEn: "Kyrgyzstan", continent: "asie", devise: "KGS", fuseau: "Asia/Bishkek", plusieursFuseaux: false, cadre: [69.23, 39.21, 80.25, 43.24], decoupageFr: "région", decoupageEn: "region" },
  { code: "KP", nomFr: "Corée du Nord", nomEn: "North Korea", continent: "asie", devise: "KPW", fuseau: "Asia/Pyongyang", plusieursFuseaux: false, cadre: [124.35, 37.72, 130.69, 43.0], decoupageFr: "province", decoupageEn: "province" },
  { code: "MN", nomFr: "Mongolie", nomEn: "Mongolia", continent: "asie", devise: "MNT", fuseau: "Asia/Ulaanbaatar", plusieursFuseaux: true, cadre: [87.74, 41.6, 119.9, 52.12], decoupageFr: "aïmag", decoupageEn: "province" },
  { code: "PK", nomFr: "Pakistan", nomEn: "Pakistan", continent: "asie", devise: "PKR", fuseau: "Asia/Karachi", plusieursFuseaux: false, cadre: [60.84, 23.75, 77.05, 37.04], decoupageFr: "province", decoupageEn: "province" },
  { code: "TJ", nomFr: "Tadjikistan", nomEn: "Tajikistan", continent: "asie", devise: "TJS", fuseau: "Asia/Dushanbe", plusieursFuseaux: false, cadre: [67.35, 36.68, 75.12, 41.04], decoupageFr: "région", decoupageEn: "region" },
  { code: "TW", nomFr: "Taïwan", nomEn: "Taiwan", continent: "asie", devise: "TWD", fuseau: "Asia/Taipei", plusieursFuseaux: false, cadre: [118.29, 21.93, 121.93, 25.28], decoupageFr: "comté", decoupageEn: "county" },
  { code: "UZ", nomFr: "Ouzbékistan", nomEn: "Uzbekistan", continent: "asie", devise: "UZS", fuseau: "Asia/Tashkent", plusieursFuseaux: false, cadre: [55.98, 37.17, 73.14, 45.56], decoupageFr: "province", decoupageEn: "province" },
  /* ---------- Océanie ---------- */
  { code: "AU", nomFr: "Australie", nomEn: "Australia", continent: "oceanie", devise: "AUD", fuseau: "Australia/Sydney", plusieursFuseaux: true, cadre: [112.91, -43.62, 153.62, -10.05], decoupageFr: "État", decoupageEn: "state" },
  { code: "NZ", nomFr: "Nouvelle-Zélande", nomEn: "New Zealand", continent: "oceanie", devise: "NZD", fuseau: "Pacific/Auckland", plusieursFuseaux: true, cadre: [165.89, -52.57, 178.54, -34.43], decoupageFr: "région", decoupageEn: "region" },

  /* ---------- Afrique ---------- */
  { code: "MA", nomFr: "Maroc", nomEn: "Morocco", continent: "afrique", devise: "MAD", fuseau: "Africa/Casablanca", plusieursFuseaux: false, cadre: [-17, 21.42, -1.07, 35.93], decoupageFr: "région", decoupageEn: "region" },
  { code: "ZA", nomFr: "Afrique du Sud", nomEn: "South Africa", continent: "afrique", devise: "ZAR", fuseau: "Africa/Johannesburg", plusieursFuseaux: false, cadre: [16.45, -34.79, 32.89, -22.15], decoupageFr: "province", decoupageEn: "province" },
  { code: "EG", nomFr: "Égypte", nomEn: "Egypt", continent: "afrique", devise: "EGP", fuseau: "Africa/Cairo", plusieursFuseaux: false, cadre: [24.7, 21.99, 36.87, 31.65], decoupageFr: "gouvernorat", decoupageEn: "governorate" },
  { code: "LS", nomFr: "Lesotho", nomEn: "Lesotho", continent: "afrique", devise: "LSL", fuseau: "Africa/Maseru", plusieursFuseaux: false, cadre: [27.05, -30.64, 29.39, -28.58], decoupageFr: "district", decoupageEn: "district" },
];

const PAR_CODE = new Map(PAYS.map((p) => [p.code, p]));

export function paysByCode(code: string | null | undefined): Pays | undefined {
  return code ? PAR_CODE.get(code.toUpperCase()) : undefined;
}

/** Les pays d'un continent, dans l'ordre alphabétique de leur nom français. */
export function paysDuContinent(id: ContinentId): Pays[] {
  return PAYS.filter((p) => p.continent === id).sort((a, b) => a.nomFr.localeCompare(b.nomFr, "fr"));
}
