/**
 * La vérification de toutes les grilles de forfaits contre les témoins :
 * Skiinfo, skiresort.fr et skipass.com (`temoins-forfaits.ts`).
 *
 *     node --experimental-strip-types scripts/verifier-grilles-temoins.ts
 *     node --experimental-strip-types scripts/verifier-grilles-temoins.ts --station chatel
 *
 * Lit les grilles officielles (`grillesOfficielles.json`, s'il existe) et
 * migrées (`grillesMigrees.json`), rattache chaque station à sa fiche chez
 * chaque témoin (relevés en dépôt : aucune requête) et confronte la journée
 * et le 6 jours adulte. Un écart de plus de 30 % est à vérifier ; rien n'est
 * modifié.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STATIONS } from "../src/lib/stations.ts";
import type { FichierGrilles, GrilleTarifaire } from "../src/lib/forfaits/tarifsPeriode.ts";
import { texteConfrontation, type Confrontation } from "../src/lib/forfaits/verification.ts";
import { chargerTemoins, verifierAvecTemoins } from "./temoins-forfaits.ts";

const RACINE = resolve(import.meta.dirname, "..");

const args = process.argv.slice(2);
const i = args.indexOf("--station");
const seule = i >= 0 ? args[i + 1] : null;

const fichier = (chemin: string): GrilleTarifaire[] =>
  existsSync(resolve(RACINE, chemin))
    ? (JSON.parse(readFileSync(resolve(RACINE, chemin), "utf8")) as FichierGrilles).grilles
    : [];
const officielles = fichier("src/lib/forfaits/grillesOfficielles.json");
const migrees = fichier("src/lib/forfaits/grillesMigrees.json");
const grilles = [...officielles, ...migrees].filter((g) => !seule || g.stationIds.includes(seule));

const temoins = chargerTemoins();
console.log(`Grilles lues : ${officielles.length} officielles, ${migrees.length} migrées`);
for (const t of temoins)
  console.log(
    `  ${t.nom} (relevé du ${t.releve}) : ${t.rattachees} stations rattachées sur ${STATIONS.length}`,
  );
if (!temoins.some((t) => t.nom === "skipass.com"))
  console.log("  skipass.com : pas encore relevé (npm run forfaits:skipass)");

const resultats: Confrontation[] = grilles.flatMap((g) => verifierAvecTemoins(g, temoins));
for (const t of temoins) {
  const r = resultats.filter((c) => c.site === t.nom);
  const alertes = r.filter((c) => c.alerte).length;
  const dans = r.filter((c) => c.comparaisons.every((x) => x.ecart === 0)).length;
  console.log(
    `\n${t.nom} : ${r.length} confrontations, ${dans} dans la fourchette, ${r.length - dans - alertes} à moins de 30 %, ${alertes} au-delà`,
  );
  for (const c of r.filter((c) => c.alerte || seule)) console.log(`  ${texteConfrontation(c)}`);
}
