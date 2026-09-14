/**
 * Le registre des centrales : quelle centrale pour quelle station, quel moteur
 * la fait tourner, et si un connecteur sait l'interroger.
 *
 * **Deux relevés, et il faut les deux.** `src/lib/centrales.ts` tient le premier
 * depuis le classeur du 19 août 2026 : quarante-neuf stations et cinq domaines,
 * chacun avec un lien de réservation relevé à la main. Ce module était écrit et
 * **n'était importé par personne** ; il l'est maintenant.
 *
 * Le second est la découverte de l'audit du 13 septembre 2026
 * (`moteurs.data.json`, produit par `docs/centrales/audit.md`), menée sur les
 * 320 stations du référentiel en lisant, sur le site officiel de chaque
 * domaine, le lien « réserver » qu'il publie lui-même. Elle porte la couverture
 * de 54 à 113 stations et 67 hôtes, et donne pour chaque hôte son moteur, ce
 * que son `robots.txt` disait et ce qu'il a répondu.
 *
 * **Prendre l'un pour l'autre coûte huit stations.** Les six stations des
 * Sybelles, l'Alpe du Grand Serre et Piau-Engaly n'existent que dans le second
 * relevé : s'en tenir au premier les laisse sans centrale, et l'écran leur dit
 * « cette station n'a pas de centrale », ce qui est faux.
 *
 * Quand les deux parlent, c'est le rattachement le plus précis qui gagne, et
 * non le plus ancien : voir `ficheCentrale`. Le classeur l'emporte à portée
 * égale, parce que lui seul porte un lien de réservation relevé à la main.
 */

import { centraleFor } from "@/lib/centrales";
import data from "./moteurs.data.json" with { type: "json" };
import type { MoteurCentrale } from "./types";

type FicheHote = {
  nom: string;
  moteur: string;
  stations: string[];
  robots?: string;
  reponse?: number | string | null;
};

const FICHIER = data as { at: string; source: string; hotes: Record<string, FicheHote> };

const MOTEURS: readonly MoteurCentrale[] = [
  "Open System",
  "MSEM",
  "Ingénie",
  "Diffusio",
  "Deskline / Feratel",
  "Elloha",
  "Orchestra",
  "Arkiane",
  "iResa",
  "Resalys",
  "Tourinsoft",
  "aucun",
];

function moteurDe(brut: string | undefined): MoteurCentrale {
  const m = MOTEURS.find((x) => x === brut);
  return m ?? "inconnu";
}

/** Station vers hôte, tel que l'audit l'a découvert. Le premier hôte cité gagne. */
const PAR_STATION = new Map<string, { host: string; nom: string }>();
for (const [host, f] of Object.entries(FICHIER.hotes)) {
  for (const s of f.stations) {
    if (!PAR_STATION.has(s)) PAR_STATION.set(s, { host, nom: f.nom });
  }
}

/**
 * Les rattachements du classeur que la mesure a démentis.
 *
 * Le classeur du 19 août 2026 l'emporte partout ailleurs : il a été relevé à la
 * main et il porte des liens précis. Mais il se trompe parfois, et quand la
 * mesure le contredit, c'est la mesure qui gagne. Chaque entrée nomme la
 * station, l'hôte que le classeur lui donnait, et ce qui l'a démenti.
 *
 * Un rattachement démenti est simplement mis de côté : la station repasse alors
 * par le relevé de l'audit, comme si le classeur ne la connaissait pas.
 */
const DEMENTIS: Record<string, { host: string; pourquoi: string }> = {
  // Le classeur donnait Les Arcs à la centrale de Peisey-Vallandry, sous le nom
  // « Les Arcs ». Or ce site est celui de l'office de Peisey-Vallandry : son
  // titre le dit, et sa page d'accueil nomme Peisey, Vallandry et Landry près
  // de trois cents fois chacune contre quatre pour Bourg-Saint-Maurice. La
  // centrale des Arcs, elle, vend bien Arc 1600, Arc 1950, Arc 2000 et six
  // autres villages, et son fil d'Ariane dit « Bourg-Saint-Maurice ».
  "les-arcs-bourg-st-maurice": {
    host: "www.peisey-vallandry.com",
    pourquoi: "ce site est l'office de Peisey-Vallandry, et Les Arcs a sa propre centrale",
  },
};

/** D'où vient le rattachement station vers centrale. */
export type OrigineRattachement = "relevé du 19 août 2026" | "audit du 13 septembre 2026";

export type FicheCentrale = {
  host: string;
  nom: string;
  url: string;
  moteur: MoteurCentrale;
  /** Lequel des deux relevés a rattaché cette station à cette centrale. */
  origine: OrigineRattachement;
  /** Ce que `robots.txt` disait au relevé, pour la page d'accueil de la centrale. */
  robotsReleve: string | null;
  /** Ce que l'hôte répondait au relevé. */
  reponseReleve: number | string | null;
};

/**
 * La centrale d'une station, enrichie du relevé. `null` quand il n'y en a pas.
 *
 * **Le rattachement le plus précis gagne.** `centraleFor` applique déjà cette
 * règle à l'intérieur de son propre relevé : une station qui a sa centrale la
 * garde même si son domaine en a une, parce que Val Thorens vend ses
 * appartements quand les 3 Vallées vendent le forfait. La même règle vaut
 * entre les deux relevés : un rattachement de station découvert par l'audit
 * l'emporte sur un rattachement de domaine du classeur.
 *
 * Vars est le cas qui l'a imposée. Le classeur la range sous la Forêt Blanche,
 * dont la centrale est celle de Risoul, sur moteur Ingénie et fermée. Vars a en
 * réalité sa propre centrale, sur MSEM, qui répond. Sans cette règle, trois
 * stations restaient muettes derrière la centrale de leur voisine.
 */
export function ficheCentrale(stationId: string): FicheCentrale | null {
  const brut = centraleFor(stationId);
  // Un rattachement que la mesure a démenti est mis de côté : la station
  // repasse par le relevé de l'audit, comme si le classeur l'ignorait.
  const dementi = DEMENTIS[stationId];
  const releve = dementi && brut?.host === dementi.host ? null : brut;
  const decouverte = PAR_STATION.get(stationId);
  const precise = releve?.portee === "domaine" && decouverte ? decouverte : null;
  const host = precise?.host ?? releve?.host ?? decouverte?.host;
  if (!host) return null;
  const f = FICHIER.hotes[host];
  return {
    host,
    nom: precise?.nom ?? releve?.nom ?? decouverte?.nom ?? host,
    // L'audit n'a gardé que l'hôte pour ce qu'il a découvert : l'origine est
    // donc la seule adresse qu'il ait réellement appelée pour ces centrales-là.
    // Le relevé du 19 août, quand il couvre la station, donne un lien plus
    // précis, et c'est lui qu'on rend.
    url: precise ? `https://${host}/` : (releve?.url ?? `https://${host}/`),
    moteur: moteurDe(f?.moteur),
    origine: precise || !releve ? "audit du 13 septembre 2026" : "relevé du 19 août 2026",
    robotsReleve: f?.robots ?? null,
    reponseReleve: f?.reponse ?? null,
  };
}