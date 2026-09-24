/**
 * Les pages « Tarifs » des sites officiels — la dernière piste pour un forfait.
 *
 *     node --experimental-strip-types scripts/fetch-tarifs-officiels.ts
 *     node --experimental-strip-types scripts/fetch-tarifs-officiels.ts --completer
 *     node --experimental-strip-types scripts/fetch-tarifs-officiels.ts --essai 10
 *
 * Écrit `src/lib/monde/data/tarifsOfficiels.json`.
 *
 * ## Pourquoi celui-ci en dernier
 *
 * Skiinfo, skiresort et bergfex ne couvrent pas 973 domaines. Parmi eux, 356
 * ont un site officiel qui répond. Les tarifs n'y sont pas sur la page
 * d'accueil — le relevé précédent l'a mesuré : 3 prix JSON-LD sur 937 sites.
 * Ils sont sur une page « Forfaits », « Tarifs », « Skipass », « Preise », en
 * **texte libre**, sur autant de mises en page qu'il y a de sites.
 *
 * ## Les garde-fous, parce qu'un prix faux est pire qu'un prix absent
 *
 * Un nombre près du mot « forfait » peut être un tarif enfant, une école de
 * ski, une location, une navette. Rien n'est donc pris hors d'une **ligne de
 * tableau** qui porte à la fois :
 *
 * 1. un **montant avec sa devise** — « 45,00 € », « CHF 62 », « 350 Kč » —,
 * 2. et un **mot de durée** — jour, journée, day, Tag, Tages, dzień, den, giorno.
 *
 * La ligne entière est **conservée comme preuve**, telle que le site l'écrit.
 * Un tarif douteux se vérifie donc en lisant la preuve, sans relancer quoi que
 * ce soit — et c'est ce que `mentionForfait` affichera.
 *
 * La devise vient du symbole quand il est sans ambiguïté, sinon du pays du
 * domaine, et le champ le dit. « kr » n'est jamais deviné.
 *
 * ## `robots.txt`, lu et respecté ; un 429 arrête l'hôte, pas le tour
 *
 * Mêmes règles que `fetch-sites-officiels.ts`, et pour les mêmes raisons :
 * plusieurs centaines d'hôtes inconnus, une ou deux requêtes chacun.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");
const SORTIE = resolve(DATA, "tarifsOfficiels.json");

const INTERVALLE_MS = 1_500;
const TIMEOUT_MS = 20_000;
const SAUVE_TOUS = 25;
const AGENT = "skitrack";
// Se présenter comme un navigateur, comme le relevé de l'app (consigne du propriétaire, 24 sept. 2026).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const { paysByCode } = await import("../src/lib/geo/pays.ts");

class Refus extends Error {}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── robots.txt ──────────────────────────────────────────────────────────────

const robots = new Map<string, string[]>();
const refusants = new Set<string>();

function lireRobots(txt: string): string[] {
  const groupes: { agents: string[]; interdits: string[] }[] = [];
  let g: { agents: string[]; interdits: string[] } | null = null;
  let dansAgents = false;
  for (const brut of txt.split(/\r?\n/)) {
    const l = brut.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(l);
    if (!m) continue;
    const cle = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (cle === "user-agent") {
      if (!dansAgents) {
        g = { agents: [], interdits: [] };
        groupes.push(g);
        dansAgents = true;
      }
      g!.agents.push(val.toLowerCase());
    } else {
      dansAgents = false;
      if (cle === "disallow" && g && val) g.interdits.push(val);
    }
  }
  const mien = groupes.filter((x) => x.agents.includes(AGENT));
  const tous = groupes.filter((x) => x.agents.includes("*"));
  return (mien.length ? mien : tous).flatMap((x) => x.interdits);
}

async function robotsDe(origine: string): Promise<string[]> {
  const deja = robots.get(origine);
  if (deja) return deja;
  let interdits: string[] = [];
  try {
    const res = await fetch(`${origine}/robots.txt`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    if (res.ok) interdits = lireRobots(await res.text());
    else await res.body?.cancel();
  } catch {
    interdits = [];
  }
  robots.set(origine, interdits);
  await dormir(INTERVALLE_MS);
  return interdits;
}

const autorise = (interdits: readonly string[], chemin: string): boolean =>
  !interdits.some((d) => chemin.startsWith(d.replace(/\*.*$/, "")));

async function page(url: string): Promise<{ html: string; url: string } | null> {
  const origine = new URL(url).origin;
  if (refusants.has(origine)) return null;
  const interdits = await robotsDe(origine);
  if (!autorise(interdits, new URL(url).pathname || "/")) return null;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html", "accept-language": "fr,de,en;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 429) {
      refusants.add(origine);
      await res.body?.cancel();
      throw new Refus(origine);
    }
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    const html = await res.text();
    await dormir(INTERVALLE_MS);
    return { html, url: res.url };
  } catch (err) {
    if (err instanceof Refus) throw err;
    return null;
  } finally {
    /* la cadence est tenue dans le chemin nominal ; un échec ne la brise pas */
  }
}

