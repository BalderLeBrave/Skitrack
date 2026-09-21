/**
 * Les grilles de forfaits d'Europe, chez Skiinfo.
 *
 *     node --experimental-strip-types scripts/fetch-forfaits-skiinfo.ts
 *     node --experimental-strip-types scripts/fetch-forfaits-skiinfo.ts --completer
 *     node --experimental-strip-types scripts/fetch-forfaits-skiinfo.ts --essai 10
 *
 * Écrit `src/lib/monde/data/forfaitsSkiinfo.json`.
 *
 * ## Pourquoi une seconde source de prix
 *
 * skiresort.fr ne publie **qu'un nombre** : « Forfait journalier Haute
 * saison », pour trois classes d'âge. Skiinfo publie une grille :
 *
 * | | Enfant 8-18 | Adulte | Sénior 65-74 |
 * | --- | ---: | ---: | ---: |
 * | Forfait journée | 48,00 | 57,00 | 48,00 |
 * | Forfait journée (le week-end) | 55,00 | 66,00 | 55,00 |
 * | Forfait 2 jour | 118,00 | 142,00 | 118,00 |
 * | Forfait semaine | 306,00 | 366,00 | 306,00 |
 *
 * Plus un forfait saison avec sa date de validité, les bornes d'âge de chaque
 * classe, et la date de dernière mise à jour. C'est la forme que
 * `forfaits/grille.ts` attend déjà — slug × saison × durée × catégorie.
 *
 * ## Ce que ces sources ne donnent pas, et qu'on ne fabriquera pas
 *
 * **Aucune des deux ne publie de prix par période dans la saison.** Un forfait
 * de décembre coûte souvent moins cher qu'un forfait de février ; ni skiresort
 * ni Skiinfo ne l'écrit. Vérifié sur Zermatt, Tignes et Les Arcs : les deux
 * tableaux sont les mêmes partout, sans colonne de période.
 *
 * Ce que Skiinfo distingue, en revanche, c'est la **semaine et le week-end** —
 * 57 € contre 66 € à Tignes —, et c'est relevé comme deux lignes distinctes,
 * parce que c'en sont.
 *
 * Interpoler une haute et une basse saison à partir d'un seul nombre serait
 * inventer un prix. Le relevé écrit ce que la source écrit.
 *
 * ## Ce que le site autorise
 *
 * `robots.txt` de skiinfo.fr, lu le 20 septembre 2026 : `Allow: /`, sans
 * `Crawl-delay`. Cadence de `politesse.ts` tout de même : deux secondes, une
 * requête à la fois, en-tête honnête.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const SOURCE = resolve(DATA, "skiinfo.json");
const SORTIE = resolve(DATA, "forfaitsSkiinfo.json");
const BASE = "https://www.skiinfo.fr";

const INTERVALLE_MS = 2_000;
const TIMEOUT_MS = 25_000;
const REESSAIS = 2;
const SAUVE_TOUS = 50;

const UA =
  "Skitrack/1.0 (relevé de grilles de forfaits ; robot applicatif, une requête " +
  "à la fois, 2 s entre deux ; lit les pages publiées)";

const ALIAS: Record<string, string> = { SCT: "GB", AJPCNTR: "JP" };

const { paysByCode } = await import("../src/lib/geo/pays.ts");

class Refus extends Error {}

/** Une classe d'âge, telle que le tableau l'annonce. */
type Categorie = {
  nom: string;
  /** « 8-18 », « 65-74 ». Absente pour « Adulte », que le site ne borne pas. */
  ages: string | null;
};

type Ligne = {
  /** « Forfait journée », « Forfait journée (le week-end) », « Forfait semaine ». */
  libelle: string;
  /** Un prix par catégorie, dans l'ordre des colonnes. `null` = case vide. */
  prix: (number | null)[];
};

type Fiche = {
  cle: string;
  nom: string | null;
  pays: string | null;
  /** ISO 4217. Lue sur la page, ou à défaut celle du pays — voir `deviseSource`. */
  devise: string | null;
  /** `page` : le site l'écrit. `pays` : le symbole était ambigu, on a pris
   *  celle du pays, que `geo/pays.ts` tient de la liste ISO 4217. */
  deviseSource: "page" | "pays" | null;
  /** « 1 mai 2026 », tel qu'écrit. */
  misAJour: string | null;
  categories: Categorie[];
  lignes: Ligne[];
  /** Le forfait saison, quand le site en publie un. */
  saison: {
    libelle: string;
    validite: string | null;
    categories: Categorie[];
    prix: (number | null)[];
  } | null;
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

const texte = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Un nombre du tableau : « 1,488.00 » vaut mille quatre cent quatre-vingt-huit.
 *
 * Le site écrit ses prix à l'anglaise, virgule pour les milliers et point pour
 * les décimales, **même en français**. Lire « 1,488.00 » avec la convention
 * française rendrait 1,488 — mille fois trop peu, et sans que rien ne le
 * signale.
 */
function nombre(s: string): number | null {
  const net = s.replace(/\s/g, "").replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(net)) return null;
  const n = Number(net);
  return Number.isFinite(n) ? n : null;
}

