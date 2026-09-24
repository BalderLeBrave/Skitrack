/**
 * Le relevé bergfex — la seule source qui publie les prix **par période**.
 *
 *     node --experimental-strip-types scripts/fetch-bergfex.ts --inventaire
 *     node --experimental-strip-types scripts/fetch-bergfex.ts --fiches
 *     node --experimental-strip-types scripts/fetch-bergfex.ts --prix
 *
 * Écrit `src/lib/monde/data/bergfex.json`.
 *
 * ## Ce que cette source a et que les autres n'ont pas
 *
 * J'avais conclu qu'aucune source ne publiait de tarif saisonnier. C'était
 * faux, et bergfex le démontre. Sa fiche Sölden porte quatre grilles, chacune
 * avec ses dates :
 *
 * | Période | 1 jour adulte |
 * | --- | ---: |
 * | 25.10–11.11 et 19.04–02.05 | 75,00 € |
 * | 12.11–04.12 | 81,00 € |
 * | 05.12–18.12, 07.01–29.01, 27.02–18.04 | 84,50 € |
 * | **19.12–06.01 et 30.01–26.02** | **86,50 €** |
 *
 * Décembre à 81 €, février à 86,50 € : la variation que le propriétaire
 * demandait, écrite par la source et non interpolée. S'y ajoutent dix durées
 * (1 à 12 jours), des variantes horaires (à partir de 11 h, 12 h, 13 h) et
 * trois classes d'âge.
 *
 * ## Trois phases, parce que le site n'a pas de sitemap
 *
 * `/sitemap.xml` rend 404 et `robots.txt` n'en déclare aucun. L'inventaire se
 * construit donc par descente : les pages de pays listent les régions et des
 * stations, les pages de région listent les stations. Deux niveaux suffisent.
 *
 * 1. `--inventaire` : descend pays → régions, et collecte les slugs.
 * 2. `--fiches` : une requête par slug, pour ses **coordonnées** et son
 *    `og:image`. C'est la position qui dira, plus tard, à quel domaine du
 *    référentiel la fiche correspond — un slug n'est pas une clé partagée.
 * 3. `--prix` : la page `/preise/`, **seulement** pour les fiches qu'un
 *    domaine du référentiel réclame. Inutile de relever le tarif d'une station
 *    qu'on ne saurait rattacher à rien.
 *
 * ## Ce que le site autorise
 *
 * `robots.txt`, lu le 21 septembre 2026 : la recherche (`/suchen/`), les
 * espaces membres, les exports et les redirections sont interdits ; les fiches
 * de station et leurs pages de prix ne le sont pas. Cadence de `politesse.ts`
 * : deux secondes, une requête à la fois, en-tête de navigateur.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const SORTIE = resolve(DATA, "bergfex.json");
const BASE = "https://www.bergfex.fr";

const INTERVALLE_MS = 2_000;
const TIMEOUT_MS = 25_000;
const SAUVE_TOUS = 50;

// Se présenter comme un navigateur, comme le relevé de l'app (consigne du propriétaire, 24 sept. 2026).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Les pays de départ, et les slugs qui ne sont pas des stations.
 *
 * Écrits à la main parce qu'ils se lisent à l'œil : un index de pays ou de
 * région mêle ses sous-niveaux et quelques stations vedettes, et rien dans le
 * lien ne les distingue. La liste est bornée et se vérifie d'un coup d'œil.
 */
const PAYS = [
  "oesterreich", "deutschland", "schweiz", "italien", "frankreich", "andorra",
  "spanien", "czechia", "slovakia", "slovenia", "polska", "kroatien",
  "bosnien-herzegowina", "liechtenstein", "belgie", "nederland",
];

/** Régions et pages de service : ni l'un ni l'autre n'est une station. */
const PAS_UNE_STATION = new Set([
  ...PAYS,
  // Les Länder autrichiens et quelques régions équivalentes.
  "burgenland", "kaernten", "niederoesterreich", "oberoesterreich", "salzburg",
  "steiermark", "tirol", "vorarlberg", "wien",
  // Pages de service.
  "forum", "mybergfex", "newsletter", "impressum", "datenschutz", "agb",
  "kontakt", "werbung", "app", "shop", "login", "suchen",
]);

class Refus extends Error {}

type Fiche = {
  slug: string;
  nom: string | null;
  lat: number | null;
  lon: number | null;
  photo: string | null;
  /** Les grilles par période, quand la page `/preise/` en publie. */
  periodes: Periode[] | null;
  /** La page de prix a-t-elle été visitée ? */
  prixLus: boolean;
};