// ─── Trouver la page de tarifs ───────────────────────────────────────────────

/** Les mots qui nomment une page de tarifs, dans les langues du périmètre. */
const MOTS_TARIF =
  /forfait|tarif|prix|skipass|ski-pass|preis|price|ticket|billet|abonnement|liftpreis|karten|cennik|ceny|cenik|prezzi|precios|tarife|priser|hinnat|ceník|árak|cene|cijene|цени|тарифи/i;

function lienTarifs(html: string, base: string): string | null {
  const candidats: { url: string; score: number }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1]!;
    const texte = m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const dansHref = MOTS_TARIF.test(href);
    const dansTexte = MOTS_TARIF.test(texte);
    if (!dansHref && !dansTexte) continue;
    let url: string;
    try {
      url = new URL(href, base).toString();
    } catch {
      continue;
    }
    if (new URL(url).origin !== new URL(base).origin) continue;
    if (/\.(pdf|jpe?g|png)$/i.test(url)) continue;
    // Un lien qui dit « forfait » dans son texte ET son adresse vaut plus.
    candidats.push({ url, score: (dansHref ? 1 : 0) + (dansTexte ? 2 : 0) });
  }
  candidats.sort((a, b) => b.score - a.score);
  return candidats[0]?.url ?? null;
}

// ─── Lire un prix, avec sa preuve ────────────────────────────────────────────

const DUREE = /\b(jour|journ[ée]e|day|tag|tages|tageskarte|giorno|giornaliero|d[ií]a|dzie[nń]|den|denn[ií]|dag|päivä|nap|dan)\b/i;

const DEVISES: [RegExp, string][] = [
  [/€|eur\b/i, "EUR"],
  [/chf|sfr|fr\.\s*\d/i, "CHF"],
  [/£|gbp/i, "GBP"],
  [/kč|czk/i, "CZK"],
  [/zł|pln/i, "PLN"],
  [/\bhuf\b|\bft\b/i, "HUF"],
  [/\blei\b|ron/i, "RON"],
  [/\bnok\b/i, "NOK"],
  [/\bsek\b/i, "SEK"],
  [/\bdkk\b/i, "DKK"],
  [/\bisk\b/i, "ISK"],
  [/\bbam\b|km\b(?=\s*\d)/i, "BAM"],
  [/\brsd\b|дин/i, "RSD"],
  [/₺|\btry\b|\btl\b/i, "TRY"],
  [/₴|\buah\b|грн/i, "UAH"],
  [/\bgel\b|₾/i, "GEL"],
  [/\bmkd\b|ден/i, "MKD"],
  [/\ball\b|lek/i, "ALL"],
  [/\bbyn\b/i, "BYN"],
  [/\bkzt\b|₸/i, "KZT"],
  [/\bamd\b|֏/i, "AMD"],
  [/\bazn\b|₼/i, "AZN"],
];


