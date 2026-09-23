/**
 * Le code de commune (`towns`) du moteur de recherche Gîtes de France, par
 * station.
 *
 * Sans lui, le moteur ignore le texte `destination=` et rend les gîtes de
 * toute la France : 43 786 résultats pour « Val Thorens », mesuré le
 * 23 septembre 2026. C'était le cas de 315 stations sur 320 — aucun gîte utile,
 * et une vingtaine de secondes perdues sur le délai de la recherche. Une
 * station absente de cette table n'est donc plus cherchée du tout, et le
 * rapport de source le dit.
 *
 * Aucun code n'est deviné. Le moteur n'accepte pas de recherche par
 * coordonnées, et son autocomplétion refuse les robots (Cloudflare, 403) : un
 * code se relève à la main, dans un navigateur ordinaire — taper la station,
 * choisir la commune proposée, lire `towns=` dans l'adresse —, puis se vérifie
 * (titre « Location gîtes <Commune> », compteur local et non national).
 */

export type CommuneGites = {
  towns: string;
  /** La commune que le moteur associe au code (celle de son titre de page). */
  commune: string;
  /** Comment le code a été établi : une ligne, datée. */
  preuve: string;
};

const LES_BELLEVILLE: CommuneGites = {
  towns: "64611",
  commune: "Les Belleville",
  preuve:
    "2026-09-23 : la recherche au point de Saint-Martin-de-Belleville redirige vers towns=64611, titre « Location gîtes Les Belleville », tuiles « à LES BELLEVILLE - Savoie »",
};

const VARS: CommuneGites = {
  towns: "38123",
  commune: "Vars",
  preuve: "code historique du dépôt, non revérifié le 2026-09-23",
};

export const COMMUNES_GITES: Readonly<Record<string, CommuneGites>> = {
  "les-2-alpes": {
    towns: "50301",
    commune: "Les Deux Alpes",
    preuve:
      "2026-09-23 : titre « Location gîtes Les Deux Alpes », 94 résultats à 20 km, point de recherche 45.0134, 6.1252",
  },
  // Val Thorens, Les Menuires, Reberty et Saint-Martin sont sur la commune des
  // Belleville : un même code, des stations différentes, que le filtre de
  // l'écran (distance, domaine) départage ensuite.
  "val-thorens": LES_BELLEVILLE,
  "les-menuires": LES_BELLEVILLE,
  reberty: LES_BELLEVILLE,
  "saint-martin-de-belleville": LES_BELLEVILLE,
  "les-karellis": {
    towns: "64400",
    commune: "Montricher-Albanne",
    preuve: "code historique du dépôt, non revérifié le 2026-09-23",
  },
  vars: VARS,
  "vars-sainte-marie": VARS,
  // Les Claux est sur la commune de Vars ; l'ancienne lecture par le nom ne
  // le reconnaissait pas.
  "les-claux": VARS,
  "les-angles": {
    towns: "61540",
    commune: "Les Angles",
    preuve: "code historique du dépôt, non revérifié le 2026-09-23",
  },
};

export function communeGites(stationId: string): CommuneGites | null {
  return COMMUNES_GITES[stationId] ?? null;
}
