/**
 * Les villages d'une station que le référentiel décrit à part.
 *
 * Le référentiel (classeur France Montagnes × dépôt) donne une entrée à des
 * villages ou à des niveaux d'une même station. Leurs logements sont ceux de
 * la station : ils ne sont listés qu'une fois, sous elle
 * (`stay/rattachement.ts`). Les fiches restent au référentiel, rien n'est
 * supprimé ; elles renvoient à leur station (`stationDeRattachement`).
 *
 * ## Décisions du propriétaire (6 octobre 2026)
 *
 * - **Val Cenis**, commune nouvelle (2017) et une seule station : Lanslebourg,
 *   Lanslevillard, Termignon, Bramans et Sollières. Bramans a sa fiche
 *   Skiinfo, la décision l'emporte. Sollières n'a pas d'entrée : son nom
 *   suffit à la reconnaître comme commune publiée.
 * - **La Plagne** : les neuf entrées de la commune de La Plagne Tarentaise.
 *   Aime 2000 et Montalbert (commune d'Aime-la-Plagne) restent à part.
 * - **Les Arcs** : les cinq entrées de Bourg-Saint-Maurice. Villaroger reste
 *   à part.
 * - **Courchevel** : ses quatre niveaux. La Tania reste une station.
 * - **Tignes** : ses cinq entrées.
 * - Val Thorens, Les Menuires et Saint-Martin-de-Belleville sont des
 *   stations distinctes.
 *
 * ## Les autres : la logique de Skiinfo
 *
 * Consigne du propriétaire : « suis la logique de Skiinfo ». Une entrée qui a
 * sa fiche Skiinfo (`skiinfo.snapshot.json`, 230 fiches) est une station.
 * Une entrée sans fiche est un village de la station Skiinfo dont elle relève,
 * établie par l'une de ces règles, vérifiables dans le référentiel :
 *
 * - **commune** : l'unique station Skiinfo de sa commune, si leurs domaines
 *   ne se contredisent pas (ou si la fiche Skiinfo est celle d'une vallée,
 *   comme Chamonix) ; dans une commune à plusieurs stations Skiinfo, la plus
 *   proche (Reberty, aux Belleville) ;
 * - **nom** : son nom est un niveau ou un village du nom de la fiche
 *   (« Puy-Saint-Vincent 1600 », « Barèges » dans « La Mongie / Barèges ») ;
 * - **domaine** : l'unique station Skiinfo de son domaine nommé, à 6 km au
 *   plus (Pipay et Le Pleynet, aux 7 Laux).
 *
 * Dix-neuf entrées sans fiche ne relèvent d'aucune : elles restent des
 * stations (Bisanne 1500, Hauteluce Val Joly, Vallorcine, Névache…).
 * Skiinfo ne publie pas la liste des villages de ses fiches : ces règles
 * en sont la lecture, pas une copie.
 */

import { STATIONS, stationById, type Station } from "./stations.ts";

type Villages = { stations: readonly string[]; noms?: readonly string[] };

