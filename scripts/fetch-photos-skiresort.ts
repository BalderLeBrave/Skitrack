/**
 * Le repli photo : les galeries de skiresort.fr, pour les domaines que
 * Skiinfo ne couvre pas.
 *
 *     node --experimental-strip-types scripts/fetch-photos-skiresort.ts
 *     node --experimental-strip-types scripts/fetch-photos-skiresort.ts --completer
 *     node --experimental-strip-types scripts/fetch-photos-skiresort.ts --essai 10
 *
 * Écrit `src/lib/monde/data/photosSkiresort.json`.
 *
 * ## L'ordre voulu : Skiinfo d'abord, skiresort ensuite
 *
 * Skiinfo publie une photo dans son JSON-LD pour 1 367 stations européennes,
 * et elle couvre 1 162 domaines du référentiel. Restent 2 384 domaines sans
 * image, dont **1 480 ont une fiche skiresort à moins de cinq kilomètres**.
 * Ce script ne visite que celles-là : aller chercher une seconde photo pour un
 * domaine qui en a déjà une coûterait mille cinq cents requêtes pour rien.
 *
 * ## Reconnaître une photo de station d'une publicité
 *
 * Les deux vivent sous `/fileadmin/`, et une expression qui ramasse toutes les
 * images de la page rapporte des vignettes d'hôtels et des bannières
 * d'affiliation. La galerie, elle, se signe :
 *
 *     <a href="/fileadmin/_processed_/f4/48/89/91/d9407203e3.jpg"
 *        data-image-width="934" data-image-height="700"
 *        rel="gallery1" title="Vue sur Verbier">
 *
 * `rel="gallery…"` **et** un `title` : c'est ce marqueur qui est lu, et rien
 * d'autre. Le `href` porte la pleine taille, là où le `data-src` de la
 * vignette ne fait que quelques kilo-octets.
 *
 * Le titre est relevé avec l'image. « Vue sur Verbier » dit ce qu'on regarde,
 * et une photo sans légende se présente moins bien qu'une photo qui se nomme.
 *
 * ## Ce que le site autorise
 *
 * `robots.txt` de skiresort.fr : `Allow: /`, la recherche seule interdite. Les
 * fiches et leurs pages d'images sont ouvertes. Cadence de `politesse.ts` :
 * deux secondes, une requête à la fois, en-tête honnête.
 *
 * ## Aucun fichier n'est téléchargé
 *
 * Même décision que pour Skiinfo, prise par le propriétaire le 21 septembre
 * 2026 : on relève l'adresse, l'affichage pointe vers la source, le poids
 * reste nul et l'attribution intacte.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const SORTIE = resolve(DATA, "photosSkiresort.json");
const BASE = "https://www.skiresort.fr";
const RAYON_KM = 5;

const INTERVALLE_MS = 2_000;
const TIMEOUT_MS = 25_000;
const REESSAIS = 2;
const SAUVE_TOUS = 50;

const UA =
  "Skitrack/1.0 (relevé d'adresses de photos de station ; robot applicatif, " +
  "une requête à la fois, 2 s entre deux ; lit les galeries publiées)";

class Refus extends Error {}

type Photo = {
  /** L'adresse pleine taille, absolue. */
  url: string;
  /** La légende que le site donne : « Vue sur Verbier ». */
  titre: string | null;
  largeur: number | null;
  hauteur: number | null;
};

type Fiche = {
  slug: string;
  nom: string | null;
  pays: string | null;
  photo: Photo | null;
  /** Combien la galerie en portait, pour qu'on sache ce qu'on n'a pas pris. */
  galerie: number;
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

const attribut = (balise: string, nom: string): string | null => {
  const m = new RegExp(`${nom}="([^"]*)"`).exec(balise);
  return m?.[1] ?? null;
};

const nombre = (s: string | null): number | null => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Les images de la galerie, dans l'ordre de la page. */
function galerie(html: string): Photo[] {
  const out: Photo[] = [];
  for (const m of html.matchAll(/<a\b[^>]*rel="gallery\d*"[^>]*>/g)) {
    const balise = m[0];
    const href = attribut(balise, "href");
    const titre = attribut(balise, "title");
    if (!href || !/\.(jpe?g|png|webp)$/i.test(href)) continue;
    out.push({
      url: href.startsWith("http") ? href : `${BASE}${href}`,
      titre: titre?.trim() || null,
      largeur: nombre(attribut(balise, "data-image-width")),
      hauteur: nombre(attribut(balise, "data-image-height")),
    });
  }
  return out;
}

// ─── Le périmètre : les fiches dont un domaine a besoin ───────────────────────

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const p1 = a.lat * r;
  const p2 = b.lat * r;
  const dp = (b.lat - a.lat) * r;
  const dl = (b.lon - a.lon) * r;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function lire<T>(nom: string): T {
  return JSON.parse(readFileSync(resolve(DATA, nom), "utf8")) as T;
}

const { readdirSync } = await import("node:fs");
type Domaine = { id: string; lat: number; lon: number };
const domaines: Domaine[] = [];
for (const f of readdirSync(DATA).sort()) {
  if (!/^[A-Z]{2}\.json$/.test(f)) continue;
  domaines.push(...lire<Domaine[]>(f));
}

const dejaVues = lire<{ vues: Record<string, { photo: { servi: boolean } | null }> }>(
  "vuesDomaines.json",
).vues;
const sansPhoto = domaines.filter((d) => !dejaVues[d.id]?.photo?.servi);

const skiresort = lire<{
  fiches: Record<
    string,
    { nom?: string | null; pays?: string | null; continent?: string | null; lat: number | null; lon: number | null }
  >;
}>("skiresort.json");

/**
 * Toutes les fiches situées, quel que soit le continent que le site leur donne.
 *
 * Le filtre `continent === "Europe"` écartait la Turquie, la Géorgie, l'Arménie,
 * l'Azerbaïdjan et le Kazakhstan, que skiresort range en Asie et que le
 * périmètre contient. C'est l'appariement à cinq kilomètres qui décide de ce
 * qui sert : une fiche loin de tout domaine du référentiel n'est de toute
 * façon jamais visitée.
 */
const candidates = Object.entries(skiresort.fiches)
  .filter(([, f]) => f.lat != null && f.lon != null)
  .map(([slug, f]) => ({ slug, f, lat: f.lat as number, lon: f.lon as number }));

const grille = new Map<string, typeof candidates>();
for (const c of candidates) {
  const la = Math.floor(c.lat);
  const lo = Math.floor(c.lon);
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      const k = `${la + a}|${lo + b}`;
      const lot = grille.get(k);
      if (lot) lot.push(c);
      else grille.set(k, [c]);
    }
  }
}

