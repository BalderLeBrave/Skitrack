/**
 * La plus grande image de l'accueil d'un site officiel, faute d'`og:image`.
 *
 *     node --experimental-strip-types scripts/fetch-images-officiels.ts
 *     node --experimental-strip-types scripts/fetch-images-officiels.ts --essai 10
 *
 * Complète `src/lib/monde/data/sitesOfficiels.json` : les fiches dont
 * `photo` est nul et le site joignable reçoivent, si on en trouve une, une
 * image avec `photoSource: "img"` et `servi: true` — jamais sans contrôle.
 *
 * ## Pourquoi c'est le dernier gisement, et pourquoi il est risqué
 *
 * Mille domaines nommés n'ont pas de photo. Deux cent cinquante-quatre ont un
 * site officiel qui répond mais ne publie ni `og:image` ni JSON-LD : leur
 * image est dans la page, parmi les logos, les pictogrammes, les bannières de
 * partenaires et les cartes. Prendre « la première image » rendrait un logo
 * une fois sur deux.
 *
 * ## Les trois filtres, dans l'ordre
 *
 * 1. **Le chemin** : `.jpg`, `.jpeg` ou `.webp`. Les logos et pictogrammes
 *    sont en SVG ou en PNG ; les photos, presque jamais.
 * 2. **Les attributs** : une `width` ou `height` déclarée sous 300 px écarte
 *    l'image. Une image sans attributs passe ce filtre — on ne sait rien.
 * 3. **Le poids réel**, mesuré : un `GET` d'un seul octet avec `Range`, dont
 *    la réponse dit le type et, par `Content-Range`, la taille totale. On
 *    exige `image/*` et **au moins 40 ko** : un pictogramme pèse quelques ko,
 *    une photo de paysage rarement moins de quarante.
 *
 * Les candidats sont classés par poids décroissant, et la première qui passe
 * les trois filtres est retenue. Son `alt` est conservé comme légende quand il
 * en a un, et son adresse dit d'où elle sort.
 *
 * Ce que ce relevé ne garantit pas : que l'image montre la station. Il
 * garantit qu'elle est une photo, grande, publiée par le site de la station,
 * à un endroit que le site met en avant. Un œil peut la juger ; la source est
 * nommée pour cela.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const FICHIER = resolve(DATA, "sitesOfficiels.json");

const INTERVALLE_MS = 1_200;
const TIMEOUT_MS = 20_000;
const POIDS_MIN = 40_000;
const CANDIDATS_MAX = 4;
const UA =
  "Skitrack/1.0 (relevé d'images de stations sur leur site officiel ; robot " +
  "applicatif, une requête à la fois ; un octet demandé par image)";

type Trouve = {
  id: string;
  site: string;
  url: string | null;
  statut: number | null;
  photo: string | null;
  photoSource: string | null;
  photoLegende?: string | null;
  servi?: boolean;
  refuse: boolean;
};

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sortie = JSON.parse(readFileSync(FICHIER, "utf8")) as { fiches: Record<string, Trouve>; [k: string]: unknown };

const args = process.argv.slice(2);
const essaiIdx = args.indexOf("--essai");
const limite = essaiIdx >= 0 ? Number(args[essaiIdx + 1]) : 0;

let cibles = Object.values(sortie.fiches).filter((f) => !f.photo && f.statut === 200 && !f.refuse && f.url);
if (limite > 0) cibles = cibles.slice(0, limite);

console.log(`Sites joignables sans og:image : ${cibles.length}`);
console.log(`Durée attendue : ${Math.round((cibles.length * INTERVALLE_MS * 3) / 60000)} minutes.\n`);

/** Les `<img>` de la page qui peuvent être une photo, avec ce qu'on en sait. */
function candidats(html: string, base: string): { url: string; alt: string | null; taille: number }[] {
  const out: { url: string; alt: string | null; taille: number }[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src =
      /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1] ??
      /\bdata-src=["']([^"']+)["']/i.exec(tag)?.[1] ??
      null;
    if (!src || /^data:/.test(src)) continue;
    if (!/\.(jpe?g|webp)(\?|$)/i.test(src)) continue;
    const w = Number(/\bwidth=["']?(\d+)/i.exec(tag)?.[1] ?? 0);
    const h = Number(/\bheight=["']?(\d+)/i.exec(tag)?.[1] ?? 0);
    if ((w && w < 300) || (h && h < 300)) continue;
    let url: string;
    try {
      url = new URL(src, base).toString();
    } catch {
      continue;
    }
    const alt = /\balt=["']([^"']*)["']/i.exec(tag)?.[1]?.trim() || null;
    out.push({ url, alt, taille: Math.max(w, h) });
  }
  // Les plus grandes déclarées d'abord ; celles sans taille après.
  out.sort((a, b) => b.taille - a.taille);
  const vus = new Set<string>();
  return out.filter((c) => !vus.has(c.url) && vus.add(c.url)).slice(0, CANDIDATS_MAX);
}

/** Un octet de l'image : le type, et la taille totale par `Content-Range`. */
async function sonder(url: string): Promise<{ type: string | null; taille: number | null }> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, range: "bytes=0-0", accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const type = res.headers.get("content-type");
    const cr = res.headers.get("content-range");
    const total = cr ? Number(/\/(\d+)$/.exec(cr)?.[1]) : Number(res.headers.get("content-length"));
    await res.body?.cancel();
    if (!(res.status === 200 || res.status === 206)) return { type: null, taille: null };
    return { type, taille: Number.isFinite(total) ? total : null };
  } catch {
    return { type: null, taille: null };
  }
}

let n = 0;
let trouvees = 0;
for (const f of cibles) {
  let html: string | null = null;
  let finale = f.url!;
  try {
    const res = await fetch(f.url!, {
      headers: { "user-agent": UA, accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    finale = res.url;
    if (res.ok) html = await res.text();
    else await res.body?.cancel();
  } catch {
    html = null;
  }
  await dormir(INTERVALLE_MS);

  if (html) {
    for (const c of candidats(html, finale)) {
      const { type, taille } = await sonder(c.url);
      await dormir(INTERVALLE_MS);
      if (type?.startsWith("image/") && taille != null && taille >= POIDS_MIN) {
        f.photo = c.url;
        f.photoSource = "img";
        f.photoLegende = c.alt;
        f.servi = true;
        trouvees++;
        break;
      }
    }
  }
  n++;
  if (n % 25 === 0) {
    writeFileSync(FICHIER, JSON.stringify(sortie, null, 1) + "\n", "utf8");
    console.log(`  ${n}/${cibles.length} — ${trouvees} photos`);
  }
}
writeFileSync(FICHIER, JSON.stringify(sortie, null, 1) + "\n", "utf8");
console.log(`\nVisités : ${n}, photos retenues : ${trouvees}`);
