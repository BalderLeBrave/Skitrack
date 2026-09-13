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
 * que son `robots.txt` autorisait et ce qu'il a répondu.
 *
 * **Prendre l'un pour l'autre coûte huit stations.** Les six stations des
 * Sybelles, l'Alpe du Grand Serre et Piau-Engaly n'existent que dans le second
 * relevé : s'en tenir au premier les laisse sans centrale, et l'écran leur dit
 * « cette station n'a pas de centrale », ce qui est faux. Le premier garde la
 * priorité quand les deux parlent, parce que lui seul porte un lien précis.
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

export const CENTRALES_AUDIT_AT = FICHIER.at;

const MOTEURS: readonly MoteurCentrale[] = [
  "Open System",
  "Ublo",
  "Ingénie",
  "Diffusio",
  "Deskline / Feratel",
  "Elloha",
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

/** La centrale d'une station, enrichie du relevé. `null` quand il n'y en a pas. */
export function ficheCentrale(stationId: string): FicheCentrale | null {
  const releve = centraleFor(stationId);
  const decouverte = PAR_STATION.get(stationId);
  const host = releve?.host ?? decouverte?.host;
  if (!host) return null;
  const f = FICHIER.hotes[host];
  return {
    host,
    nom: releve?.nom ?? decouverte?.nom ?? host,
    // L'audit n'a gardé que l'hôte pour ce qu'il a découvert : l'origine est
    // donc la seule adresse qu'il ait réellement appelée pour ces centrales-là.
    // Le relevé du 19 août, quand il couvre la station, donne un lien plus
    // précis, et c'est lui qu'on rend.
    url: releve?.url ?? `https://${host}/`,
    moteur: moteurDe(f?.moteur),
    origine: releve ? "relevé du 19 août 2026" : "audit du 13 septembre 2026",
    robotsReleve: f?.robots ?? null,
    reponseReleve: f?.reponse ?? null,
  };
}

/** Les hôtes du relevé, pour les écrans de contrôle et les tests. */
export function hotesReleves(): { host: string; moteur: MoteurCentrale; stations: number }[] {
  return Object.entries(FICHIER.hotes)
    .map(([host, f]) => ({ host, moteur: moteurDe(f.moteur), stations: f.stations.length }))
    .sort((a, b) => b.stations - a.stations || a.host.localeCompare(b.host));
}

/**
 * Combien de stations un moteur dessert.
 *
 * Sert à décider par quoi commencer : un analyseur qui couvre cinquante-quatre
 * stations vaut mieux que sept connecteurs qui en couvrent une chacun.
 */
export function couvertureParMoteur(): { moteur: MoteurCentrale; stations: number; hotes: number }[] {
  const par = new Map<MoteurCentrale, { stations: number; hotes: number }>();
  for (const f of Object.values(FICHIER.hotes)) {
    const m = moteurDe(f.moteur);
    const e = par.get(m) ?? { stations: 0, hotes: 0 };
    e.stations += f.stations.length;
    e.hotes += 1;
    par.set(m, e);
  }
  return [...par.entries()]
    .map(([moteur, v]) => ({ moteur, ...v }))
    .sort((a, b) => b.stations - a.stations);
}