/** Les en-têtes de colonnes : le nom de la classe, et ses bornes d'âge. */
function categories(thead: string): Categorie[] {
  const out: Categorie[] = [];
  const ths = [...thead.matchAll(/<th\b[\s\S]*?<\/th>/g)].map((m) => m[0]);
  // La première colonne porte la date de mise à jour, pas une catégorie.
  for (const th of ths.slice(1)) {
    const spans = [...th.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((m) => texte(m[1] ?? ""));
    const nom = spans[0] ?? texte(th);
    if (!nom) continue;
    out.push({ nom, ages: spans[1] || null });
  }
  return out;
}

function lignes(tbody: string): Ligne[] {
  const out: Ligne[] = [];
  for (const tr of [...tbody.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map((m) => m[0])) {
    const libelle = texte(/<th\b[\s\S]*?<\/th>/.exec(tr)?.[0] ?? "");
    if (!libelle) continue;
    const prix = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => nombre(texte(m[1] ?? "")));
    if (prix.length) out.push({ libelle, prix });
  }
  return out;
}

/**
 * La devise de la page, et **d'où on la tient**.
 *
 * Le site écrit « *Tous les prix sont en <!-- -->CHF » pour la Suisse, mais
 * « … en € » pour la zone euro : un code ISO ici, un symbole là. Un motif qui
 * n'accepte que trois majuscules rend donc la Suisse et perd la France,
 * l'Italie et l'Autriche — ce qu'un premier essai a fait sans rien signaler.
 *
 * Les symboles sans ambiguïté sont traduits. **« kr » ne l'est pas** : il
 * désigne quatre couronnes différentes, et choisir à sa place serait deviner.
 * On retombe alors sur la devise du **pays**, qui n'est pas une supposition —
 * `geo/pays.ts` la tient de la liste ISO 4217 — et le champ `deviseSource` dit
 * lequel des deux chemins a servi, pour qu'une relecture puisse trancher.
 */
const SYMBOLES: [RegExp, string][] = [
  [/^[A-Z]{3}$/, ""], // un code ISO se reprend tel quel
  [/€/, "EUR"],
  [/£/, "GBP"],
  [/₺/, "TRY"],
  [/zł/i, "PLN"],
  [/Kč/i, "CZK"],
  [/Ft$/, "HUF"],
  [/лв/i, "BGN"],
  [/₴/, "UAH"],
];

function devise(html: string, cc: string | null): { code: string | null; source: "page" | "pays" | null } {
  const m = /[Tt]ous les prix sont en\s*(?:<[^>]+>\s*)*([^<\s][^<]{0,6}?)\s*</.exec(html);
  const brut = (m?.[1] ?? "").trim();
  if (brut) {
    if (/^[A-Z]{3}$/.test(brut)) return { code: brut, source: "page" };
    for (const [re, iso] of SYMBOLES) {
      if (iso && re.test(brut)) return { code: iso, source: "page" };
    }
  }
  const duPays = cc ? paysByCode(cc)?.devise ?? null : null;
  return duPays ? { code: duPays, source: "pays" } : { code: null, source: null };
}

function lire(cle: string, amont: { nom?: string | null; pays?: string | null }, html: string): Fiche {
  const brut = (amont.pays ?? "").toUpperCase();
  const dev = devise(html, brut ? ALIAS[brut] ?? brut.slice(0, 2) : null);
  const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/g)].map((m) => m[0]);

  let saison: Fiche["saison"] = null;
  let grille: { cats: Categorie[]; lignes: Ligne[]; maj: string | null } | null = null;

  for (const t of tables) {
    const thead = /<thead[\s\S]*?<\/thead>/.exec(t)?.[0] ?? "";
    const tbody = /<tbody[\s\S]*?<\/tbody>/.exec(t)?.[0] ?? t;
    const premiere = texte(/<th\b[\s\S]*?<\/th>/.exec(thead)?.[0] ?? "");
    const cats = categories(thead);
    const lg = lignes(tbody);
    if (!lg.length) continue;

    if (/Valable pour/i.test(premiere)) {
      // Le tableau du forfait saison : une seule ligne, dont le libellé est
      // l'année — « 2025-2026 » — et la remarque porte la validité.
      const l = lg[0]!;
      const validite = lg.find((x) => /valable/i.test(x.libelle))?.libelle ?? null;
      saison = {
        libelle: l.libelle,
        validite: validite && validite !== l.libelle ? validite : null,
        categories: cats,
        prix: l.prix,
      };
      continue;
    }
    if (/mise à jour/i.test(premiere)) {
      grille = {
        cats,
        lignes: lg,
        maj: /mise à jour\s*:\s*(.+)$/i.exec(premiere)?.[1]?.trim() ?? null,
      };
    }
  }

  return {
    cle,
    nom: amont.nom ?? null,
    pays: amont.pays ?? null,
    devise: dev.code,
    deviseSource: dev.source,
    misAJour: grille?.maj ?? null,
    categories: grille?.cats ?? [],
    lignes: grille?.lignes ?? [],
    saison,
  };
}

