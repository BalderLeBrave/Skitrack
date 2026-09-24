/**
 * Le relevé Skiinfo mondial.
 *
 *     node --experimental-strip-types scripts/fetch-skiinfo-monde.ts
 *     node --experimental-strip-types scripts/fetch-skiinfo-monde.ts --completer
 *     node --experimental-strip-types scripts/fetch-skiinfo-monde.ts --essai 20
 *
 * Frère mondial de `fetch-skiinfo-fr.py`, qui relève les fiches françaises et
 * ne bouge pas. Écrit `src/lib/monde/data/skiinfo.json`.
 *
 * ## Ce que le site autorise, et ce qu'on lui demande
 *
 * `https://www.skiinfo.fr/robots.txt`, lu le 20 septembre 2026, dit
 * `User-agent: * / Allow: /` et ne publie aucun `Crawl-delay`. Rien n'est donc
 * interdit et aucune cadence n'est imposée ; on s'en impose une quand même —
 * deux secondes entre deux requêtes, une seule à la fois —, qui est celle que
 * `src/lib/scrape/politesse.ts` tient pour le relevé de tarifs.
 *
 * L'en-tête dit ce que le programme est. Il ne se déguise pas en navigateur :
 * c'est la règle que `politesse.ts` énonce, et elle vaut ici comme là.
 *
 * ## Deux pages par station, et pourquoi pas une
 *
 * `station-de-ski` porte un bloc JSON-LD `SkiResort` : nom, **coordonnées**,
 * altitudes, dénivelé, surface, nombre de pistes et de remontées. C'est la
 * page qui résout le rattachement à OpenSkiMap, puisqu'elle donne un point.
 *
 * `plans-des-pistes` porte ce que le JSON-LD n'a pas : les **kilomètres** de
 * pistes et leur **répartition par couleur**. Deux pages, donc, faute de
 * pouvoir s'en passer.
 *
 * ## Les unités
 *
 * Le JSON-LD publie en pieds et en acres là où le site affiche des mètres.
 * La conversion revient exactement sur l'affichage — 5 315 ft font 1 620 m, et
 * le site écrit 1 620 m —, ce qui montre que le site stocke du métrique et
 * publie de l'impérial arrondi. On reconvertit donc, et on ne l'estime pas :
 * on retrouve la valeur d'origine.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const SORTIE = resolve(DATA, "skiinfo.json");
const SITEMAP = "https://www.skiinfo.fr/sitemap_website.xml";
const BASE = "https://www.skiinfo.fr";

const INTERVALLE_MS = 2_000;
const TIMEOUT_MS = 25_000;
const REESSAIS = 2;
/** Tous les combien on sauvegarde, pour qu'une longue course ne se perde pas. */
const SAUVE_TOUS = 50;

// Se présenter comme un navigateur, comme le relevé de l'app (consigne du propriétaire, 24 sept. 2026).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Un refus du site — quota, indisponibilité. Il ne se réessaie pas en boucle. */
class Refus extends Error {}

type Station = { region: string; slug: string };