export const VILLAGES_DE_STATION: Readonly<Record<string, Villages>> = {
  // Décisions du propriétaire.
  "val-cenis": {
    stations: ["lanslebourg", "lanslevillard", "termignon", "bramans"],
    noms: [
      "Lanslebourg",
      "Lanslebourg-Mont-Cenis",
      "Lanslevillard",
      "Termignon",
      "Bramans",
      "Sollières",
      "Sollières-Sardières",
      "Sardières",
    ],
  },
  "la-plagne": {
    stations: [
      "belle-plagne",
      "les-coches",
      "montchavin-les-coches",
      "plagne-1800",
      "plagne-bellecote",
      "plagne-centre",
      "plagne-soleil",
      "plagne-villages",
    ],
  },
  "les-arcs-bourg-st-maurice": { stations: ["arc-1600", "arc-1800", "arc-1950", "arc-2000"] },
  courchevel: {
    stations: ["courchevel-le-praz", "courchevel-moriond-1650", "courchevel-village-1550"],
  },
  tignes: {
    stations: ["tignes-le-lac", "tignes-les-boisses", "tignes-les-brevieres", "tignes-val-claret"],
  },

  // Logique de Skiinfo. Entre parenthèses, la règle et la distance au repère.
  chamonix: { stations: ["argentiere", "le-tour"] }, // commune, fiche de vallée (8,1 ; 10,4 km)
  chamrousse: { stations: ["chamrousse-1650", "chamrousse-1750"] }, // nom (0,2 ; 1,5 km)
  "sixt-fer-a-cheval": { stations: ["haut-giffre"] }, // commune (1,3 km)
  "val-disere": { stations: ["la-daille", "le-fornet"] }, // commune (1,9 ; 3,2 km)
  "le-collet-dallevard": { stations: ["le-barioz-alpin"] }, // commune (1,8 km)
  "saint-gervais-mont-blanc": { stations: ["le-bettex", "saint-nicolas-de-veroce"] }, // commune (3,5 ; 2,1 km)
  "le-grand-bornand": { stations: ["le-chinaillon"] }, // commune (2,5 km)
  "saint-pierre-de-chartreuse": { stations: ["le-granier"] }, // commune (2,5 km)
  "les-7-laux": { stations: ["prapoutel", "pipay", "le-pleynet"] }, // commune ; domaine (0,2 ; 2,0 ; 5,2 km)
  meribel: { stations: ["meribel-village", "meribel-mottaret"] }, // nom (2,1 ; 2,8 km)
  manigod: { stations: ["plateau-de-beauregard"] }, // commune (2,6 km)
  "les-menuires": { stations: ["reberty"] }, // commune à plusieurs stations, la plus proche (0,9 km)
  samoens: { stations: ["samoens-1600"] }, // nom (4,0 km)
  "val-dallos-la-foux-le-seignus": { stations: ["la-foux-d-allos", "le-seignus"] }, // commune ; nom (7,0 ; 0,8 km)
  "superdevoluy-la-joue-du-loup": { stations: ["la-joue-du-loup", "le-devoluy"] }, // nom ; commune (3,0 ; 1,7 km)
  arvieux: { stations: ["le-queyras"] }, // domaine (4,8 km) — le moins sûr de la liste
  vars: { stations: ["les-claux", "vars-sainte-marie"] }, // commune ; nom (2,8 ; 0,6 km)
  "les-orres": { stations: ["les-orres-1650", "les-orres-1800"] }, // nom (0,6 ; 1,5 km)
  praloup: { stations: ["pra-loup-1500"] }, // commune (1,1 km)
  "puy-saint-vincent": { stations: ["puy-saint-vincent-1600", "puy-saint-vincent-1800"] }, // nom (1,3 ; 1,5 km)
  "serre-chevalier": {
    stations: [
      "serre-chevalier-briancon",
      "serre-chevalier-chantemerle",
      "serre-chevalier-le-monetier",
    ],
  }, // nom (0,9 ; 2,8 ; 5,1 km)
  "sauze-supersauze": { stations: ["super-sauze"] }, // commune (1,6 km)
  "la-mongie-bareges": { stations: ["bareges", "la-mongie"] }, // nom ; commune (3,3 ; 6,0 km)
  "saint-lary-soulan": { stations: ["espiaube", "saint-lary-pla-d-adet"] }, // commune (2,2 ; 0,8 km)
};

const PARENT = new Map<string, string>();
for (const [station, v] of Object.entries(VILLAGES_DE_STATION))
  for (const id of v.stations) PARENT.set(id, station);

/**
 * La station dont relèvent les logements de cet identifiant : la station
 * elle-même, ou celle dont elle n'est qu'un village (`VILLAGES_DE_STATION`). Un
 * identifiant retiré (`IDS_RETIRES`) se résout comme dans `stationById`.
 */
export function stationDeRattachement(id: string): string {
  const propre = stationById(id)?.id ?? id;
  return PARENT.get(propre) ?? propre;
}

/** Les villages d'une station (identifiants du référentiel), vide s'il n'y en a pas. */
export function villagesDe(stationId: string): readonly string[] {
  return VILLAGES_DE_STATION[stationId]?.stations ?? [];
}

/**
 * Les stations qui ont des logements à elles : le référentiel moins les
 * villages de station. Une liste de stations par médiane ou par relevé (écran
 * Prix) part de celle-ci : un village y redonnerait les logements et la
 * médiane de sa station.
 */
export const STATIONS_A_LOGEMENTS: Station[] = STATIONS.filter((s) => !PARENT.has(s.id));
