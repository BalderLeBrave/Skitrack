/**
 * Les collecteurs d'agences, par source (voir `couverture.ts`). La part
 * « agences » (`run.server.ts`) les lance ensemble, chacun pour les stations
 * qu'il couvre.
 */

import type { LiveSearchInput } from "../types";
import { releverAlpissime } from "./alpissime.server";
import { releverCimalpes } from "./cimalpes.server";
import type { SourceAgence } from "./couverture";
import { releverMadameVacances } from "./madameVacances.server";
import { releverMaeva } from "./maeva.server";
import { releverMountainCollection } from "./mountainCollection.server";
import { releverOvo } from "./ovo.server";
import type { OptionsReleve, ReleveAgence } from "./reseau.server";
import { releverSkiPlanet } from "./skiPlanet.server";
import { releverTravelski } from "./travelski.server";

export type Collecteur = (input: LiveSearchInput, opts: OptionsReleve) => Promise<ReleveAgence>;

const COLLECTEURS: Readonly<Record<SourceAgence, Collecteur>> = {
  Alpissime: releverAlpissime,
  Cimalpes: releverCimalpes,
  "Madame Vacances": releverMadameVacances,
  Maeva: releverMaeva,
  "Mountain Collection": releverMountainCollection,
  "Ovo Network": releverOvo,
  "Ski-Planet": releverSkiPlanet,
  Travelski: releverTravelski,
};

export function collecteurDe(source: SourceAgence): Collecteur {
  return COLLECTEURS[source];
}

export { agencesDe } from "./couverture";
