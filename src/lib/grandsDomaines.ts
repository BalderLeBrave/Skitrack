/**
 * Les grands domaines reliés : des stations à fiche Skiinfo que les remontées
 * relient entre elles, skis aux pieds. Table validée par le propriétaire le
 * 5 octobre 2026 (`docs/REFERENTIEL-SKIINFO.md`).
 *
 * C'est une couche de regroupement à part, au-dessus des stations : elle liste
 * ses stations membres et **ne fusionne jamais les logements**. Un logement
 * reste rattaché à sa station ; le domaine dit seulement qu'il est sur un
 * domaine relié à celle qu'on cherche (verdict `linked`, `rattachement.ts`).
 *
 * Ce que ce n'est pas :
 * - **un forfait commercial** : Espace Haute Maurienne Vanoise, Eski-mo, Mont
 *   Blanc Unlimited vendent un forfait sur des stations qu'aucune remontée ne
 *   relie. Ils ne réunissent personne ici, quoi que dise le catalogue de
 *   forfaits ;
 * - **le libellé de domaine d'OpenStreetMap** (`Station.domain`), qui nomme
 *   aussi bien le domaine d'une seule station (« Serre-Chevalier ») qu'un
 *   versant entier (« Portes du Soleil »). Il reste l'échelle des chiffres de
 *   domaine (km, remontées), pas celle des liaisons.
 *
 * Toutes les liaisons sont confirmées par le propriétaire (5 octobre 2026).
 */

export type GrandDomaine = {
  id: string;
  nom: string;
  /** Identifiants des stations membres, dans l'ordre d'affichage. */
  stations: readonly string[];
};

export const GRANDS_DOMAINES: readonly GrandDomaine[] = [
  {
    id: "3-vallees",
    nom: "Les 3 Vallées",
    stations: [
      "courchevel",
      "la-tania",
      "meribel",
      "brides-les-bains",
      "saint-martin-de-belleville",
      "les-menuires",
      "val-thorens",
      "orelle",
    ],
  },
  {
    id: "paradiski",
    nom: "Paradiski",
    stations: [
      "la-plagne",
      "montchavin-les-coches",
      "champagny-en-vanoise",
      "peisey-vallandry",
      "les-arcs-bourg-st-maurice",
    ],
  },
  { id: "tignes-val-disere", nom: "Tignes - Val d'Isère", stations: ["tignes", "val-disere"] },
  {
    id: "portes-du-soleil",
    nom: "Portes du Soleil",
    // Abondance, déliée le 26 septembre 2026, y est rendue le 5 octobre par
    // le propriétaire, qui confirme aussi Roc d'Enfer - Saint-Jean-d'Aulps.
    stations: [
      "abondance",
      "avoriaz",
      "chatel",
      "la-chapelle-dabondance",
      "les-gets",
      "montriond",
      "morzine",
      "saint-jean-daulps",
    ],
  },
  {
    id: "grand-massif",
    nom: "Le Grand Massif",
    stations: ["flaine", "les-carroz", "morillon", "samoens", "sixt-fer-a-cheval"],
  },
  {
    id: "espace-diamant",
    nom: "Espace Diamant",
    stations: [
      "les-saisies",
      "crest-voland-cohennoz",
      "flumet-st-nicolas-la-chapelle",
      "notre-dame-de-bellecombe",
      "praz-sur-arly",
    ],
  },
  {
    id: "alpe-d-huez",
    nom: "Alpe d'Huez Grand Domaine",
    stations: ["alpe-d-huez", "auris-en-oisans", "oz-en-oisans", "vaujany", "villard-reculas"],
  },
  {
    id: "sybelles",
    nom: "Les Sybelles",
    stations: [
      "la-toussuire",
      "le-corbier",
      "les-bottieres",
      "saint-sorlin-darves",
      "st-jean-darves",
      "saint-colomban-villards",
    ],
  },
  { id: "galibier-thabor", nom: "Galibier-Thabor", stations: ["valloire", "valmeinier"] },
  {
    id: "grand-domaine",
    nom: "Le Grand Domaine",
    stations: ["valmorel", "saint-francois-longchamp", "doucy"],
  },
  {
    id: "evasion-mont-blanc",
    nom: "Évasion Mont-Blanc",
    // Confirmé par le propriétaire le 5 octobre 2026 : un seul domaine relié.
    stations: ["megeve", "saint-gervais-mont-blanc", "combloux", "la-giettaz"],
  },
  { id: "la-clusaz-manigod", nom: "La Clusaz - Manigod", stations: ["la-clusaz", "manigod"] },
  {
    id: "hirmentaz-haberes",
    nom: "Hirmentaz - Les Habères",
    stations: ["bellevaux-hirmentaz", "les-haberes"],
  },
  { id: "foret-blanche", nom: "Forêt Blanche", stations: ["vars", "risoul"] },
  {
    id: "espace-lumiere",
    nom: "Espace Lumière",
    stations: ["praloup", "val-dallos-la-foux-le-seignus"],
  },
  { id: "grand-sancy", nom: "Le Grand Sancy", stations: ["besse-super-besse", "le-mont-dore"] },
  {
    id: "font-romeu-pyrenees-2000",
    nom: "Font-Romeu - Pyrénées 2000",
    stations: ["font-romeu-pyrenees-2000", "bolquere-pyrenees-2000"],
  },
  { id: "valberg-beuil", nom: "Valberg - Beuil", stations: ["valberg", "beuil-les-launes"] },
  {
    id: "villard-correncon",
    nom: "Villard-de-Lans - Corrençon",
    stations: ["villard-de-lans", "correncon-en-vercors"],
  },
  // Domaines transfrontaliers, reliés à l'Italie, à une seule station du
  // référentiel : La Rosière avec La Thuile, Montgenèvre avec Sestrières,
  // Sauze d'Oulx et Sansicario (Via Lattea en italien). Ils ne relient aucune
  // autre station française, mais la station est bien sur un domaine relié.
  { id: "espace-san-bernardo", nom: "Espace San Bernardo", stations: ["la-rosiere-1850"] },
  { id: "voie-lactee", nom: "Voie Lactée", stations: ["montgenevre"] },
];

const PAR_STATION = new Map<string, GrandDomaine>();
for (const d of GRANDS_DOMAINES) for (const s of d.stations) PAR_STATION.set(s, d);

/** Le grand domaine relié d'une station, s'il en a un. */
export function grandDomaineDe(stationId: string): GrandDomaine | undefined {
  return PAR_STATION.get(stationId);
}

/** Les deux stations sont-elles sur le même grand domaine relié ? Une station
 *  ne l'est pas avec elle-même : elle est la station. */
export function memeGrandDomaine(a: string, b: string): boolean {
  if (a === b) return false;
  const d = PAR_STATION.get(a);
  return d !== undefined && d === PAR_STATION.get(b);
}