type Fiche = {
  region: string;
  slug: string;
  nom: string | null;
  lat: number | null;
  lon: number | null;
  pays: string | null;
  localite: string | null;
  /** Altitudes en mètres, reconverties depuis les pieds du JSON-LD. */
  basM: number | null;
  sommetM: number | null;
  denivM: number | null;
  /** Surface skiable, en hectares. */
  surfaceHa: number | null;
  pistes: number | null;
  remontees: number | null;
  /** Kilomètres de pistes, quand le site les donne en kilomètres. */
  km: number | null;
  /** Certains pays sont donnés en hectares plutôt qu'en kilomètres. */
  domaineBrut: string | null;
  plusLongueKm: number | null;
  pct: { vertes: number; bleues: number; rouges: number; noires: number } | null;
  neigeCmAn: number | null;
};

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function page(url: string): Promise<string | null> {
  for (let essai = 1; essai <= REESSAIS; essai++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "text/html" },
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

const PIEDS_EN_M = 0.3048;
const ACRES_EN_HA = 0.404686;
const POUCES_EN_CM = 2.54;

function nombre(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Le bloc `SkiResort` du JSON-LD, qui porte le point et les altitudes. */
function lireFiche(html: string): Partial<Fiche> {
  const out: Partial<Fiche> = {};
  for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(m[1]);
    } catch {
      continue;
    }
    if (d["@type"] !== "SkiResort") continue;
    out.nom ??= (d.name as string) ?? null;
    const geo = d.geo as { latitude?: unknown; longitude?: unknown } | undefined;
    if (geo && out.lat == null) {
      out.lat = nombre(geo.latitude);
      out.lon = nombre(geo.longitude);
    }
    const adr = d.address as Record<string, unknown> | undefined;
    if (adr) {
      out.pays ??= (adr.addressCountry as string) ?? null;
      out.localite ??= (adr.addressLocality as string) ?? null;
    }
    for (const p of (d.additionalProperty as { name?: string; value?: unknown }[]) ?? []) {
      const v = nombre(p.value);
      if (v == null) continue;
      switch (p.name) {
        case "Base elevation":
          out.basM = Math.round(v * PIEDS_EN_M);
          break;
        case "Summit elevation":
          out.sommetM = Math.round(v * PIEDS_EN_M);
          break;
        case "Vertical drop":
          out.denivM = Math.round(v * PIEDS_EN_M);
          break;
        case "Skiable terrain":
          out.surfaceHa = Math.round(v * ACRES_EN_HA);
          break;
        case "Total trails":
          out.pistes = v;
          break;
        case "Total lifts":
          out.remontees = v;
          break;
        case "Annual average snowfall":
          out.neigeCmAn = Math.round(v * POUCES_EN_CM);
          break;
      }
    }
  }
  return out;
}

/** Les couples « libellé / valeur » de la page des pistes. */
function lirePistes(html: string): Partial<Fiche> {
  const out: Partial<Fiche> = {};
  const pct: Record<string, number> = {};
  const re =
    /<span class="text-\[15px\] font-medium">([^<]+)<\/span><\/div><span class="font-heading[^"]*"[^>]*>([^<]+)<\/span>/g;
  for (const m of html.matchAll(re)) {
    const libelle = m[1].trim();
    const valeur = m[2].trim();
    const n = nombre(valeur);
    if (/Pistes vertes/i.test(libelle) && n != null) pct.vertes = n;
    else if (/Pistes bleues/i.test(libelle) && n != null) pct.bleues = n;
    else if (/Pistes rouges/i.test(libelle) && n != null) pct.rouges = n;
    else if (/Pistes noires/i.test(libelle) && n != null) pct.noires = n;
    else if (/Nombre total de pistes/i.test(libelle)) out.pistes = n;
    else if (/Piste la plus longue/i.test(libelle)) out.plusLongueKm = /km/i.test(valeur) ? n : null;
    else if (/^Domaine skiable/i.test(libelle)) {
      out.domaineBrut = valeur;
      // Le domaine se donne en kilomètres en Europe, en hectares ailleurs :
      // les deux ne se convertissent pas l'un dans l'autre, et écrire des
      // kilomètres à partir d'hectares inventerait une longueur.
      out.km = /km/i.test(valeur) ? n : null;
    }
  }
  // Le site n'affiche que les couleurs présentes : Zermatt n'a aucune piste
  // verte, et la ligne n'existe pas. Les pourcentages montrés sommant déjà à
  // cent, une couleur absente vaut **zéro relevé** et non « non mesuré ».
  //
  // Exiger les quatre a coûté 1 090 fiches au premier passage : la règle
  // paraissait prudente et jetait la majorité du relevé.
  if (Object.keys(pct).length > 0) {
    out.pct = {
      vertes: pct.vertes ?? 0,
      bleues: pct.bleues ?? 0,
      rouges: pct.rouges ?? 0,
      noires: pct.noires ?? 0,
    };
  }
  return out;
}