// ─── Le tour ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const essaiIdx = args.indexOf("--essai");
const limite = essaiIdx >= 0 ? Number(args[essaiIdx + 1]) : 0;

const amont = JSON.parse(readFileSync(SOURCE, "utf8")) as {
  fiches: Record<string, { nom?: string | null; pays?: string | null }>;
};

/** Dans le périmètre — par la **liste** des cinquante pays, non par le
 *  continent : cinq d'entre eux sont en Asie, et un filtre sur « europe » les
 *  écartait en silence. `pays.ts` décrit le périmètre, Kosovo excepté. */
function dansLePerimetre(brut: string | null | undefined): boolean {
  const s = (brut ?? "").toUpperCase();
  if (!s) return false;
  const cc = ALIAS[s] ?? s.slice(0, 2);
  return cc === "XK" || paysByCode(cc) !== undefined;
}

const europeennes = Object.entries(amont.fiches).filter(([, f]) => dansLePerimetre(f.pays));

type Sortie = {
  releve: string;
  source: string;
  robots: string;
  quoi: string;
  limite: string;
  stations: number;
  avecGrille: number;
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

let restantes = europeennes.filter(([cle]) => !fiches[cle]);
if (limite > 0) restantes = restantes.slice(0, limite);

function ecrire(): void {
  const avecGrille = Object.values(fiches).filter((f) => f.lignes.length).length;
  const sortie: Sortie = {
    releve: new Date().toISOString(),
    source: BASE,
    robots: "Allow: /, aucun Crawl-delay ; une page par station, 2 s entre deux",
    quoi: "la grille de forfaits publiée par la station : durées, classes d'âge, forfait saison",
    limite:
      "aucune des sources disponibles ne publie de prix par période dans la saison ; la distinction relevée est semaine / week-end, telle que le site l'écrit",
    stations: Object.keys(fiches).length,
    avecGrille,
    fiches,
  };
  writeFileSync(SORTIE, JSON.stringify(sortie, null, 1) + "\n", "utf8");
}

console.log("robots.txt de skiinfo.fr : Allow: /, aucun Crawl-delay.");
console.log(`Fiches européennes   : ${europeennes.length}`);
console.log(`À relever maintenant : ${restantes.length}`);
console.log(`Durée attendue       : ${Math.round((restantes.length * INTERVALLE_MS) / 60000)} minutes.\n`);

let faites = 0;
let arret: string | null = null;

for (const [cle, f] of restantes) {
  try {
    const h = await page(`${BASE}/${cle}/forfaits-de-ski`);
    await dormir(INTERVALLE_MS);
    if (!h) continue;
    fiches[cle] = lire(cle, f, h);
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
    const n = Object.values(fiches).filter((x) => x.lignes.length).length;
    console.log(`  ${faites}/${restantes.length} — ${n} avec une grille`);
  }
}

ecrire();

const total = Object.keys(fiches).length;
const avec = Object.values(fiches).filter((f) => f.lignes.length).length;
const avecSaison = Object.values(fiches).filter((f) => f.saison).length;
const devises = new Map<string, number>();
const libelles = new Map<string, number>();
for (const f of Object.values(fiches)) {
  if (f.devise) devises.set(f.devise, (devises.get(f.devise) ?? 0) + 1);
  for (const l of f.lignes) libelles.set(l.libelle, (libelles.get(l.libelle) ?? 0) + 1);
}

console.log(`\nRelevé : ${total} fiches, ${avec} avec une grille (${Math.round((avec / Math.max(1, total)) * 100)} %), ${avecSaison} avec un forfait saison.`);
console.log(`Devises : ${devises.size}`);
for (const [d, n] of [...devises].sort((a, b) => b[1] - a[1])) console.log(`  ${d}  ${n}`);
console.log("Libellés de forfait rencontrés :");
for (const [l, n] of [...libelles].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${n.toString().padStart(5)}  ${l}`);
if (arret) console.log(`\nArrêt demandé par le site : ${arret}`);