/** Les fiches à visiter : celles qu'un appariement glouton donnerait aux
 *  domaines encore sans photo. Une fiche n'est visitée qu'une fois. */
const couples: { id: string; slug: string; km: number }[] = [];
for (const d of sansPhoto) {
  for (const c of grille.get(`${Math.floor(d.lat)}|${Math.floor(d.lon)}`) ?? []) {
    const x = km(d, c);
    if (x <= RAYON_KM) couples.push({ id: d.id, slug: c.slug, km: x });
  }
}
couples.sort((a, b) => a.km - b.km);

const aVisiter: string[] = [];
const vus = new Set<string>();
const pris = new Set<string>();
for (const c of couples) {
  if (vus.has(c.id) || pris.has(c.slug)) continue;
  vus.add(c.id);
  pris.add(c.slug);
  aVisiter.push(c.slug);
}

// ─── Le tour ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const essaiIdx = args.indexOf("--essai");
const limite = essaiIdx >= 0 ? Number(args[essaiIdx + 1]) : 0;

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

let fiches: Record<string, Fiche> = {};
if (args.includes("--completer")) {
  try {
    fiches = (JSON.parse(readFileSync(SORTIE, "utf8")) as Sortie).fiches;
    console.log(`Reprise : ${Object.keys(fiches).length} fiches déjà relevées.`);
  } catch {
    console.log("Aucun relevé antérieur : on part de zéro.");
  }
}

let restantes = aVisiter.filter((s) => !fiches[s]);
if (limite > 0) restantes = restantes.slice(0, limite);

function ecrire(): void {
  const avecPhoto = Object.values(fiches).filter((f) => f.photo).length;
  const sortie: Sortie = {
    releve: new Date().toISOString(),
    source: BASE,
    robots: "Allow: /, recherche interdite ; une page d'images par fiche, 2 s entre deux",
    quoi: "la première image de la galerie publiée, reconnue par rel=\"gallery\" et son titre",
    decision:
      "adresses seulement, aucun fichier rapatrié ; ces photos appartiennent à skiresort.fr et à ses contributeurs",
    stations: Object.keys(fiches).length,
    avecPhoto,
    fiches,
  };
  writeFileSync(SORTIE, JSON.stringify(sortie, null, 1) + "\n", "utf8");
}

console.log("robots.txt de skiresort.fr : Allow: /, recherche interdite.");
console.log(`Domaines encore sans photo : ${sansPhoto.length}`);
console.log(`Fiches à visiter           : ${aVisiter.length}`);
console.log(`À relever maintenant       : ${restantes.length}`);
console.log(`Durée attendue             : ${Math.round((restantes.length * INTERVALLE_MS) / 60000)} minutes.\n`);

let faites = 0;
let arret: string | null = null;

for (const slug of restantes) {
  try {
    const h = await page(`${BASE}/domaine-skiable/${slug}/images/`);
    await dormir(INTERVALLE_MS);
    if (!h) continue;
    const g = galerie(h);
    const amont = skiresort.fiches[slug];
    fiches[slug] = {
      slug,
      nom: amont?.nom ?? null,
      pays: amont?.pays ?? null,
      photo: g[0] ?? null,
      galerie: g.length,
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
    const n = Object.values(fiches).filter((x) => x.photo).length;
    console.log(`  ${faites}/${restantes.length} — ${n} avec une photo`);
  }
}

ecrire();

const total = Object.keys(fiches).length;
const avec = Object.values(fiches).filter((f) => f.photo).length;
const avecTitre = Object.values(fiches).filter((f) => f.photo?.titre).length;
console.log(`\nRelevé : ${total} fiches, ${avec} avec une photo (${Math.round((avec / Math.max(1, total)) * 100)} %).`);
console.log(`Dont une légende : ${avecTitre}`);
const tailles = Object.values(fiches)
  .map((f) => f.photo?.largeur)
  .filter((x): x is number => x != null)
  .sort((a, b) => a - b);
if (tailles.length) {
  console.log(`Largeur médiane : ${tailles[Math.floor(tailles.length / 2)]} px`);
}
console.log("\nAucun fichier n'a été téléchargé.");
if (arret) console.log(`\nArrêt demandé par le site : ${arret}`);
