/**
 * Les six continents du premier niveau de choix.
 *
 * Ce découpage sert à naviguer, pas à décrire la géographie. Six onglets
 * tiennent sur une ligne ; l'Amérique se sépare en deux parce que ses deux
 * saisons de ski sont opposées, et l'Antarctique n'y figure pas.
 *
 * Un pays à cheval sur deux continents est rattaché à un seul, choisi d'après
 * l'emplacement de ses stations et non d'après la convention politique. Les
 * quatre cas et leur justification sont dans `pays.ts`, au plus près de la
 * valeur qu'ils fixent.
 */

/**
 * Un cadrage de carte, dans l'ordre d'une emprise GeoJSON :
 * ouest, sud, est, nord, en degrés décimaux.
 */
export type Cadre = readonly [ouest: number, sud: number, est: number, nord: number];

export type ContinentId = "europe" | "amerique-nord" | "amerique-sud" | "asie" | "oceanie" | "afrique";

export type Continent = {
  id: ContinentId;
  nomFr: string;
  nomEn: string;
  /**
   * La vue d'ouverture de l'onglet.
   *
   * Contrairement aux cadrages de `pays.ts`, celui-ci n'est calculé sur
   * aucune source : un continent n'a pas d'emprise à mesurer, et cadrer
   * l'Europe sur ses frontières la tirerait jusqu'au Svalbard et aux Canaries
   * pour montrer des pistes qui sont dans les Alpes. C'est donc un choix, et
   * il vaut ce que vaut un choix : il cadre les régions qui portent le ski du
   * continent.
   */
  cadre: Cadre;
};

export const CONTINENTS: readonly Continent[] = [
  {
    id: "europe",
    nomFr: "Europe",
    nomEn: "Europe",
    // Des Pyrénées à la Laponie, et des Cantabriques aux Carpates.
    cadre: [-10, 35, 32, 71],
  },
  {
    id: "amerique-nord",
    nomFr: "Amérique du Nord",
    nomEn: "North America",
    // Des Rocheuses canadiennes aux Appalaches, Alaska compris.
    cadre: [-150, 32, -60, 63],
  },
  {
    id: "amerique-sud",
    nomFr: "Amérique du Sud",
    nomEn: "South America",
    // La cordillère des Andes, du désert d'Atacama à la Terre de Feu.
    cadre: [-76, -56, -60, -16],
  },
  {
    id: "asie",
    nomFr: "Asie",
    nomEn: "Asia",
    // De l'Anatolie et du Caucase jusqu'à Hokkaido.
    cadre: [26, 25, 146, 56],
  },
  {
    id: "oceanie",
    nomFr: "Océanie",
    nomEn: "Oceania",
    // Les Alpes australiennes, la Tasmanie et les deux îles néo-zélandaises.
    cadre: [140, -48, 179, -34],
  },
  {
    id: "afrique",
    nomFr: "Afrique",
    nomEn: "Africa",
    // L'Atlas au nord, le Drakensberg au sud.
    cadre: [-18, -35, 40, 37],
  },
];

const PAR_ID = new Map(CONTINENTS.map((c) => [c.id, c]));

export function continentById(id: string): Continent | undefined {
  return PAR_ID.get(id as ContinentId);
}

/**
 * Un cadrage tient-il debout ?
 *
 * Ouest strictement à l'ouest de l'est, sud strictement au sud du nord, et le
 * tout dans les bornes du globe. Un cadrage qui franchit l'antiméridien ne
 * passe pas : aucun des cadrages retenus n'en a besoin, et en accepter un
 * silencieusement produirait une vue qui montre la planète entière.
 */
export function cadreValide(c: Cadre): boolean {
  const [o, s, e, n] = c;
  return (
    Number.isFinite(o) &&
    Number.isFinite(s) &&
    Number.isFinite(e) &&
    Number.isFinite(n) &&
    o >= -180 &&
    e <= 180 &&
    s >= -90 &&
    n <= 90 &&
    o < e &&
    s < n
  );
}
