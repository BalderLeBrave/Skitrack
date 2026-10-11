/**
 * Extraction complète des centrales sans connecteur.
 *
 *   npm run catalogue:centrales                        # toutes les cibles
 *   npm run catalogue:centrales -- --hote www.sancy.com --max 50
 *   npm run catalogue:centrales -- --lecteur firecrawl --decouverte sitemap,carte,parcours
 *   npm run catalogue:centrales -- --lister            # cibles seules, sans requête
 *   npm run catalogue:centrales -- --concurrence 5     # cinq hôtes à la fois
 *
 * Écrit `scrape/catalogue/sortie/<hôte>.json` (fiches) et
 * `scrape/catalogue/sortie/resume.json` (bilan par hôte). Le lecteur
 * Firecrawl est pris si `FIRECRAWL_API_KEY` est posée, la lecture directe
 * sinon. robots.txt est respecté : une page interdite n'est pas lue, un
 * refus du serveur arrête l'hôte.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ciblesSansConnecteur,
  extraireCatalogue,
  type Decouvreur,
  type Lecteur,
} from "../../src/lib/scrape/catalogue.server.ts";

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = process.env.SKITRACK_CATALOGUE_SORTIE ?? join(ICI, "sortie");

function option(nom: string): string | null {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : null;
}

const hotes = option("hote")?.split(",").filter(Boolean) ?? null;
const max = Number(option("max") ?? "") || undefined;
const lecteur = (option("lecteur") ?? "auto") as Lecteur;
const decouverte = option("decouverte")?.split(",").filter(Boolean) as Decouvreur[] | undefined;
// Plusieurs hôtes à la fois : chacun garde sa propre file polie
// (`dansLaFile`, une requête à la fois par hôte, au Crawl-delay publié).
const concurrence = Math.max(1, Number(option("concurrence") ?? "1") || 1);

const cibles = ciblesSansConnecteur().filter((c) => !hotes || hotes.includes(c.host));

if (process.argv.includes("--lister")) {
  for (const c of cibles) console.log(`${c.host.padEnd(36)} ${c.moteur.padEnd(12)} ${c.nom} (${c.stations.join(", ")})`);
  process.exit(0);
}

mkdirSync(SORTIE, { recursive: true });
const resume: Array<Record<string, unknown>> = [];
async function traiter(c: (typeof cibles)[number]) {
  process.stdout.write(`${c.host} (${c.moteur}) …\n`);
  const r = await extraireCatalogue(c, {
    lecteur,
    decouverte,
    maxFiches: max,
    surFiche: (n, total) => {
      if (concurrence === 1 && (n % 10 === 0 || n === total)) process.stdout.write(`  ${n}/${total}\r`);
    },
  });
  writeFileSync(join(SORTIE, `${c.host}.json`), JSON.stringify(r, null, 2) + "\n");
  const ligne = {
    host: c.host,
    moteur: c.moteur,
    stations: c.stations,
    methode: r.methode,
    lecteur: r.lecteur,
    urls: r.urls,
    fiches: r.fiches.length,
    muettes: r.muettes,
    avecCapacite: r.fiches.filter((f) => f.capacite != null).length,
    avecChambres: r.fiches.filter((f) => f.chambres != null).length,
    avecGps: r.fiches.filter((f) => f.lat != null).length,
    avecPhoto: r.fiches.filter((f) => f.photos.length > 0).length,
    avecTarif: r.fiches.filter((f) => f.tarifs.some((t) => !t.plancher)).length,
    avecTotalDate: r.fiches.filter((f) => f.totalSejour).length,
    interditsRobots: r.interditsRobots,
    refus: r.refus,
    erreurs: r.erreurs.length,
  };
  resume.push(ligne);
  console.log(
    `${c.host} : ${ligne.fiches} fiches sur ${ligne.urls} URL · capacité ${ligne.avecCapacite} · chambres ${ligne.avecChambres} · GPS ${ligne.avecGps} · photo ${ligne.avecPhoto} · tarif ${ligne.avecTarif} · robots ${ligne.interditsRobots} · refus ${ligne.refus}`,
  );
}
let suivant = 0;
await Promise.all(
  Array.from({ length: concurrence }, async () => {
    while (suivant < cibles.length) await traiter(cibles[suivant++]);
  }),
);
resume.sort((a, b) => String(a.host).localeCompare(String(b.host)));
writeFileSync(join(SORTIE, "resume.json"), JSON.stringify({ at: new Date().toISOString(), hotes: resume }, null, 2) + "\n");
console.log(`\nÉcrit : ${SORTIE}`);
