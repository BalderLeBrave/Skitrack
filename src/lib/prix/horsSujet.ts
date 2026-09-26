/**
 * Ce qui n'est pas un logement de location de station, et que l'écran
 * « Prix » ne compte ni ne montre.
 *
 * Skitrack compare des locations : appartements, chalets, maisons, gîtes et
 * résidences. Les centrales jugent déjà le type publié à la source
 * (`scrape/centrales/regleTypes.ts`, `jugerLogement`), mais rien ne le jugeait
 * pour Booking, Abritel et Airbnb vus par CozyCozy : sur les relevés du
 * 25 septembre 2026, « Par budget » montrait 92 hôtels sur 1 618 cartes, des
 * mobil-homes de camping en tête du tri par prix, des chambres d'hôtes et un
 * logement en Suisse. Les règles sont ici, étroites, écrites sur ces exemples,
 * et lues deux fois : par `cribler` (les médianes des relevés à venir) et à la
 * relecture des relevés enregistrés (`passeAnnonce`), qui nettoie « Par
 * budget » sans rien relever.
 *
 * Ce qu'elles ne touchent pas, exprès (audit du 26 septembre 2026, à trancher
 * par le propriétaire) : les appart'hôtels, surtout des résidences de location
 * (Odalys, Lagrange, CGH) que la même plateforme type ailleurs « appartement » ;
 * les villages vacances (VVF Queyras, VVF Saint-Lary, Azureva La Clusaz) ;
 * les types « cabane » ou « mobilhome » seuls, qui se trompent sur trois vrais
 * logements (Vaujany, Argentière, Cauterets).
 *
 * Module pur. Chargé tel quel par `node --experimental-strip-types` : imports
 * relatifs avec leur extension, types en `import type`.
 */

import type { Listing } from "../listings.ts";
import { metresBetween, nearestAnyLift } from "../remontees.ts";

/** Minuscules, sans accents, espaces repliées : « Hôtel 3* » et « HOTEL 3* »
 *  se valent. */
