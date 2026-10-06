/**
 * Re-rattachement des relevés de l'écran Prix exportés d'un navigateur
 * (`skitrackRattachement.exporter()`, voir
 * `src/lib/prix/migrationRattachement.client.ts`).
 *
 *   npm run logements:rattachement -- --fichier export.json
 *       simulation : le rapport, rien n'est écrit ;
 *   npm run logements:rattachement -- --fichier export.json --ecrire apres.json
 *       écrit l'export re-rattaché dans `apres.json` (jamais par-dessus
 *       l'entrée, jamais dans les relevés de l'application : seul
 *       `skitrackRattachement.appliquer` les réécrit).
 *
 * La règle et le plan : `src/lib/prix/migrationRattachement.ts`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  exportIlisible,
  planifierExport,
  rapportRattachement,
  type ExportReleves,
} from "../src/lib/prix/migrationRattachement.ts";

function option(nom: string): string | null {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const fichier = option("--fichier");
const sortie = option("--ecrire");
if (!fichier) {
  console.error("Usage : --fichier export.json [--ecrire apres.json]");
  process.exit(2);
}
if (sortie && resolve(sortie) === resolve(fichier)) {
  console.error("--ecrire ne réécrit pas le fichier d'entrée : choisissez un autre nom.");
  process.exit(2);
}

let entree: ExportReleves;
try {
  entree = JSON.parse(readFileSync(fichier, "utf8")) as ExportReleves;
} catch (err) {
  console.error(
    `Lecture impossible de ${fichier} : ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(2);
}
if (exportIlisible(entree)) {
  console.error(
    `${fichier} ne contient aucune annonce, alors que des relevés en comptent : export incomplet, rien n'est planifié.`,
  );
  process.exit(2);
}
const { plan, apres } = planifierExport(entree);
console.log(sortie ? "Re-rattachement :" : "Simulation — rien n'est écrit :");
console.log(rapportRattachement(plan, Number.POSITIVE_INFINITY));
if (sortie) {
  writeFileSync(sortie, JSON.stringify(apres));
  console.log(`\nÉcrit : ${sortie}`);
}
