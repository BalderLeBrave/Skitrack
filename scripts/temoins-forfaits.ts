/**
 * Les témoins des grilles de forfaits, chargés depuis le dépôt (aucune
 * requête) : Skiinfo et skiresort.fr (relevés du référentiel Monde),
 * skipass.com (relevé `npm run forfaits:skipass`, s'il a tourné).
 *
 * Partagé par `verifier-grilles-temoins.ts` et `releve-grilles-forfaits.ts`.
 * France Montagnes n'en est pas : ses fiches station ne publient aucun prix
 * de forfait.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STATIONS } from "../src/lib/stations.ts";
import type { GrilleTarifaire } from "../src/lib/forfaits/tarifsPeriode.ts";
import {
  aUnPrixSkiresort,
  ficheSkipassDe,
  grilleSkipass,
  grilleSkiresort,
  rattacherAuxFiches,
  type FicheSkipass,
  type FicheSkiresort,
  type Position,
} from "../src/lib/forfaits/temoins.ts";
import {
  fichesDesStations,
  grilleSkiinfo,
  verifierGrille,
  type Confrontation,
  type FicheSkiinfo,
  type PositionSkiinfo,
} from "../src/lib/forfaits/verification.ts";

const RACINE = resolve(import.meta.dirname, "..");
const lire = <T>(chemin: string): T =>
  JSON.parse(readFileSync(resolve(RACINE, chemin), "utf8")) as T;

export type Temoin = {
  nom: string;
  releve: string;
  /** Les stations rattachées à une fiche de ce témoin. */
  rattachees: number;
  ficheDe(stationId: string): string | null;
  grilleDe(cle: string): GrilleTarifaire | null;
};

const memo = (f: (cle: string) => GrilleTarifaire | null) => {
  const vu = new Map<string, GrilleTarifaire | null>();
  return (cle: string) => {
    if (!vu.has(cle)) vu.set(cle, f(cle));
    return vu.get(cle)!;
  };
};

function skiinfo(): Temoin {
  const d = lire<{ releve: string; fiches: Record<string, FicheSkiinfo> }>(
    "src/lib/monde/data/forfaitsSkiinfo.json",
  );
  const positions = lire<{ fiches: Record<string, PositionSkiinfo> }>(
    "src/lib/monde/data/skiinfo.json",
  ).fiches;
  const fiches = fichesDesStations(STATIONS, d.fiches, positions);
  const releve = d.releve.slice(0, 10);
  return {
    nom: "Skiinfo",
    releve,
    rattachees: fiches.size,
    ficheDe: (id) => fiches.get(id)?.cle ?? null,
    grilleDe: memo((cle) => grilleSkiinfo(d.fiches[cle], [], releve)),
  };
}

function skiresort(): Temoin {
  const d = lire<{ releve: string; fiches: Record<string, FicheSkiresort> }>(
    "src/lib/monde/data/forfaits.json",
  );
  const positions = lire<{ fiches: Record<string, Position> }>(
    "src/lib/monde/data/skiresort.json",
  ).fiches;
  const fiches = rattacherAuxFiches(STATIONS, positions, (cle) => aUnPrixSkiresort(d.fiches[cle]));
  const releve = d.releve.slice(0, 10);
  return {
    nom: "skiresort.fr",
    releve,
    rattachees: fiches.size,
    ficheDe: (id) => fiches.get(id)?.cle ?? null,
    grilleDe: memo((cle) => grilleSkiresort(d.fiches[cle], releve)),
  };
}

/** Le relevé skipass.com, écrit par `releve-temoins-skipass.ts`. */
export const FICHIER_SKIPASS = "src/lib/forfaits/temoins/skipass.json";

function skipass(): Temoin | null {
  if (!existsSync(resolve(RACINE, FICHIER_SKIPASS))) return null;
  const d = lire<{ releve: string; fiches: FicheSkipass[] }>(FICHIER_SKIPASS);
  const parSlug = new Map(d.fiches.map((f) => [f.slug, f]));
  const fiches = new Map<string, string>();
  for (const s of STATIONS) {
    const slug = ficheSkipassDe(s, d.fiches);
    if (slug) fiches.set(s.id, slug);
  }
  const releve = d.releve.slice(0, 10);
  return {
    nom: "skipass.com",
    releve,
    rattachees: fiches.size,
    ficheDe: (id) => fiches.get(id) ?? null,
    grilleDe: memo((cle) => {
      const f = parSlug.get(cle);
      return f ? grilleSkipass(f, releve) : null;
    }),
  };
}

/** Les témoins disponibles dans le dépôt. */
export function chargerTemoins(): Temoin[] {
  return [skiinfo(), skiresort(), skipass()].filter((t): t is Temoin => t != null);
}

/** Une grille face à chaque témoin. */
export function verifierAvecTemoins(
  g: GrilleTarifaire,
  temoins: readonly Temoin[],
): Confrontation[] {
  return temoins.flatMap((t) => verifierGrille(g, t.ficheDe, t.grilleDe));
}
