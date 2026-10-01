/**
 * Le relevé du témoin skipass.com : les prix de forfaits qu'il publie pour
 * les stations françaises.
 *
 *     node --experimental-strip-types scripts/releve-temoins-skipass.ts
 *
 * Lit la liste « Prix des forfaits de ski » (https://www.skipass.com/prix-forfait-ski/),
 * puis la page de prix de chaque station qu'elle cite, et écrit
 * `src/lib/forfaits/temoins/skipass.json`. Un témoin, pas une source de prix :
 * `verifier-grilles-temoins.ts` et le relevé officiel s'en servent pour
 * signaler les écarts.
 *
 * ## Politesse
 *
 * Celle du relevé (`src/lib/scrape/politesse.ts`) : robots.txt lu et respecté
 * pour chaque page (skipass.com n'interdit que /admin/, /utils/ et /go/ ; lu le
 * 30 septembre 2026), une requête à la fois, deux secondes au moins entre deux.
 * Un refus arrête le relevé : rien n'est contourné.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  lireForfaitSkipass,
  lireListeSkipass,
  type FicheSkipass,
} from "../src/lib/forfaits/temoins.ts";
import { lignesDepuisHtml } from "../src/lib/forfaits/texteStructure.ts";
import { demander, verdictPoli } from "../src/lib/scrape/politesse.ts";
import { FICHIER_SKIPASS } from "./temoins-forfaits.ts";

const RACINE = resolve(import.meta.dirname, "..");
const SORTIE = resolve(RACINE, FICHIER_SKIPASS);
const LISTE = "https://www.skipass.com/prix-forfait-ski/";

async function lire(url: string): Promise<{ html: string } | { echec: string }> {
  const v = await verdictPoli(url);
  if (v.autorise === false) return { echec: `interdit par robots.txt (${v.regle})` };
  try {
    const r = await demander(url, undefined, v.delaiMs);
    if ([401, 403, 429].includes(r.status)) return { echec: `refus HTTP ${r.status}` };
    if (!r.ok) return { echec: `HTTP ${r.status}` };
    return { html: r.text };
  } catch (err) {
    return { echec: err instanceof Error ? err.message : String(err) };
  }
}

const liste = await lire(LISTE);
if ("echec" in liste) {
  console.error(`Liste illisible : ${LISTE} : ${liste.echec}`);
  process.exit(1);
}
const pages = lireListeSkipass(liste.html);
console.log(`skipass.com : ${pages.length} page(s) de prix citée(s)`);

const fiches: FicheSkipass[] = [];
const echecs: string[] = [];
for (const p of pages) {
  const r = await lire(p.url);
  if ("echec" in r) {
    echecs.push(`${p.nom} : ${p.url} : ${r.echec}`);
    console.log(`  ${p.nom} : ${r.echec}`);
    if (/refus|interdit/.test(r.echec)) break;
    continue;
  }
  const f = lireForfaitSkipass(lignesDepuisHtml(r.html), p);
  fiches.push(f);
  console.log(
    `  ${p.nom} : ${f.lignes.length ? f.lignes.map((l) => l.duree).join(", ") : "aucun prix publié"}`,
  );
}

const avecPrix = fiches.filter((f) => f.lignes.length);
mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(
  SORTIE,
  `${JSON.stringify(
    {
      releve: new Date().toISOString(),
      source: LISTE,
      robots: "Disallow: /admin/, /utils/, /go/ ; pages de prix lues une à une, 2 s entre deux",
      pages: pages.length,
      avecPrix: avecPrix.length,
      echecs,
      fiches: avecPrix,
    },
    null,
    1,
  )}\n`,
);
console.log(`\nÉcrit ${SORTIE} : ${avecPrix.length} station(s) avec prix sur ${pages.length}`);
if (echecs.length) console.log(`Échecs : ${echecs.length}`);