function lireMontant(s: string): number | null {
  // **Le premier montant de la ligne, sous l'une ou l'autre forme, par
  // position — et non la première forme qui matche.**
  //
  // Deux tentatives ont eu tort avant celle-ci. Prendre la première
  // correspondance de gauche à droite d'une seule expression rendait « 3 CHF »
  // pour « ½ Tag 2 | 3 CHF 62.– » (Grindelwald). Faire passer la forme
  // « devise puis nombre » devant rendait « € 32,00 » pour « Day Ticket
  // 33,50 € 32,00 € » (Brandnertal), le tarif de la seconde colonne.
  //
  // On relève donc chaque montant avec sa position, dans les deux formes, et
  // on garde le premier. Un montant sous cinq est ignoré : « 3 » à Grindelwald
  // est un nombre de secteurs, pas un prix, et aucune journée du périmètre ne
  // se vend cinq unités de sa devise — la preuve reste affichée pour qu'on
  // en juge.
  // Écrits en littéraux : bâtis depuis des chaînes, ces motifs ont perdu deux
  // fois leurs `\d` à l'échappement, et rendaient zéro montant sur toute ligne.
  const formeA =
    /(\d{1,4}(?:[ .']\d{3})*(?:[,.]\d{1,2})?)\s*(?:€|chf|sfr|£|kč|zł|ft|lei|nok|sek|dkk|isk|km|rsd|₺|tl|₴|грн|₾|ден|lek|byn|₸|֏|₼|eur)/gi;
  const formeB =
    /(?:€|chf|sfr|£|kč|zł|ft|lei|nok|sek|dkk|isk|km|rsd|₺|tl|₴|грн|₾|ден|lek|byn|₸|֏|₼|eur)\s*(\d{1,4}(?:[ .']\d{3})*(?:[,.]\d{1,2})?)(?:\.[–-]|\.-)?/gi;
  const trouves: { pos: number; brut: string }[] = [];
  for (const re of [formeA, formeB]) {
    for (const m of s.matchAll(re)) trouves.push({ pos: m.index, brut: m[1]! });
  }
  trouves.sort((a, b) => a.pos - b.pos);
  for (const t of trouves) {
    const brut = t.brut.replace(/\s/g, "").replace(/'/g, "");
    // « 1.234,50 » : milliers puis centimes ; « 54,5 » : une décimale ;
    // « 45.00 » : centimes. On tranche sur le dernier séparateur.
    const dec = /[,.](\d{1,2})$/.exec(brut);
    const net = dec
      ? brut.slice(0, -dec[0].length).replace(/[.,]/g, "") + "." + dec[1]
      : brut.replace(/[.,]/g, "");
    const n = Number(net);
    if (Number.isFinite(n) && n >= 5 && n < 2000) return n;
  }
  return null;
}

function deviseDe(s: string): string | null {
  for (const [re, iso] of DEVISES) if (re.test(s)) return iso;
  return null;
}

type Trouve = {
  id: string;
  nom: string | null;
  site: string;
  pageTarifs: string | null;
  prix: {
    valeur: number;
    devise: string;
    deviseSource: "page" | "pays";
    /** La ligne du tableau, telle que le site l'écrit. C'est la preuve. */
    preuve: string;
  } | null;
  refuse: boolean;
};

/**
 * Le premier tarif journée d'un tableau de la page, avec la ligne pour preuve.
 *
 * On ne lit que des lignes `<tr>` : une phrase de prose qui mentionne « 45 € la
 * journée de formation » n'est pas une grille tarifaire, et les tableaux sont
 * la seule forme où le site range ses prix pour qu'on les compare.
 */
function tarifJournee(html: string, cc: string | null): Trouve["prix"] {
  for (const tr of html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const ligne = tr[0]!.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    if (!DUREE.test(ligne)) continue;
    // Une ligne « semaine » ou « 6 jours » qui contient aussi « jour » : on
    // l'écarte, elle n'est pas la journée.
    if (/\b([2-9]|1\d)\s*(jours|days|tage|giorni|d[ií]as|dni|dagen|dage)\b|semaine|week|woche|settimana|semana|tydzie|saison|season|saison/i.test(ligne)) continue;
    const valeur = lireMontant(ligne);
    if (valeur == null) continue;
    const surPage = deviseDe(ligne);
    const devise = surPage ?? (cc ? paysByCode(cc)?.devise ?? null : null);
    if (!devise) continue;
    return { valeur, devise, deviseSource: surPage ? "page" : "pays", preuve: ligne.slice(0, 220) };
  }
  return null;
}

// ─── Le périmètre ────────────────────────────────────────────────────────────

type Domaine = { id: string; nom?: string; sites?: string[] };
const domaines: Domaine[] = [];
for (const f of readdirSync(DATA).sort()) {
  if (!/^[A-Z]{2}\.json$/.test(f)) continue;
  domaines.push(...(JSON.parse(readFileSync(resolve(DATA, f), "utf8")) as Domaine[]));
}
const vues = JSON.parse(readFileSync(resolve(DATA, "vuesDomaines.json"), "utf8")) as {
  vues: Record<string, { forfait: unknown }>;
};
const sites = JSON.parse(readFileSync(resolve(DATA, "sitesOfficiels.json"), "utf8")) as {
  fiches: Record<string, { url: string | null; statut: number | null; refuse: boolean }>;
};

const aChercher = domaines.filter((d) => {
  if (vues.vues[d.id]?.forfait) return false;
  const s = sites.fiches[d.id];
  return s && s.statut === 200 && !s.refuse && s.url;
});

const args = process.argv.slice(2);
const essaiIdx = args.indexOf("--essai");
const limite = essaiIdx >= 0 ? Number(args[essaiIdx + 1]) : 0;

type Sortie = { releve: string; quoi: string; regle: string; domaines: number; avecPrix: number; fiches: Record<string, Trouve> };
let fiches: Record<string, Trouve> = {};
if (args.includes("--completer")) {
  try {
    fiches = (JSON.parse(readFileSync(SORTIE, "utf8")) as Sortie).fiches;
    console.log(`Reprise : ${Object.keys(fiches).length} déjà visités.`);
  } catch {
    /* premier tour */
  }
}
let restants = aChercher.filter((d) => !fiches[d.id]);
if (limite > 0) restants = restants.slice(0, limite);

function ecrire(): void {
  const v = Object.values(fiches);
  writeFileSync(
    SORTIE,
    JSON.stringify(
      {
        releve: new Date().toISOString(),
        quoi: "le tarif journée lu sur la page « Tarifs » du site officiel, avec la ligne de tableau qui le porte pour preuve",
        regle: "une ligne de tableau portant un montant avec devise ET un mot de durée ; rien n'est lu hors d'un tableau ; kr n'est jamais deviné",
        domaines: v.length,
        avecPrix: v.filter((x) => x.prix).length,
        fiches,
      },
      null,
      1,
    ) + "\n",
    "utf8",
  );
}

console.log(`Domaines sans forfait dont le site répond : ${aChercher.length}`);
console.log(`À visiter maintenant : ${restants.length} (deux requêtes chacun)`);
console.log(`Durée attendue       : ${Math.round((restants.length * INTERVALLE_MS * 2.4) / 60000)} minutes.\n`);

let n = 0;
for (const d of restants) {
  const s = sites.fiches[d.id]!;
  const cc = d.id.slice(0, 2).toUpperCase();
  const t: Trouve = { id: d.id, nom: d.nom ?? null, site: s.url!, pageTarifs: null, prix: null, refuse: false };
  try {
    const accueil = await page(s.url!);
    if (accueil) {
      // Le tarif est parfois sur l'accueil même ; on regarde d'abord là.
      t.prix = tarifJournee(accueil.html, cc);
      if (!t.prix) {
        const lien = lienTarifs(accueil.html, accueil.url);
        if (lien) {
          t.pageTarifs = lien;
          const pt = await page(lien);
          if (pt) t.prix = tarifJournee(pt.html, cc);
        }
      } else {
        t.pageTarifs = accueil.url;
      }
    }
  } catch (err) {
    if (!(err instanceof Refus)) throw err;
    t.refuse = true;
  }
  fiches[d.id] = t;
  n++;
  if (n % SAUVE_TOUS === 0) {
    ecrire();
    const v = Object.values(fiches);
    console.log(`  ${n}/${restants.length} — ${v.filter((x) => x.prix).length} prix, ${v.filter((x) => x.pageTarifs).length} pages trouvées`);
  }
}
ecrire();

const v = Object.values(fiches);
console.log(`\nVisités : ${v.length}`);
console.log(`  page de tarifs trouvée : ${v.filter((x) => x.pageTarifs).length}`);
console.log(`  avec un prix           : ${v.filter((x) => x.prix).length}`);
console.log(`  devise lue sur la page : ${v.filter((x) => x.prix?.deviseSource === "page").length}`);
console.log(`  refusés (429)          : ${v.filter((x) => x.refuse).length}`);
for (const x of v.filter((y) => y.prix).slice(0, 6)) {
  console.log(`   ${(x.nom ?? x.id).slice(0, 28).padEnd(30)} ${x.prix!.valeur} ${x.prix!.devise}  « ${x.prix!.preuve.slice(0, 80)} »`);
}
