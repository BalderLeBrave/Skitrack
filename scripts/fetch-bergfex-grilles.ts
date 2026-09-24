/**
 * Les grilles de prix de bergfex **non datées** — celles que le premier
 * relevé jetait.
 *
 *     node --experimental-strip-types scripts/fetch-bergfex-grilles.ts
 *     node --experimental-strip-types scripts/fetch-bergfex-grilles.ts --essai 20
 *
 * Écrit `src/lib/monde/data/bergfexGrilles.json`.
 *
 * ## Ce qui a été perdu, et pourquoi
 *
 * `fetch-bergfex.ts --prix` a visité 1 440 pages `/preise/` et n'en a gardé
 * que 155. Il ne conserve en effet qu'un tableau **précédé d'une plage de
 * dates** — c'était tout son objet : montrer qu'un forfait de février ne
 * coûte pas celui de décembre. Les autres stations publient bien leurs
 * tarifs, mais sous une seule grille sans dates, et `if (!dates) continue`
 * les écartait toutes.
 *
 * Or ces grilles portent exactement ce qu'on demande : « 1 Jour », « 6
 * Jours », « Passeport saisonnier » en lignes, « Adultes » et « Enfants »
 * en colonnes. Aillons-Margeriaz et Samnaun, tirés au hasard des 1 285
 * écartées, les ont l'une et l'autre.
 *
 * Ce relevé-ci ne touche donc pas à `bergfex.json` : il écrit à côté, ne
 * garde que les tableaux **sans dates** (les datés restent la propriété de
 * l'autre relevé, qui les lit mieux), et ne visite que les fiches qu'un
 * domaine du référentiel réclame — celui dont la matrice des six tarifs
 * n'est pas complète.
 *
 * ## Politesse
 *
 * Mêmes règles que le relevé d'origine : une requête à la fois, deux
 * secondes entre deux, agent nommé, et un 429 arrête le tour. Reprise :
 * relancer le script repart des fiches non encore visitées.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const SORTIE = resolve(DATA, "bergfexGrilles.json");
const BASE = "https://www.bergfex.fr";

const INTERVALLE_MS = 2_000;
const TIMEOUT_MS = 25_000;
const SAUVE_TOUS = 25;
const RAYON_KM = 5;

// Se présenter comme un navigateur, comme le relevé de l'app (consigne du propriétaire, 24 sept. 2026).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Refus extends Error {}

async function page(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html", "accept-language": "fr,de;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 429 || res.status === 503) {
      await res.body?.cancel();
      throw new Refus(String(res.status));
    }
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    return await res.text();
  } catch (err) {
    if (err instanceof Refus) throw err;
    return null;
  }
}

const texte = (h: string): string =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

function montant(s: string): number | null {
  const m = /(\d[\d.]*),(\d{2})|(\d+)/.exec(s.replace(/\s/g, ""));
  if (!m) return null;
  const n = m[1] ? Number(`${m[1].replace(/\./g, "")}.${m[2]}`) : Number(m[3]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type Grille = { categories: string[]; lignes: { libelle: string; prix: (number | null)[] }[] };

/**
 * Les tableaux **sans plage de dates** de la page.
 *
 * Même lecture que le relevé daté : les colonnes viennent du `<thead>`, le
 * libellé d'une ligne de son `<th>` — jamais de sa première cellule, qui
 * porte un prix et non un nom.
 */
function grilles(html: string): Grille[] {
  const out: Grille[] = [];
  const vus = new Set<string>();
  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const avant = texte(html.slice(Math.max(0, (m.index ?? 0) - 400), m.index));
    if (/\d{2}\.\d{2}\.\d{2}\s*-\s*\d{2}\.\d{2}\.\d{2}/.test(avant)) continue; // daté : pas ici
    const t = m[0];
    const thead = /<thead[\s\S]*?<\/thead>/.exec(t)?.[0] ?? "";
    const categories = [...thead.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)]
      .map((x) => texte(x[1] ?? ""))
      .filter(Boolean);
    if (!categories.length) continue;
    const corps = thead ? t.replace(thead, "") : t;
    const lignes: Grille["lignes"] = [];
    for (const tr of [...corps.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map((x) => x[0])) {
      const libelle = texte(/<th\b[^>]*>([\s\S]*?)<\/th>/.exec(tr)?.[1] ?? "");
      const prix = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((x) => montant(texte(x[1] ?? "")));
      if (!libelle || !prix.some((p) => p != null)) continue;
      lignes.push({ libelle, prix });
    }
    const signature = JSON.stringify([categories, lignes]);
    if (lignes.length && !vus.has(signature)) {
      vus.add(signature);
      out.push({ categories, lignes });
    }
  }
  return out;
}