function plier(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type MotifHorsSujet =
  | "hôtel"
  | "forfait compris"
  | "mobil-home"
  | "chambre d'hôtes"
  | "chambre chez l'habitant"
  | "auberge de jeunesse ou dortoir"
  | "hors de France";

/* ---------- Hôtels ---------- */

/** Le type publié commence par « hôtel » : « hôtel », « hôtel 3* », « Hôtel ».
 *  Pas « appart'hôtel », qui ne commence pas par le mot. */
const TYPE_HOTEL = /^\W*hotels?\b/;

/**
 * Un titre qui dit appartement ou gîte sauve un type « hôtel » : l'Airbnb
 * « Gîte De Charme à Font Romeu Odeillo », typé hôtel par erreur, et trois
 * hôtels qui louent aussi des appartements (« Eden Hotel, Apartments And
 * Chalet Chamonix Les Praz », « Chalet Inarpa - Appartements Et Suites »,
 * « Hôtel Ski Lodge - Chambres & Appartements - Village Montana »).
 */
const TITRE_LOGEMENT = /\b(?:appartements?|apartments?|apparts?|gites?)\b/;

/**
 * Un hôtel : le type publié commence par « hôtel », et le titre ne dit ni
 * appartement ni gîte. Sur les relevés du 25 septembre 2026, 93 offres sont
 * typées hôtel (90 Booking, 2 Abritel, 1 Airbnb), dont 89 écartées : les 4
 * autres ont un titre qui dit appartement ou gîte (`TITRE_LOGEMENT`). Parmi
 * les écartées, « Armancette - The Leading Hotels Of The World » (Combloux,
 * 33 352 €), « Le Yule Hotel & Spa » (La Daille, 62 221 €) et les neuf
 * Belambra Clubs. À Gréolières et à La Schlucht, la seule carte était un
 * hôtel.
 */
export function estHotel(
  type: string | null | undefined,
  titre: string | null | undefined,
): boolean {
  return TYPE_HOTEL.test(plier(type)) && !TITRE_LOGEMENT.test(plier(titre));
}

/**
 * Un séjour vendu forfait de ski compris : son total ne se compare pas à une
 * location. « Belambra Clubs Arc 2000 - L'aiguille Rouge - Ski Pass Included »
 * (9 715 €), « Belambra Clubs Les Saisies - Les Embrunes - Ski Pass
 * Included » (8 750 €). « Reduced Prices On Ski Passes » (Ikaria, Châtel)
 * n'est pas un forfait compris.
 */
const FORFAIT_COMPRIS =
  /\bski[\s-]?pass(?:es)?\s+(?:included|inclus)\b|\bforfaits?\s+(?:de\s+ski\s+)?(?:inclus|compris)\b/;

export function forfaitCompris(titre: string | null | undefined): boolean {
  return FORFAIT_COMPRIS.test(plier(titre));
}

/* ---------- Mobil-homes ---------- */

/**
 * L'expression de la règle des centrales, recopiée de
 * `scrape/centrales/regleTypes.ts` (liste `ECARTES`, « hébergement
 * insolite ») plutôt qu'importée : ce fichier est sous verrou, et la règle
 * d'ici ne doit pas bouger avec la sienne. Elle se lit ici dans le **titre**,
 * quel que soit le type : l'Airbnb « Mobile-home » d'Aragnouet, 628 €, était la
 * carte n° 1 de « Par budget » sur 1 618, typé « cabane » ; « Mobil-home - 6
 * Pers., Animaux Ok » à Séez l'était « mobilhome », « bungalow » et
 * « camping » selon la plateforme. Le type seul ne suffit pas : « cabane » et
 * « mobilhome » se trompent sur trois vrais logements (Vaujany, Argentière,
 * Cauterets).
 */
const MOBIL_HOME = /\bmobil(?:e)?[\s-]?homes?\b/;

export function estMobilHome(titre: string | null | undefined): boolean {
  return MOBIL_HOME.test(plier(titre));
}

/* ---------- Chambres et dortoirs ---------- */

/**
 * Chambres d'hôtes, chambres chez l'habitant, auberges de jeunesse, dortoirs :
 * on y loue une chambre ou un lit, pas un logement. Sur le **type publié**,
 * étroitement : « Chambre d'hôtes / B&B », « chambre d'hôtes », « Ch. chez
 * l'habitant », « auberge de jeunesse 3* ». Sur les relevés du 25 septembre
 * 2026, la règle touche 12 cartes et rien d'autre : « Relais De Montagne Au
 * Pied Du Cirque De Gavarnie » (16 personnes, 38 lits), « Chambres D'hôtes 05
 * Crévoux », « Mineral Lodge & Spa » (Arc 2000). La règle entière des
 * centrales (`jugerLogement`) en aurait retiré 139, résidences comprises.
 */
const TYPES_CHAMBRE: ReadonlyArray<readonly [RegExp, MotifHorsSujet]> = [
  [/\bd\W*\s*hotes?\b|\bb\s*&\s*b\b|\bbed\s+(?:and|&)\s+breakfast\b/, "chambre d'hôtes"],
  [/\bchez\s+l\W*\s*habitant\b/, "chambre chez l'habitant"],
  [/\bauberges?\s+de\s+(?:la\s+)?jeunesse\b|\bdortoirs?\b/, "auberge de jeunesse ou dortoir"],
];

/** Le titre aussi, pour l'auberge de jeunesse seulement : « Auberge De
 *  Jeunesse Hi Valdeblore - Le Chalet » (La Colmiane, 3 149 €). */
const TITRE_AUBERGE = /\bauberges?\s+de\s+(?:la\s+)?jeunesse\b/;

export function motifChambre(
  type: string | null | undefined,
  titre: string | null | undefined,
): MotifHorsSujet | null {
  const t = plier(type);
  for (const [re, motif] of TYPES_CHAMBRE) if (re.test(t)) return motif;
  return TITRE_AUBERGE.test(plier(titre)) ? "auberge de jeunesse ou dortoir" : null;
}

/* ---------- Hors de France ---------- */

/**
 * Les gares des remontées étrangères proches de la France, en couples
 * latitude, longitude au dix-millième. Tirées d'openskidata (lifts du
 * 22 septembre 2026) : les remontées dont les pays (`places`) ne comptent pas
 * la France (jamais le premier pays seul : Super-Châtel est « CH, FR »), à
 * 3 km au plus d'un repère de station ou d'une gare de l'index national
 * (`osmLifts.json`), moins celles à 500 m d'une gare de l'index. Là, la
 * frontière passe dans le domaine, et openskidata s'y trompe : le « Tapis de
 * Super Yeti », à Super-Châtel, y est marqué suisse. Aucune gare espagnole
 * n'est à 3 km d'un repère ou d'une gare française.
 *
 * Suisse : Émosson (Le Châtelard), Portes du Soleil (Champéry, Les Crosets,
 * Champoussin, Morgins, Torgon), La Dôle. Italie : Claviere et Cesana, La
 * Thuile, Skyway Monte Bianco. Andorre : Pas de la Casa.
 */
const GARES_ETRANGERES: Readonly<Record<"CH" | "IT" | "AD", readonly number[]>> = {
  CH: [
    46.0619, 6.9582, 46.0625, 6.957, 46.0625, 6.9571, 46.0631, 6.9561, 46.0632, 6.9558,
    46.0634, 6.9554, 46.0637, 6.9549, 46.064, 6.9543, 46.0641, 6.9541, 46.065, 6.9525,
    46.0659, 6.9353, 46.0669, 6.9462, 46.169, 6.8429, 46.1691, 6.8418, 46.1703, 6.8117,
    46.1727, 6.8444, 46.1735, 6.8448, 46.1736, 6.8261, 46.1736, 6.8262, 46.1738, 6.8275,
    46.1741, 6.8158, 46.175, 6.8452, 46.1752, 6.8457, 46.1772, 6.8402, 46.1776, 6.8403,
    46.1785, 6.8449, 46.1805, 6.8201, 46.1832, 6.8357, 46.1835, 6.8347, 46.1836, 6.8329,
    46.1838, 6.8341, 46.184, 6.8381, 46.1844, 6.8381, 46.1855, 6.8391, 46.1931, 6.8374,
    46.1945, 6.8404, 46.1983, 6.8524, 46.1993, 6.841, 46.2047, 6.848, 46.2156, 6.8502,
    46.217, 6.8507, 46.2367, 6.8581, 46.2371, 6.8509, 46.2371, 6.8511, 46.2372, 6.8492,
    46.2375, 6.846, 46.2411, 6.8542, 46.2477, 6.8711, 46.2479, 6.8711, 46.2485, 6.8646,
    46.249, 6.8647, 46.2549, 6.8687, 46.255, 6.8686, 46.2554, 6.8676, 46.2678, 6.8708,
    46.2682, 6.8694, 46.2726, 6.872, 46.2727, 6.8712, 46.3042, 6.8577, 46.3043, 6.8579,
    46.3052, 6.8502, 46.3054, 6.8502, 46.3054, 6.8511, 46.3056, 6.8501, 46.3064, 6.8499,
    46.308, 6.8323, 46.3092, 6.8329, 46.3097, 6.8633, 46.3142, 6.8673, 46.3142, 6.8697,
    46.4257, 6.1004, 46.4257, 6.1072, 46.4258, 6.0993, 46.4296, 6.0856, 46.4311, 6.102,
    46.4312, 6.102, 46.4505, 6.1034, 46.4515, 6.1054, 46.4516, 6.1051, 46.4517, 6.1054,
    46.4518, 6.1045, 46.4525, 6.1041, 46.4525, 6.1065, 46.4527, 6.105,
  ],
  IT: [
    44.9031, 6.7681, 44.916, 6.7668, 44.9198, 6.7657, 44.9208, 6.7791, 44.921, 6.7789,
    44.921, 6.7798, 44.9242, 6.7728, 44.9293, 6.7883, 44.9302, 6.7872, 44.9443, 6.7893,
    44.9447, 6.7896, 44.9457, 6.7973, 44.9461, 6.7974, 45.6859, 6.9112, 45.6875, 6.9221,
    45.6876, 6.9063, 45.688, 6.9223, 45.688, 6.9225, 45.688, 6.9234, 45.6896, 6.9388,
    45.6903, 6.9162, 45.6915, 6.9162, 45.6916, 6.9161, 45.6926, 6.9274, 45.6928, 6.9253,
    45.6928, 6.9255, 45.6944, 6.9254, 45.6945, 6.9283, 45.6985, 6.9049, 45.829, 6.95,
    45.8293, 6.9498,
  ],
  AD: [
    42.519, 1.6925, 42.5215, 1.7145, 42.5255, 1.6978, 42.5258, 1.6986, 42.526, 1.7135,
    42.5261, 1.7127, 42.527, 1.7009, 42.5272, 1.7016, 42.5298, 1.6974, 42.5299, 1.6965,
    42.5304, 1.6967, 42.5307, 1.6972, 42.5309, 1.6968, 42.531, 1.7002, 42.5312, 1.7002,
    42.5313, 1.6979, 42.5314, 1.6953, 42.5319, 1.6983, 42.5319, 1.6996, 42.532, 1.7182,
    42.5322, 1.6985, 42.5322, 1.7009, 42.5336, 1.6968, 42.5343, 1.6975,
  ],
};

/** Au-delà, une gare étrangère n'est pas celle du logement. */
export const GARE_ETRANGERE_MAX_M = 1000;
/** La gare française la plus proche doit être trois fois plus loin. */
export const RAPPORT_FRONTIERE = 3;

/** La gare étrangère la plus proche, à `GARE_ETRANGERE_MAX_M` au plus. */
function gareEtrangereProche(lat: number, lon: number): number | null {
  // Un kilomètre fait moins de 0,01° de latitude et de 0,015° de longitude
  // sous nos latitudes : le cadre écarte presque tout sans trigonométrie.
  let best: number | null = null;
  for (const coords of Object.values(GARES_ETRANGERES)) {
    for (let i = 0; i + 1 < coords.length; i += 2) {
      const glat = coords[i] as number;
      const glon = coords[i + 1] as number;
      if (Math.abs(glat - lat) > 0.01 || Math.abs(glon - lon) > 0.015) continue;
      const m = metresBetween(lat, lon, glat, glon);
      if (m <= GARE_ETRANGERE_MAX_M && (best == null || m < best)) best = m;
    }
  }
  return best;
}

/**
 * Le logement est-il hors de France ? Oui quand une remontée étrangère est à
 * 1 km au plus, et la gare française la plus proche (`nearestAnyLift`) au
 * moins trois fois plus loin. L'Airbnb « Charmant Logement à Morgins »
 * (Troistorrents, Valais, 5 758 €), rangé sous La Chapelle-d'Abondance, est à
 * 256 m de Corbeau (Suisse) et à 1 577 m de Gabelou : c'était la seule annonce
 * hors de France des relevés du 25 septembre 2026, sur 1 908 annonces situées.
 *
 * Pourquoi pas un contour de la frontière : le dépôt n'en a pas de précis
 * (`geo/pays.ts` ne tient qu'un cadrage), et au Pas de Morgins un contour
 * approché trancherait au hasard entre Châtel et Morgins. La règle des trois
 * fois laisse de la marge : dans un rayon de 2 km autour de chaque repère de
 * station, aucun point ne sort, Châtel, Montgenèvre et Val Cenis compris ; il
 * faut descendre au rapport de 1, et à 1,5 km, pour qu'une poignée de points
 * à l'est de Châtel, au-dessus de Torgon, basculent. Sans position, rien ne se
 * juge.
 */
export function horsDeFrance(
  lat: number | null | undefined,
  lon: number | null | undefined,
): boolean {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const etrangere = gareEtrangereProche(lat, lon);
  if (etrangere == null) return false;
  const fr = nearestAnyLift(lat, lon);
  return fr == null || fr.m >= etrangere * RAPPORT_FRONTIERE;
}

/* ---------- Ensemble ---------- */

/** Ce que les règles lisent d'une annonce. */
export type SujetLogement = Pick<Listing, "title"> &
  Partial<Pick<Listing, "propertyType" | "lat" | "lon">>;

/**
 * Pourquoi l'annonce n'est pas un logement de location de station, ou `null`.
 * Le premier motif qui tranche, dans l'ordre des règles de ce fichier.
 */
export function motifHorsSujet(l: SujetLogement): MotifHorsSujet | null {
  if (estHotel(l.propertyType, l.title)) return "hôtel";
  if (forfaitCompris(l.title)) return "forfait compris";
  if (estMobilHome(l.title)) return "mobil-home";
  const chambre = motifChambre(l.propertyType, l.title);
  if (chambre) return chambre;
  return horsDeFrance(l.lat, l.lon) ? "hors de France" : null;
}
