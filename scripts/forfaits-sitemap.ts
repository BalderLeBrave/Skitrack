/**
 * Pages tarifs des domaines, découvertes par leur sitemap.
 *
 *   npm run forfaits:sitemap                          # les 173 domaines
 *   npm run forfaits:sitemap -- --source tignes-val-d-isere,auron
 *   npm run forfaits:sitemap -- --lire                # et lit les pages trouvées
 *   npm run forfaits:sitemap -- --lire --lecteur firecrawl
 *
 * Écrit `src/lib/forfaits/pagesTarifs.json` (essayé par `refresh.server.ts`
 * avant les chemins devinés) et `docs/sources/forfaits-sitemap-<date>.json`
 * (rapport). robots.txt est respecté pour chaque sitemap et chaque page ; un
 * refus (401, 403, 429) arrête le domaine.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FORFAIT_CATALOG } from "../src/lib/forfaits/catalog.ts";
import { extractForfaits } from "../src/lib/forfaits/extract.ts";
import { forfaitDepuisFirecrawl, PROMPT_FORFAIT, SCHEMA_FORFAIT } from "../src/lib/forfaits/firecrawlForfait.ts";
import { grilleCoherente, MAX_DECOUVERTES, type PagesTarifs } from "../src/lib/forfaits/pagesTarifs.ts";
import { demander, verdictPoli } from "../src/lib/scrape/politesse.ts";
import { decouvrirParSitemap } from "../src/lib/scrape/sitemap.server.ts";
import { scoreTarifs } from "../src/lib/scrape/sitemap.ts";
import { cleFirecrawl, lireAvecFirecrawl } from "../src/lib/scrape/firecrawl.server.ts";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const FICHIER = join(RACINE, "src/lib/forfaits/pagesTarifs.json");

function option(nom: string): string | null {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : null;
}
const sources = option("source")?.split(",").filter(Boolean) ?? null;
const lire = process.argv.includes("--lire");
const lecteur = option("lecteur") ?? (cleFirecrawl() ? "firecrawl" : "lecture");
const concurrence = Math.max(1, Number(option("concurrence") ?? "6") || 6);

const domaines = FORFAIT_CATALOG.filter((d) => d.website && (!sources || sources.includes(d.slug)));

type Ligne = {
  slug: string;
  website: string;
  sitemaps: number;
  vues: number;
  pages: string[];
  interditsRobots: number;
  racineInterdite: boolean;
  refus: number | null;
  lu?: { url: string; j1: number | null; j6: number | null; enf6: number | null; kind: string } | null;
  erreurs: string[];
};

async function traiter(d: (typeof domaines)[number]): Promise<Ligne> {
  const site = d.website!.startsWith("http") ? d.website! : `https://${d.website}`;
  const dec = await decouvrirParSitemap(site, "tarifs", { maxSitemaps: 25, maxUrls: 3_000 });
  const pages = dec.urls
    .map((u) => ({ u, s: scoreTarifs(u) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.u.length - b.u.length)
    .slice(0, MAX_DECOUVERTES)
    .map((x) => x.u);
  const l: Ligne = {
    slug: d.slug,
    website: site,
    sitemaps: dec.sitemaps.length,
    vues: dec.vues,
    pages,
    interditsRobots: dec.interditsRobots,
    racineInterdite: dec.racineInterdite,
    refus: dec.refus,
    erreurs: dec.erreurs.slice(0, 5),
  };
  if (lire && !dec.refus) {
    l.lu = null;
    for (const url of pages) {
      if (lecteur === "firecrawl") {
        const r = await lireAvecFirecrawl(url, { schema: SCHEMA_FORFAIT, prompt: PROMPT_FORFAIT, markdown: true });
        if (!r.ok) {
          l.erreurs.push(`${url} : ${r.detail}`);
          if (r.raison === "refus") break;
          continue;
        }
        const x = forfaitDepuisFirecrawl(r.page.json) ?? (r.page.markdown ? extractForfaits(r.page.markdown) : null);
        if (x && grilleCoherente(x)) {
          l.lu = { url, ...x };
          break;
        }
      } else {
        const v = await verdictPoli(url);
        if (!v.autorise) continue;
        const p = await demander(url, undefined, v.delaiMs);
        if (p.status === 401 || p.status === 403 || p.status === 429) {
          l.erreurs.push(`${url} : refus ${p.status}`);
          break;
        }
        if (!p.ok) continue;
        const x = extractForfaits(p.text);
        if (x && grilleCoherente(x)) {
          l.lu = { url, ...x };
          break;
        }
      }
    }
  }
  return l;
}

const lignes: Ligne[] = [];
let suivant = 0;
async function ouvrier() {
  while (suivant < domaines.length) {
    const d = domaines[suivant++];
    try {
      const l = await traiter(d);
      lignes.push(l);
      console.log(
        `${d.slug.padEnd(34)} ${String(l.pages.length).padStart(2)} page(s)${l.lu ? ` · lu ${l.lu.j1 ?? "—"} / ${l.lu.j6 ?? "—"} €` : ""}${l.refus ? ` · refus ${l.refus}` : ""}${l.racineInterdite ? " · robots" : ""}`,
      );
    } catch (e) {
      console.log(`${d.slug.padEnd(34)} erreur : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
await Promise.all(Array.from({ length: concurrence }, ouvrier));
lignes.sort((a, b) => a.slug.localeCompare(b.slug));

const avant: PagesTarifs = JSON.parse(readFileSync(FICHIER, "utf8"));
const pagesOut: Record<string, string[]> = { ...avant.pages };
for (const l of lignes) {
  if (l.pages.length) pagesOut[l.slug] = l.pages;
  else delete pagesOut[l.slug];
}
const at = new Date().toISOString();
const trie = Object.fromEntries(Object.entries(pagesOut).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(FICHIER, JSON.stringify({ at, source: "npm run forfaits:sitemap", pages: trie }, null, 2) + "\n");

const jour = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const rapport = join(RACINE, "docs/sources", `forfaits-sitemap-${jour}.json`);
mkdirSync(dirname(rapport), { recursive: true });
const bilan = {
  domaines: lignes.length,
  avecSitemap: lignes.filter((l) => l.sitemaps > 0).length,
  avecPageTarifs: lignes.filter((l) => l.pages.length > 0).length,
  lus: lignes.filter((l) => l.lu).length,
  refus: lignes.filter((l) => l.refus).length,
  robots: lignes.filter((l) => l.racineInterdite).length,
};
writeFileSync(rapport, JSON.stringify({ at, lecteur: lire ? lecteur : null, bilan, domaines: lignes }, null, 2) + "\n");
console.log(`\n${JSON.stringify(bilan)}\nÉcrit : ${FICHIER}\n        ${rapport}`);