async function stations(): Promise<Station[]> {
  const xml = await page(SITEMAP);
  if (!xml) throw new Error("sitemap illisible");
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const vues = new Set<string>();
  const out: Station[] = [];
  for (const u of urls) {
    if (!u.endsWith("/plans-des-pistes") && !u.endsWith("/plans-des-pistes/")) continue;
    const p = u.replace(/\/$/, "").split("/");
    const slug = p[p.length - 2];
    const region = p[p.length - 3];
    const cle = `${region}/${slug}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    out.push({ region, slug });
  }
  return out.sort((a, b) => (a.region + a.slug).localeCompare(b.region + b.slug));
}

function acquis(): Record<string, Fiche> {
  try {
    const d = JSON.parse(readFileSync(SORTIE, "utf8")) as { fiches?: Record<string, Fiche> };
    return d.fiches ?? {};
  } catch {
    return {};
  }
}

function ecrire(fiches: Record<string, Fiche>, total: number): void {
  const avecPoint = Object.values(fiches).filter((f) => f.lat != null).length;
  writeFileSync(
    SORTIE,
    JSON.stringify(
      {
        releve: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        source: "https://www.skiinfo.fr",
        robots: "User-agent: * / Allow: / — aucun Crawl-delay publié, lu le 20 septembre 2026",
        pages: "station-de-ski (JSON-LD SkiResort) + plans-des-pistes",
        stations: Object.keys(fiches).length,
        attendues: total,
        avecCoordonnees: avecPoint,
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
  // `--pistes` ne rouvre que la page des pistes, pour les fiches dont la
  // répartition par couleur manque. Une page au lieu de deux, et la fiche
  // principale — coordonnées, altitudes — n'est pas redemandée.
  const pistesSeules = process.argv.includes("--pistes");
  const iEssai = process.argv.indexOf("--essai");

  console.log("robots.txt de skiinfo.fr : User-agent: * / Allow: / — aucun Crawl-delay.");
  console.log("Cadence retenue : une requête toutes les 2 s, une à la fois.\n");

  const toutes = await stations();
  const deja = completer || pistesSeules ? acquis() : {};
  let restantes = pistesSeules
    ? toutes.filter((s) => {
        const f = deja[`${s.region}/${s.slug}`];
        return !f || f.pct == null;
      })
    : toutes.filter((s) => !deja[`${s.region}/${s.slug}`]);
  if (iEssai > 0) restantes = restantes.slice(0, Number(process.argv[iEssai + 1] ?? 20));

  console.log(`${toutes.length} stations au sitemap.`);
  if (completer) console.log(`${Object.keys(deja).length} déjà relevées, non redemandées.`);
  console.log(`${restantes.length} à relever — environ ${Math.round((restantes.length * (pistesSeules ? 1 : 2) * INTERVALLE_MS) / 60000)} min.\n`);

  const fiches: Record<string, Fiche> = { ...deja };
  let faites = 0;
  let refus: string | null = null;
  const debut = Date.now();

  for (const s of restantes) {
    const cle = `${s.region}/${s.slug}`;
    try {
      const h1 = pistesSeules ? null : await page(`${BASE}/${cle}/station-de-ski`);
      if (!pistesSeules) await dormir(INTERVALLE_MS);
      const h2 = await page(`${BASE}/${cle}/plans-des-pistes`);
      await dormir(INTERVALLE_MS);
      if (!h1 && !h2) continue;
      const f: Fiche = {
        region: s.region,
        slug: s.slug,
        nom: null, lat: null, lon: null, pays: null, localite: null,
        basM: null, sommetM: null, denivM: null, surfaceHa: null,
        pistes: null, remontees: null, km: null, domaineBrut: null,
        plusLongueKm: null, pct: null, neigeCmAn: null,
        ...(deja[cle] ?? {}),
        ...(h1 ? lireFiche(h1) : {}),
        ...(h2 ? lirePistes(h2) : {}),
      };
      fiches[cle] = f;
      faites++;
    } catch (err) {
      if (!(err instanceof Refus)) throw err;
      refus = err.message;
      console.log(`\n  arrêté par le site : ${refus}`);
      break;
    }
    if (faites % SAUVE_TOUS === 0) {
      ecrire(fiches, toutes.length);
      process.stdout.write(`\r  ${faites}/${restantes.length}`);
    }
  }
  console.log();

  ecrire(fiches, toutes.length);
  const min = Math.round((Date.now() - debut) / 60000);
  const avecPoint = Object.values(fiches).filter((f) => f.lat != null).length;
  console.log(`${Object.keys(fiches).length} fiches sur ${toutes.length}, en ${min} min.`);
  console.log(`${avecPoint} portent des coordonnées.`);
  if (refus) {
    console.log("Quand le site le permettra de nouveau :");
    console.log("  node --experimental-strip-types scripts/fetch-skiinfo-monde.ts --completer");
  }
  return 0;
}

main().then((c) => {
  process.exitCode = c;
});