// ── Qui visiter ──────────────────────────────────────────────────────────

const lire = <T,>(f: string): T | null => {
  const p = resolve(DATA, f);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null;
};

type Fiche = { slug: string; nom: string; lat: number | null; lon: number | null; periodes?: unknown[] | null };
const bergfex = lire<{ fiches: Record<string, Fiche> }>("bergfex.json");
if (!bergfex) throw new Error("bergfex.json absent : lancer d'abord fetch-bergfex.ts");

type Domaine = { id: string; lat: number; lon: number };
const domaines: Domaine[] = [];
for (const f of ["AD", "AL", "AM", "AT", "AZ", "BA", "BE", "BG", "BY", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GE", "GR", "HR", "HU", "IE", "IS", "IT", "KZ", "LI", "LT", "LV", "ME", "MK", "NL", "NO", "PL", "PT", "RO", "RS", "SE", "SI", "SK", "TR", "UA", "XK"]) {
  const p = resolve(DATA, `${f}.json`);
  if (existsSync(p)) domaines.push(...(JSON.parse(readFileSync(p, "utf8")) as Domaine[]));
}

const POSTES = ["jourAdulte", "jourEnfant", "sixJoursAdulte", "sixJoursEnfant", "saisonAdulte", "saisonEnfant"];
const vues = lire<{ vues: Record<string, { forfait?: { matrice?: Record<string, unknown> } | null }> }>("vuesDomaines.json");
const complet = (id: string): boolean => {
  const m = vues?.vues[id]?.forfait?.matrice;
  return !!m && POSTES.every((p) => m[p]);
};

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

type Sortie = {
  releve: string;
  source: string;
  quoi: string;
  fiches: Record<string, { slug: string; nom: string; grilles: Grille[]; visite: true }>;
};

const sortie: Sortie = lire<Sortie>("bergfexGrilles.json") ?? {
  releve: new Date().toISOString(),
  source: `${BASE}/<station>/preise/`,
  quoi: "les grilles de tarifs sans plage de dates, que le relevé daté écartait",
  fiches: {},
};
sortie.releve = new Date().toISOString();

// Une fiche vaut le détour si elle est à cinq kilomètres d'un domaine dont la
// matrice n'est pas complète, et si elle n'a pas déjà de grille datée — celle-là
// est mieux lue par l'autre relevé.
const args = process.argv.slice(2);
const essai = args.indexOf("--essai");
let cibles = Object.values(bergfex.fiches).filter(
  (f) =>
    f.lat != null &&
    f.lon != null &&
    !(f.periodes?.length ?? 0) &&
    !sortie.fiches[f.slug] &&
    domaines.some((d) => Math.abs(d.lat - f.lat!) < 0.2 && km(d, { lat: f.lat!, lon: f.lon! }) <= RAYON_KM && !complet(d.id)),
);
if (essai >= 0) cibles = cibles.slice(0, Number(args[essai + 1]));

console.log(`Fiches bergfex à visiter : ${cibles.length}`);
console.log(`Durée attendue : ${Math.round((cibles.length * INTERVALLE_MS) / 60000)} minutes.\n`);

let n = 0;
let avecGrille = 0;
for (const f of cibles) {
  let html: string | null = null;
  try {
    html = await page(`${BASE}/${f.slug}/preise/`);
  } catch (err) {
    console.log(`\n429/503 sur ${f.slug} : le tour s'arrête ici, ${n} fiches faites.`, String(err));
    break;
  }
  await dormir(INTERVALLE_MS);
  const g = html ? grilles(html) : [];
  sortie.fiches[f.slug] = { slug: f.slug, nom: f.nom, grilles: g, visite: true };
  if (g.length) avecGrille++;
  n++;
  if (n % SAUVE_TOUS === 0) {
    writeFileSync(SORTIE, JSON.stringify(sortie, null, 1) + "\n", "utf8");
    console.log(`  ${n}/${cibles.length} — ${avecGrille} avec une grille`);
  }
}
writeFileSync(SORTIE, JSON.stringify(sortie, null, 1) + "\n", "utf8");
console.log(`\nVisitées : ${n} ; avec une grille : ${avecGrille} ; total en réserve : ${Object.keys(sortie.fiches).length}`);