type Periode = {
  /** « 19.12.26 - 06.01.27 30.01.27 - 26.02.27 », tel qu'écrit. */
  dates: string;
  categories: string[];
  lignes: { libelle: string; prix: (number | null)[] }[];
};

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function page(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html", "accept-language": "fr,de;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 429 || res.status === 503) {
      await res.body?.cancel();
      throw new Refus(`${res.status}`);
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

function meta(html: string, prop: string): string | null {
  const m =
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i").exec(html) ??
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*property=["']${prop}["']`, "i").exec(html);
  return m?.[1]?.trim() || null;
}

/** Les coordonnées, lues dans les données structurées de la page. */
function position(html: string): { lat: number | null; lon: number | null } {
  const m = /"latitude"\s*:\s*"?(-?\d+\.\d+)"?[\s\S]{0,80}?"longitude"\s*:\s*"?(-?\d+\.\d+)/.exec(html);
  if (!m) return { lat: null, lon: null };
  return { lat: Number(m[1]), lon: Number(m[2]) };
}

/** « € 86,50 » → 86.5. La virgule est décimale, le point un séparateur. */
function montant(s: string): number | null {
  const m = /(\d[\d.]*),(\d{2})|(\d+)/.exec(s.replace(/\s/g, ""));
  if (!m) return null;
  const n = m[1] ? Number(`${m[1].replace(/\./g, "")}.${m[2]}`) : Number(m[3]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Les grilles de la page de prix, chacune avec la période qui la précède.
 *
 * Les dates ne sont pas dans le tableau : elles sont dans le bouton qui le
 * déplie, juste avant. On remonte donc le texte qui précède chaque `<table>`,
 * et on n'en garde que ce qui ressemble à des dates — faute de quoi on
 * ramasserait des fragments de script.
 */
function periodes(html: string): Periode[] {
  const out: Periode[] = [];
  const vus = new Set<string>();
  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const avant = texte(html.slice(Math.max(0, m.index - 400), m.index));
    const dates = (avant.match(/\d{2}\.\d{2}\.\d{2}\s*-\s*\d{2}\.\d{2}\.\d{2}/g) ?? []).join(" ");
    if (!dates) continue;

    const t = m[0];
    // **Le libellé d'une ligne est dans son `<th>`, pas dans son premier `<td>`.**
    //
    // Le tableau emploie `<th>` deux fois : en tête de colonne pour les classes
    // d'âge — « Adultes », « Enfants » —, et en tête de **ligne** pour la durée
    // — « 1 Jour », « 1 Jour à partir de 12:30 ». Une première version prenait
    // la première cellule `<td>` pour le libellé : elle a rendu « € 22,00 »
    // comme nom de forfait, et le tarif enfant comme unique prix.
    //
    // Les en-têtes de colonnes sont donc ceux du `<thead>` seul ; les autres
    // `<th>` appartiennent aux lignes. C'est la structure que les grilles
    // Skiinfo emploient déjà, et qui y était lue correctement.
    const thead = /<thead[\s\S]*?<\/thead>/.exec(t)?.[0] ?? "";
    const categories = [...thead.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)]
      .map((x) => texte(x[1] ?? ""))
      .filter(Boolean);
    const corps = thead ? t.replace(thead, "") : t;
    const lignes: Periode["lignes"] = [];
    for (const tr of [...corps.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map((x) => x[0])) {
      const libelle = texte(/<th\b[^>]*>([\s\S]*?)<\/th>/.exec(tr)?.[1] ?? "");
      const prix = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((x) =>
        montant(texte(x[1] ?? "")),
      );
      if (!libelle || !prix.some((p) => p != null)) continue;
      lignes.push({ libelle, prix });
    }
    // **Une même période peut porter plusieurs tableaux, et ce ne sont pas
    // des périodes.**
    //
    // Ankogel publie quatre tableaux sous une seule plage de dates — points,
    // saison, cartes diverses — et une première version les comptait comme
    // quatre périodes identiques. On n'ajoute donc que ce qui diffère
    // réellement : mêmes dates et mêmes lignes valent une seule fois.
    const signature = `${dates}|${JSON.stringify(lignes)}`;
    if (lignes.length && !vus.has(signature)) {
      vus.add(signature);
      out.push({ dates, categories, lignes });
    }
  }
  return out;
}

// ─── L'état ──────────────────────────────────────────────────────────────────

type Sortie = {
  releve: string;
  source: string;
  robots: string;
  quoi: string;
  slugs: string[];
  fiches: Record<string, Fiche>;
};

function charger(): Sortie {
  try {
    return JSON.parse(readFileSync(SORTIE, "utf8")) as Sortie;
  } catch {
    return {
      releve: new Date().toISOString(),
      source: BASE,
      robots: "recherche et espaces membres interdits ; fiches et pages de prix autorisées",
      quoi: "les prix de forfait par période, avec leurs dates, et la photo de la fiche",
      slugs: [],
      fiches: {},
    };
  }
}

const etat = charger();

function ecrire(): void {
  etat.releve = new Date().toISOString();
  writeFileSync(SORTIE, JSON.stringify(etat, null, 1) + "\n", "utf8");
}

const args = process.argv.slice(2);
const essaiIdx = args.indexOf("--essai");
const limite = essaiIdx >= 0 ? Number(args[essaiIdx + 1]) : 0;

// ─── Phase 1 : l'inventaire ──────────────────────────────────────────────────

if (args.includes("--inventaire")) {
  const vus = new Set<string>();
  const stations = new Set<string>(etat.slugs);
  const aVisiter = [...PAYS];

  console.log(`Descente depuis ${PAYS.length} pays.\n`);
  while (aVisiter.length) {
    const slug = aVisiter.shift()!;
    if (vus.has(slug)) continue;
    vus.add(slug);
    const h = await page(`${BASE}/${slug}/`);
    await dormir(INTERVALLE_MS);
    if (!h) continue;
    let neufs = 0;
    for (const m of h.matchAll(/href="\/([a-z0-9][a-z0-9-]*)\/"/g)) {
      const s = m[1]!;
      if (PAS_UNE_STATION.has(s)) {
        // Une région qu'on n'a pas encore ouverte : elle listera ses stations.
        if (!vus.has(s) && !PAYS.includes(s)) aVisiter.push(s);
        continue;
      }
      if (!stations.has(s)) {
        stations.add(s);
        neufs++;
      }
    }
    console.log(`  /${slug}/ → ${neufs} stations neuves (total ${stations.size})`);
  }
  etat.slugs = [...stations].sort();
  ecrire();
  console.log(`\nInventaire : ${etat.slugs.length} stations.`);
}

// ─── Phase 2 : les fiches ────────────────────────────────────────────────────

if (args.includes("--fiches")) {
  let restants = etat.slugs.filter((s) => !etat.fiches[s]);
  if (limite > 0) restants = restants.slice(0, limite);
  console.log(`Fiches à relever : ${restants.length}`);
  console.log(`Durée attendue   : ${Math.round((restants.length * INTERVALLE_MS) / 60000)} minutes.\n`);

  let n = 0;
  for (const slug of restants) {
    const h = await page(`${BASE}/${slug}/`);
    await dormir(INTERVALLE_MS);
    if (!h) continue;
    const { lat, lon } = position(h);
    etat.fiches[slug] = {
      slug,
      nom: meta(h, "og:title")?.replace(/\s*[-–|].*$/, "") ?? null,
      lat,
      lon,
      photo: meta(h, "og:image"),
      periodes: null,
      prixLus: false,
    };

    // **Une page sans coordonnées n'est pas une station, c'est un index.**
    //
    // L'inventaire descendait pays → régions au moyen d'une liste de régions
    // écrite à la main. Elle ne valait que pour l'Autriche : `wallis`,
    // `graubuenden`, `suedtirol` et six autres se sont retrouvées rangées
    // parmi les stations, et les leurs n'ont jamais été vues.
    //
    // Plutôt que d'entretenir la liste des régions de quinze pays, on se fie à
    // ce que la page dit d'elle-même : une fiche de station publie sa
    // position, un index n'en a pas. Les liens d'un index rejoignent alors
    // l'inventaire, et le tour suivant les ouvrira. Le procédé s'arrête tout
    // seul quand plus rien de neuf n'apparaît.
    if (lat == null) {
      let neufs = 0;
      for (const m of h.matchAll(/href="\/([a-z0-9][a-z0-9-]*)\/"/g)) {
        const s = m[1]!;
        if (PAS_UNE_STATION.has(s) || etat.slugs.includes(s)) continue;
        etat.slugs.push(s);
        neufs++;
      }
      if (neufs) console.log(`  /${slug}/ est un index : ${neufs} stations de plus`);
    }
    n++;
    if (n % SAUVE_TOUS === 0) {
      ecrire();
      const situees = Object.values(etat.fiches).filter((f) => f.lat != null).length;
      console.log(`  ${n}/${restants.length} — ${situees} situées`);
    }
  }
  ecrire();
  const v = Object.values(etat.fiches);
  console.log(`\nFiches : ${v.length}, dont ${v.filter((f) => f.lat != null).length} situées et ${v.filter((f) => f.photo).length} avec une photo.`);
}

// ─── Phase 3 : les prix ──────────────────────────────────────────────────────

if (args.includes("--prix")) {
  // Seules les fiches qu'un domaine du référentiel réclame, c'est-à-dire
  // celles situées à moins de cinq kilomètres d'un domaine encore sans
  // forfait. Relever le tarif d'une station qu'on ne rattacherait à rien
  // coûterait une requête pour rien.
  const { readdirSync } = await import("node:fs");
  type Domaine = { id: string; nom: string; lat: number; lon: number };
  const domaines: Domaine[] = [];
  for (const f of readdirSync(DATA).sort()) {
    if (!/^[A-Z]{2}\.json$/.test(f)) continue;
    domaines.push(...(JSON.parse(readFileSync(resolve(DATA, f), "utf8")) as Domaine[]));
  }
  const vues = JSON.parse(readFileSync(resolve(DATA, "vuesDomaines.json"), "utf8")) as {
    vues: Record<string, { forfait: unknown }>;
  };
  /**
   * Toutes les fiches proches d'un domaine, et non les seules qui comblent un
   * trou.
   *
   * Le premier tour n'a visité que le voisinage des domaines **sans** forfait.
   * Il a rendu 37 grilles à périodes sur 538 pages, et la raison est
   * structurelle : les domaines sans forfait sont les petits, et un téléski de
   * village n'a qu'un tarif. Les périodes existent chez les **grands** — ceux
   * que Skiinfo couvre déjà, et qu'on n'allait donc pas voir.
   *
   * Or la grille Skiinfo ignore les périodes. Garmisch y vaut « un prix » ;
   * chez bergfex il vaut 69 € du 20 décembre au 6 janvier et du 14 au
   * 22 février, 67 € entre les deux. C'est précisément la distinction
   * demandée, et elle ne s'obtient qu'en allant voir aussi les domaines déjà
   * pourvus.
   */
  const vues2 = vues;
  void vues2;

  const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
    const r = Math.PI / 180;
    const dp = (b.lat - a.lat) * r;
    const dl = (b.lon - a.lon) * r;
    const h =
      Math.sin(dp / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dl / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  };

  const situees = Object.values(etat.fiches).filter(
    (f): f is Fiche & { lat: number; lon: number } => f.lat != null && f.lon != null,
  );
  const utiles = situees.filter(
    (f) => !f.prixLus && domaines.some((d) => Math.abs(d.lat - f.lat) < 0.2 && km(d, f) <= 5),
  );

  let restants = utiles;
  if (limite > 0) restants = restants.slice(0, limite);
  console.log(`Domaines du référentiel : ${domaines.length}`);
  console.log(`Fiches bergfex utiles   : ${utiles.length}`);
  console.log(`Durée attendue        : ${Math.round((restants.length * INTERVALLE_MS) / 60000)} minutes.\n`);

  let n = 0;
  for (const f of restants) {
    const h = await page(`${BASE}/${f.slug}/preise/`);
    await dormir(INTERVALLE_MS);
    f.prixLus = true;
    if (h) {
      const p = periodes(h);
      f.periodes = p.length ? p : null;
    }
    n++;
    if (n % SAUVE_TOUS === 0) {
      ecrire();
      const avec = Object.values(etat.fiches).filter((x) => x.periodes?.length).length;
      console.log(`  ${n}/${restants.length} — ${avec} avec des périodes`);
    }
  }
  ecrire();
  const avec = Object.values(etat.fiches).filter((x) => x.periodes?.length);
  console.log(`\nPrix : ${avec.length} fiches avec au moins une période.`);
  const nb = avec.map((f) => f.periodes!.length).sort((a, b) => a - b);
  if (nb.length) console.log(`Périodes par fiche : médiane ${nb[Math.floor(nb.length / 2)]}, maximum ${nb[nb.length - 1]}`);
}
