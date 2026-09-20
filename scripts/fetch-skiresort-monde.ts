/**
 * Le relevé skiresort.fr — la troisième source, et la seule qui couvre l'Asie.
 *
 *     node --experimental-strip-types scripts/fetch-skiresort-monde.ts
 *     node --experimental-strip-types scripts/fetch-skiresort-monde.ts --completer
 *     node --experimental-strip-types scripts/fetch-skiresort-monde.ts --essai 10
 *
 * Écrit `src/lib/monde/data/skiresort.json`. 6 816 stations au sitemap, dont
 * 1 262 en Asie — là où OpenSkiMap ne compte aucune piste et où Skiinfo ne va
 * pas.
 *
 * ## Ce que le site autorise
 *
 * `robots.txt`, lu le 20 septembre 2026 : `Allow: /`, sans `Crawl-delay`. Sont
 * interdits `/iframe/`, `/ajax/`, `/outbound/`, `/staticpages/` et surtout
 * **la recherche**, sous toutes ses langues — qu'on n'emploie donc pas : c'est
 * le sitemap publié qui donne l'inventaire, ce pour quoi il existe.
 *
 * La cadence est celle de `politesse.ts`, deux secondes, une requête à la
 * fois, et l'en-tête dit ce que le programme est.
 *
 * ## Trois niveaux, et pas quatre couleurs
 *
 * **Le point qui compte, et qu'il ne faut pas lisser.** Le site classe en
 * « Faciles / Moyennes / Difficiles » ; le dépôt compte en vert, bleu, rouge
 * et noir. « Faciles » fond le vert et le bleu, et rien ici ne permet de les
 * séparer.
 *
 * Ce relevé **ne les sépare donc pas**. Il écrit ce que le site écrit, dans
 * ses trois niveaux, et laisse à la lecture le soin d'en tirer quatre couleurs
 * si elle le décide — auquel cas la valeur dérivée doit se dire estimée, parce
 * qu'elle le sera. Un relevé qui incorporerait la règle de répartition ne
 * serait plus un relevé.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const SORTIE = resolve(DATA, "skiresort.json");
const BASE = "https://www.skiresort.fr";
const INDEX = `${BASE}/sitemapindex_fr.xml`;

const INTERVALLE_MS = 2_000;
const TIMEOUT_MS = 25_000;
const REESSAIS = 2;
const SAUVE_TOUS = 50;

const UA =
  "Skitrack/1.0 (relevé de référentiel de stations de ski ; robot applicatif, " +
  "une requête à la fois, 2 s entre deux ; lit le sitemap publié, pas la recherche)";

class Refus extends Error {}

type Fiche = {
  slug: string;
  nom: string | null;
  continent: string | null;
  pays: string | null;
  region: string | null;
  basM: number | null;
  sommetM: number | null;
  denivM: number | null;
  kmTotal: number | null;
  /** Les trois niveaux du site, en kilomètres. « Faciles » fond vert et bleu. */
  kmFaciles: number | null;
  kmMoyennes: number | null;
  kmDifficiles: number | null;
  remontees: number | null;
  /** Le point de la localité la plus proche du domaine, faute d'un point du
   *  domaine lui-même. Voir `position()`. */
  lat: number | null;
  lon: number | null;
  localite: string | null;
  /** Distance annoncée entre cette localité et le domaine, en km. */
  localiteKm: number | null;
};

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function page(url: string): Promise<string | null> {
  for (let essai = 1; essai <= REESSAIS; essai++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "text/html,application/xml" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429 || res.status === 503) {
        throw new Refus(`${res.status} — ${(await res.text()).replace(/\s+/g, " ").slice(0, 120)}`);
      }
      if (res.status === 404) return null;
      if (!res.ok) {
        console.error(`  HTTP ${res.status} sur ${url}`);
        return null;
      }
      return await res.text();
    } catch (err) {
      if (err instanceof Refus) throw err;
      if (essai === REESSAIS) {
        console.error(`  ${url} : ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
      await dormir(3_000 * essai);
    }
  }
  return null;
}

/** Le texte de la page, balises réduites à des séparateurs. */
function aplatir(html: string): string {
  const sansScript = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ");
  return sansScript
    .replace(/<[^>]+>/g, " | ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8203;/g, "")
    .replace(/\s+/g, " ")
    // Une balise vide en produit un par balise : « Altitude | | | 1360 m ».
    // On les réduit à un seul, pour que les expressions ci-dessous n'aient pas
    // à compter des séparateurs qui ne veulent rien dire.
    .replace(/(?:\s*\|\s*)+/g, " | ");
}

const nombre = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = Number(s.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * Le point du domaine, tiré des liens d'hébergement.
 *
 * Le site ne publie pas de coordonnées pour le domaine lui-même. Il liste en
 * revanche les localités voisines, chacune avec sa distance et un lien
 * d'affiliation qui porte sa latitude et sa longitude. On retient **la plus
 * proche**, et on garde sa distance : un point à 0,2 km du domaine n'est pas
 * le domaine, et l'écart doit rester visible.
 */
function position(html: string): Pick<Fiche, "lat" | "lon" | "localite" | "localiteKm"> {
  let best: { lat: number; lon: number; nom: string | null; km: number } | null = null;
  const re =
    /latitude=(-?\d+\.\d+)&amp;longitude=(-?\d+\.\d+)[^"]*"[^>]*data-open="([^"]*?)\s*\(([\d,.]+)\s*km\)/g;
  for (const m of html.matchAll(re)) {
    const km = nombre(m[4]) ?? 999;
    if (!best || km < best.km) {
      best = { lat: Number(m[1]), lon: Number(m[2]), nom: m[3].trim() || null, km };
    }
  }
  if (!best) {
    const m = /latitude=(-?\d+\.\d+)&amp;longitude=(-?\d+\.\d+)/.exec(html);
    if (m) return { lat: Number(m[1]), lon: Number(m[2]), localite: null, localiteKm: null };
    return { lat: null, lon: null, localite: null, localiteKm: null };
  }
  return { lat: best.lat, lon: best.lon, localite: best.nom, localiteKm: best.km };
}

function lire(slug: string, html: string): Fiche {
  const t = aplatir(html);
  const titre = /<title>\s*(?:Domaine skiable\s*)?([^<]+?)\s*<\/title>/.exec(html);
  const fil = [...html.matchAll(/itemprop="name"[^>]*>([^<]+)/g)].map((m) => m[1].trim());

  const alt = /Altitude du domaine \| (-?\d+) m - (-?\d+) m \(Dénivelé (\d+) m\)/.exec(t);
  const total = /Total ?: (\d+[.,]?\d*) km/.exec(t);
  const niveau = (nom: string) =>
    nombre(new RegExp(`${nom} \\| (\\d+[.,]?\\d*) km`).exec(t)?.[1]);
  const rem = /Remontées mécaniques » \| Total ?: (\d+)/.exec(t);

  return {
    slug,
    nom: titre?.[1] ?? null,
    // « Monde | Europe | Autriche | Tyrol | … » : le fil donne les trois.
    continent: fil[1] ?? null,
    pays: fil[2] ?? null,
    region: fil[3] ?? null,
    basM: nombre(alt?.[1]),
    sommetM: nombre(alt?.[2]),
    denivM: nombre(alt?.[3]),
    kmTotal: nombre(total?.[1]),
    kmFaciles: niveau("Faciles"),
    kmMoyennes: niveau("Moyennes"),
    kmDifficiles: niveau("Difficiles"),
    remontees: nombre(rem?.[1]),
    ...position(html),
  };
}

async function slugs(): Promise<string[]> {
  const idx = await page(INDEX);
  if (!idx) throw new Error("index de sitemap illisible");
  const sous = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const vus = new Set<string>();
  for (const s of sous) {
    await dormir(INTERVALLE_MS);
    const xml = await page(s);
    if (!xml) continue;
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const seg = m[1].split("/");
      if (seg[3] === "domaine-skiable" && seg[4]) vus.add(seg[4]);
    }
  }
  return [...vus].sort();
}

function acquis(): Record<string, Fiche> {
  try {
    return (JSON.parse(readFileSync(SORTIE, "utf8")) as { fiches?: Record<string, Fiche> }).fiches ?? {};
  } catch {
    return {};
  }
}

function ecrire(fiches: Record<string, Fiche>, total: number): void {
  const vals = Object.values(fiches);
  writeFileSync(
    SORTIE,
    JSON.stringify(
      {
        releve: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        source: BASE,
        robots: "Allow: / — recherche interdite, sitemap publié ; lu le 20 septembre 2026",
        echelle:
          "trois niveaux — Faciles (vert + bleu fondus), Moyennes (rouge), Difficiles (noir). " +
          "La séparation du vert et du bleu n'existe pas dans cette source.",
        stations: vals.length,
        attendues: total,
        avecRepartition: vals.filter((f) => f.kmFaciles != null || f.kmMoyennes != null).length,
        avecPosition: vals.filter((f) => f.lat != null).length,
        fiches,
      },
      null,
      1,
    ) + "\n",
    "utf8",
  );
}

async function main(): Promise<number> {
  const completer = process.argv.includes("--completer");
  const iEssai = process.argv.indexOf("--essai");

  console.log("robots.txt de skiresort.fr : Allow: /, recherche interdite, sitemap publié.");
  console.log("Cadence : une requête toutes les 2 s, une à la fois.");
  console.log("");

  const toutes = await slugs();
  const deja = completer ? acquis() : {};
  let restantes = toutes.filter((s) => !deja[s]);
  if (iEssai > 0) restantes = restantes.slice(0, Number(process.argv[iEssai + 1] ?? 10));

  console.log(`${toutes.length} stations au sitemap.`);
  if (completer) console.log(`${Object.keys(deja).length} déjà relevées.`);
  console.log(`${restantes.length} à relever — environ ${Math.round((restantes.length * INTERVALLE_MS) / 60000)} min.`);
  console.log("");

  const fiches = { ...deja };
  let faites = 0;
  let refus: string | null = null;
  const debut = Date.now();

  for (const slug of restantes) {
    try {
      const h = await page(`${BASE}/domaine-skiable/${slug}/`);
      await dormir(INTERVALLE_MS);
      if (!h) continue;
      fiches[slug] = lire(slug, h);
      faites++;
    } catch (err) {
      if (!(err instanceof Refus)) throw err;
      refus = err.message;
      console.log("");
      console.log(`  arrêté par le site : ${refus}`);
      break;
    }
    if (faites % SAUVE_TOUS === 0) {
      ecrire(fiches, toutes.length);
      process.stdout.write(`\r  ${faites}/${restantes.length}`);
    }
  }
  console.log("");
  ecrire(fiches, toutes.length);

  const vals = Object.values(fiches);
  console.log(`${vals.length} fiches sur ${toutes.length}, en ${Math.round((Date.now() - debut) / 60000)} min.`);
  console.log(`${vals.filter((f) => f.kmFaciles != null || f.kmMoyennes != null).length} portent une répartition.`);
  console.log(`${vals.filter((f) => f.lat != null).length} portent une position.`);
  if (refus) {
    console.log("Quand le site le permettra de nouveau :");
    console.log("  node --experimental-strip-types scripts/fetch-skiresort-monde.ts --completer");
  }
  return 0;
}

main().then((c) => {
  process.exitCode = c;
});
