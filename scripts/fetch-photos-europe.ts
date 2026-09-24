/**
 * Les photos de station, Europe entière, chez Skiinfo — **les adresses, pas
 * les fichiers**.
 *
 *     node --experimental-strip-types scripts/fetch-photos-europe.ts
 *     node --experimental-strip-types scripts/fetch-photos-europe.ts --completer
 *     node --experimental-strip-types scripts/fetch-photos-europe.ts --essai 10
 *
 * Écrit `src/lib/monde/data/photos.json`.
 *
 * ## Ce relevé ne télécharge aucune image, et c'est la décision
 *
 * Le dépôt porte déjà 231 photos françaises dans `public/stations/`, soit
 * 42 Mo — 183 Ko l'une. Aux 1 464 stations européennes de Skiinfo, le même
 * geste pèserait quelques centaines de mégaoctets, et surtout : **ces photos
 * ne sont pas celles du dépôt.** Elles appartiennent à Skiinfo et à ses
 * contributeurs.
 *
 * Le propriétaire a tranché le 21 septembre 2026 : « URLs seulement ». On
 * relève donc l'adresse publiée, l'affichage pointe vers la source, le poids
 * reste nul et l'attribution intacte.
 *
 * `public/stations/`, `src/lib/skiinfo.photos.json` et son jumeau local ne
 * sont pas touchés : ils décrivent les 231 stations françaises rapatriées, ce
 * qui est un autre sujet et un autre contrat.
 *
 * ## D'où vient l'adresse
 *
 * Du bloc JSON-LD `SkiResort` de la page `station-de-ski`, champ `image` —
 * la même balise que `fetch-skiinfo-monde.ts` lit déjà pour les coordonnées.
 * C'est une donnée structurée que le site publie pour être lue, et non un
 * `<img>` glané dans la mise en page, qui changerait au prochain habillage.
 *
 * Une page peut porter plusieurs blocs `SkiResort` : on retient le premier qui
 * publie une image, et on ignore les autres.
 *
 * ## Le périmètre
 *
 * Les fiches dont le pays, une fois ramené à ses deux premières lettres, est
 * rangé en Europe par `geo/pays.ts`. Deux codes de Skiinfo n'en sont pas :
 *
 * - `SCT` — six stations, toutes sous `ecosse/`, entre 55° et 57° nord et
 *   −3° et −5° est. C'est l'Écosse, donc `GB`, donc l'Europe.
 * - `AJPCNTR` — cinq stations de Hokkaido et de Nagano. C'est le Japon, et il
 *   reste dehors.
 *
 * La **Russie** est écartée du référentiel depuis le 21 septembre 2026 : elle
 * n'a plus de fiche dans `geo/pays.ts`, donc plus de continent, donc elle sort
 * d'elle-même du périmètre. Deux fiches Skiinfo sont concernées.
 *
 * Les deux ont été identifiés en lisant leurs fiches, pas en devinant d'après
 * la chaîne.
 *
 * ## Ce que le site autorise
 *
 * `https://www.skiinfo.fr/robots.txt`, lu le 20 septembre 2026 : `Allow: /`,
 * sans `Crawl-delay`. Rien n'est interdit, aucune cadence n'est imposée ; on
 * s'en impose une — deux secondes, une requête à la fois — qui est celle de
 * `src/lib/scrape/politesse.ts`. L'en-tête est celui d'un navigateur.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const SOURCE = resolve(DATA, "skiinfo.json");
const SORTIE = resolve(DATA, "photos.json");
const BASE = "https://www.skiinfo.fr";

const INTERVALLE_MS = 2_000;
const TIMEOUT_MS = 25_000;
const REESSAIS = 2;
const SAUVE_TOUS = 50;

// Se présenter comme un navigateur, comme le relevé de l'app (consigne du propriétaire, 24 sept. 2026).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Les codes de Skiinfo que `geo/pays.ts` ne connaît pas, et ce qu'ils sont.
 *
 * Établis en lisant les fiches concernées — leurs chemins et leurs
 * coordonnées —, jamais en interprétant la chaîne.
 */
const ALIAS: Record<string, string> = {
  // Six stations sous `ecosse/`, de Cairngorm à Nevis Range.
  SCT: "GB",
  // Cinq stations de Hokkaido et de Nagano : le Japon, donc hors périmètre.
  AJPCNTR: "JP",
};

class Refus extends Error {}

type Fiche = {
  cle: string;
  nom: string | null;
  pays: string | null;
  /** L'adresse publiée par le site, telle quelle. `null` si la page n'en
   *  publie pas — ce qui arrive, et ne se comble pas. */
  photo: string | null;
};

type Sortie = {
  releve: string;
  source: string;
  robots: string;
  quoi: string;
  decision: string;
  stations: number;
  avecPhoto: number;
  fiches: Record<string, Fiche>;
};

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function page(url: string): Promise<string | null> {
  for (let essai = 0; essai <= REESSAIS; essai++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "text/html", "accept-language": "fr-FR,fr;q=0.9" },
        redirect: "follow",
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

/**
 * L'adresse de la photo, lue dans le JSON-LD.
 *
 * `image` peut être une chaîne, un tableau, ou un objet `ImageObject` : le
 * vocabulaire schema.org autorise les trois, et une page qui change de forme
 * ne doit pas faire disparaître la photo en silence.
 */
function photoDeLaPage(html: string): string | null {
  for (const m of html.matchAll(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    let donnees: unknown;
    try {
      donnees = JSON.parse(m[1] ?? "");
    } catch {
      continue;
    }
    for (const bloc of Array.isArray(donnees) ? donnees : [donnees]) {
      if (!bloc || typeof bloc !== "object") continue;
      const o = bloc as { "@type"?: unknown; image?: unknown };
      if (o["@type"] !== "SkiResort") continue;
      const url = adresse(o.image);
      if (url) return url;
    }
  }
  return null;
}

function adresse(image: unknown): string | null {
  if (typeof image === "string") return image.trim() || null;
  if (Array.isArray(image)) {
    for (const e of image) {
      const u = adresse(e);
      if (u) return u;
    }
    return null;
  }
  if (image && typeof image === "object") {
    const o = image as { url?: unknown; contentUrl?: unknown };
    return adresse(o.url) ?? adresse(o.contentUrl);
  }
  return null;
}

// ─── Le tour ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const essaiIdx = args.indexOf("--essai");
const limite = essaiIdx >= 0 ? Number(args[essaiIdx + 1]) : 0;

const { paysByCode } = await import("../src/lib/geo/pays.ts");

const amont = JSON.parse(readFileSync(SOURCE, "utf8")) as {
  fiches: Record<string, { nom?: string | null; pays?: string | null }>;
};

/**
 * La fiche est-elle dans le périmètre ?
 *
 * **Par la liste, pas par le continent.** Le périmètre arrêté le 21 septembre
 * 2026 compte cinq pays que `geo/pays.ts` range en Asie — Turquie, Géorgie,
 * Arménie, Azerbaïdjan, Kazakhstan. Le premier filtre, écrit sur
 * `continent === "europe"`, les a laissés dehors : cinquante-trois domaines
 * sans photo ni forfait, sans que rien ne le signale.
 *
 * `pays.ts` décrit exactement le périmètre, Kosovo excepté : y avoir une fiche
 * suffit donc, et `XK` est ajouté à la main.
 */
function dansLePerimetre(brut: string | null | undefined): boolean {
  const s = (brut ?? "").toUpperCase();
  if (!s) return false;
  const cc = ALIAS[s] ?? s.slice(0, 2);
  return cc === "XK" || paysByCode(cc) !== undefined;
}

const europeennes = Object.entries(amont.fiches).filter(([, f]) => dansLePerimetre(f.pays));

let fiches: Record<string, Fiche> = {};
if (args.includes("--completer")) {
  try {
    fiches = (JSON.parse(readFileSync(SORTIE, "utf8")) as Sortie).fiches;
    console.log(`Reprise : ${Object.keys(fiches).length} fiches déjà relevées.`);
  } catch {
    console.log("Aucun relevé antérieur : on part de zéro.");
  }
}

let restantes = europeennes.filter(([cle]) => !fiches[cle]);
if (limite > 0) restantes = restantes.slice(0, limite);

function ecrire(): void {
  const avecPhoto = Object.values(fiches).filter((f) => f.photo).length;
  const sortie: Sortie = {
    releve: new Date().toISOString(),
    source: BASE,
    robots: "Allow: /, aucun Crawl-delay ; une page par station, 2 s entre deux",
    quoi: "l'adresse de la photo publiée dans le JSON-LD SkiResort de la page station-de-ski",
    decision:
      "adresses seulement, aucun fichier rapatrié : ces photos appartiennent à Skiinfo et à ses contributeurs, l'affichage pointe vers la source",
    stations: Object.keys(fiches).length,
    avecPhoto,
    fiches,
  };
  writeFileSync(SORTIE, JSON.stringify(sortie, null, 1) + "\n", "utf8");
}

console.log("robots.txt de skiinfo.fr : Allow: /, aucun Crawl-delay.");
console.log(`Fiches européennes  : ${europeennes.length}`);
console.log(`À relever maintenant : ${restantes.length}`);
console.log(`Durée attendue      : ${Math.round((restantes.length * INTERVALLE_MS) / 60000)} minutes.\n`);

let faites = 0;
let arret: string | null = null;

for (const [cle, f] of restantes) {
  try {
    const h = await page(`${BASE}/${cle}/station-de-ski`);
    await dormir(INTERVALLE_MS);
    if (!h) continue;
    fiches[cle] = {
      cle,
      nom: f.nom ?? null,
      pays: f.pays ?? null,
      photo: photoDeLaPage(h),
    };
    faites++;
  } catch (err) {
    if (err instanceof Refus) {
      arret = err.message;
      break;
    }
    throw err;
  }
  if (faites % SAUVE_TOUS === 0) {
    ecrire();
    const avec = Object.values(fiches).filter((x) => x.photo).length;
    console.log(`  ${faites}/${restantes.length} — ${avec} avec une photo`);
  }
}

ecrire();

const total = Object.keys(fiches).length;
const avec = Object.values(fiches).filter((f) => f.photo).length;
const hotes = new Map<string, number>();
for (const f of Object.values(fiches)) {
  if (!f.photo) continue;
  try {
    const h = new URL(f.photo).host;
    hotes.set(h, (hotes.get(h) ?? 0) + 1);
  } catch {
    hotes.set("(adresse illisible)", (hotes.get("(adresse illisible)") ?? 0) + 1);
  }
}

console.log(`\nRelevé : ${total} fiches, ${avec} avec une photo (${Math.round((avec / Math.max(1, total)) * 100)} %).`);
console.log("Hôtes des images :");
for (const [h, n] of [...hotes].sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(5)}  ${h}`);
console.log("\nAucun fichier n'a été téléchargé.");
if (arret) console.log(`\nArrêt demandé par le site : ${arret}`);
