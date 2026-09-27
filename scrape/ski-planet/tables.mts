/**
 * La table des résidences de Ski-Planet (`src/lib/scrape/agences/skiPlanet.residences.json`) :
 * ses résidences par station, avec la position et la photo que publient
 * leurs fiches.
 *
 *   npm run scrape:ski-planet -- --residences
 *   npm run scrape:ski-planet -- --positions [--max 200]
 *
 * `--residences` : l'autocomplétion du site pour cinq mots courants (cinq
 * requêtes à 2,5 s d'écart), rattachée aux stations de `couverture.ts` par
 * le libellé « - Station » de chaque résidence. Les positions et photos déjà
 * connues sont gardées.
 *
 * `--positions` : les fiches de résidence, jamais lues sur ski-planet.com, où
 * elles sont derrière un défi anti-robot, mais sur les copies qu'en gardent
 * deux archives du web. Chaque fiche donne l'identifiant de sa résidence, le
 * point de sa carte et sa première photo.
 * - Common Crawl d'abord : ses index listent les fiches capturées (une
 *   requête par crawl), et chaque page se lit par une requête de plage
 *   d'octets sur ses archives, sans limite rencontrée à 400 ms d'écart.
 *   Un 503 y veut dire « ralentir » : on attend, puis on réessaie ;
 * - l'Internet Archive ensuite, pour les fiches du plan du site que Common
 *   Crawl n'a pas : une toutes les 6 s, à l'adresse exacte de la copie.
 *   Il tolère environ deux mille requêtes par jour et par adresse, puis
 *   refuse ; un refus arrête cette partie, sans reprise.
 * La lecture reprend où elle s'était arrêtée : les fiches lues sont notées
 * dans le dossier temporaire du système, et la table est réécrite au fil de
 * la lecture, avec des données lues seulement.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { lieuxDe, stationsDe } from "../../src/lib/scrape/agences/couverture.ts";
import {
  ENTETES_AJAX,
  SKIPLANET_SITE,
  lireAutocompletion,
  lireFicheArchivee,
  slug,
  urlAutocompletion,
  type FicheArchivee,
  type LigneResidence,
  type TableSkiPlanet,
} from "../../src/lib/scrape/agences/skiPlanet.ts";
import { UA_NAVIGATEUR } from "../../src/lib/scrape/navigateur.ts";
import { allowsPath } from "../../src/lib/scrape/robots.ts";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TABLE = join(RACINE, "src/lib/scrape/agences/skiPlanet.residences.json");
const LUES = join(tmpdir(), "skitrack-ski-planet-fiches.json");
/** Les mots qui, à eux cinq, trouvaient 4 230 résidences le 26 septembre 2026. */
const MOTS = ["residence", "chalet", "val", "hotel", "appartement"];
const PREFIXE_FICHES = "www.ski-planet.com/fr/location-ski/";
const FICHE = /\/fr\/location-ski\/[^/_]+_[^/]+\.html$/;
const ECART_SITE_MS = 2_500;
/** Common Crawl : ses index à 3 s d'écart, ses archives à 400 ms ; 2 500 fiches en une heure. */
const ECART_INDEX_CC_MS = 3_000;
const ECART_ARCHIVES_CC_MS = 400;
/** Les crawls interrogés : les plus récents. Ski-Planet y figure de 2021 à mars 2026. */
const CRAWLS_CC = 48;
/**
 * L'Internet Archive : une fiche toutes les 6 s. À 4 s, il a répondu 429 au
 * bout de 1 055 fiches, le 26 septembre 2026, puis refusé toute connexion
 * pendant une heure.
 */
const ECART_ARCHIVE_MS = 6_000;
const ENTETES = { "user-agent": UA_NAVIGATEUR, "accept-language": "fr-FR,fr;q=0.9" };

class Refus extends Error {}

const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const derniere = new Map<string, number>();
/** Une requête, au rythme de son hôte ; un refus (403, 429, 503) arrête tout, sans reprise. */
async function obtenir(url: string, entetes: Record<string, string>, ecart: number): Promise<Response> {
  const hote = new URL(url).host;
  const attente = (derniere.get(hote) ?? 0) + ecart - Date.now();
  if (attente > 0) await dormir(attente);
  derniere.set(hote, Date.now());
  const res = await fetch(url, { headers: { ...ENTETES, ...entetes }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
  if (res.status === 403 || res.status === 429 || res.status === 503) {
    await res.body?.cancel().catch(() => undefined);
    throw new Refus(`HTTP ${res.status} sur ${hote}${res.headers.get("cf-mitigated") ? " (défi anti-robot)" : ""}`);
  }
  return res;
}

function lireTable(): TableSkiPlanet {
  if (!existsSync(TABLE)) return { genere: "", stations: {} };
  return JSON.parse(readFileSync(TABLE, "utf8")) as TableSkiPlanet;
}

/** Une résidence par ligne : la table se relit, et ses changements aussi. */
function ecrireTable(t: TableSkiPlanet): void {
  const lignes = ["{", `  "genere": ${JSON.stringify(t.genere)},`, `  "stations": {`];
  const cles = Object.keys(t.stations).sort();
  cles.forEach((cle, k) => {
    const s = t.stations[cle];
    lignes.push(`    ${JSON.stringify(cle)}: {`, `      "libelle": ${JSON.stringify(s.libelle)},`, `      "residences": [`);
    s.residences.forEach((r, i) => lignes.push(`        ${JSON.stringify(r)}${i < s.residences.length - 1 ? "," : ""}`));
    lignes.push("      ]", `    }${k < cles.length - 1 ? "," : ""}`);
  });
  lignes.push("  }", "}", "");
  const temp = `${TABLE}.${process.pid}.tmp`;
  writeFileSync(temp, lignes.join("\n"), "utf8");
  renameSync(temp, TABLE);
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Les stations de l'autocomplétion que Skitrack couvre : les lieux de `couverture.ts`. */
function lieux(): Set<string> {
  return new Set(stationsDe("Ski-Planet").flatMap((s) => [...lieuxDe("Ski-Planet", s)]));
}

async function residences(): Promise<void> {
  await allowsPath(SKIPLANET_SITE, "/fr/ajax/recherche-destination.php");
  const voulus = lieux();
  const avant = lireTable();
  const connues = new Map<number, LigneResidence>();
  for (const s of Object.values(avant.stations)) for (const r of s.residences) connues.set(r[0], r);
  const trouvees = new Map<string, { libelle: string; residences: Map<number, string> }>();
  for (const mot of MOTS) {
    const res = await obtenir(urlAutocompletion(mot), { ...ENTETES_AJAX }, ECART_SITE_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status} pour « ${mot} »`);
    const { entrees, compteurs } = lireAutocompletion(await res.text());
    let n = 0;
    for (const e of entrees) {
      if (e.critere !== "residences" || !e.station) continue;
      const cle = slug(e.station);
      if (!voulus.has(cle)) continue;
      if (!trouvees.has(cle)) trouvees.set(cle, { libelle: e.station, residences: new Map() });
      trouvees.get(cle)!.residences.set(Number(e.id), e.nom);
      n++;
    }
    console.log(`« ${mot} » : ${n} résidences rattachées (${JSON.stringify(compteurs)})`);
  }
  const table: TableSkiPlanet = { genere: aujourdhui(), stations: {} };
  for (const [cle, s] of [...trouvees.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    table.stations[cle] = {
      libelle: s.libelle,
      residences: [...s.residences.entries()]
        .sort(([a], [b]) => a - b)
        .map(([id, nom]) => {
          const c = connues.get(id);
          return [id, nom, c?.[2] ?? null, c?.[3] ?? null, c?.[4] ?? null];
        }),
    };
  }
  const manquent = [...voulus].filter((l) => !table.stations[l]);
  ecrireTable(table);
  const total = Object.values(table.stations).reduce((n, s) => n + s.residences.length, 0);
  console.log(`${Object.keys(table.stations).length} stations, ${total} résidences écrites dans ${TABLE}`);
  if (manquent.length) console.warn(`stations de couverture.ts sans résidence : ${manquent.join(", ")}`);
}

/* ---------- Positions ---------- */

type Lue = { id: string | null; lat: number | null; lon: number | null; photo: string | null } | { echec: string };

function lireLues(): Record<string, Lue> {
  try {
    return JSON.parse(readFileSync(LUES, "utf8")) as Record<string, Lue>;
  } catch {
    return {};
  }
}

/** L'adresse d'une fiche, une seule écriture : `https`, `www`, sans requête. */
function adresseFiche(u: string): string | null {
  const url = u.split("?")[0].replace(/^http:/, "https:").replace("://ski-planet.com", "://www.ski-planet.com");
  return FICHE.test(url) ? url : null;
}

/** Les fiches de résidence du plan du site (`/fr/location-ski/<nom>_<station>.html`). */
async function fichesDuPlan(): Promise<string[]> {
  const index = await obtenir(`${SKIPLANET_SITE}/sitemap/sp/sitemap_sp.xml.gz`, {}, ECART_SITE_MS);
  if (!index.ok) throw new Error(`plan du site : HTTP ${index.status}`);
  const xml = gunzipSync(Buffer.from(await index.arrayBuffer())).toString("utf8");
  const plans = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]).filter((u) => /\/fr\//.test(u));
  const fiches = new Set<string>();
  for (const plan of plans) {
    const res = await obtenir(plan, {}, ECART_SITE_MS);
    if (!res.ok) throw new Error(`plan du site : HTTP ${res.status}`);
    const brut = Buffer.from(await res.arrayBuffer());
    const texte = (plan.endsWith(".gz") ? gunzipSync(brut) : brut).toString("utf8");
    for (const m of texte.matchAll(/<loc>\s*(https:\/\/www\.ski-planet\.com\/fr\/location-ski\/[^<]+)\s*<\/loc>/g)) {
      const u = adresseFiche(m[1]);
      if (u) fiches.add(u);
    }
  }
  return [...fiches];
}

type CaptureCC = { horodatage: string; fichier: string; debut: number; longueur: number };

/** Les captures de Common Crawl, la plus récente par fiche : une requête par crawl, 404 quand il n'en a aucune. */
async function capturesCommonCrawl(): Promise<Map<string, CaptureCC>> {
  const liste = await obtenir("https://index.commoncrawl.org/collinfo.json", {}, ECART_INDEX_CC_MS);
  if (!liste.ok) throw new Error(`index Common Crawl : HTTP ${liste.status}`);
  const crawls = ((await liste.json()) as { id: string }[]).slice(0, CRAWLS_CC).map((c) => c.id);
  const captures = new Map<string, CaptureCC>();
  for (const crawl of crawls) {
    const q = new URLSearchParams({ url: `${PREFIXE_FICHES}*`, output: "json", filter: "=status:200" });
    let res: Response | null = null;
    for (let essai = 0; essai < 3; essai++) {
      res = await obtenir(`https://index.commoncrawl.org/${crawl}-index?${q}`, {}, ECART_INDEX_CC_MS);
      if (res.status < 500) break;
      await res.body?.cancel().catch(() => undefined);
      await dormir(20_000);
    }
    if (!res || res.status === 404) continue;
    if (!res.ok) throw new Error(`index ${crawl} : HTTP ${res.status}`);
    let n = 0;
    let coupees = 0;
    for (const ligne of (await res.text()).split("\n")) {
      if (!ligne.startsWith("{")) continue;
      let r: { url: string; timestamp: string; filename: string; offset: string; length: string };
      try {
        r = JSON.parse(ligne);
      } catch {
        // Le serveur d'index coupe parfois une réponse en cours de ligne (vu deux fois le 26 septembre 2026).
        coupees++;
        continue;
      }
      const url = adresseFiche(r.url);
      if (!url) continue;
      n++;
      if ((captures.get(url)?.horodatage ?? "") < r.timestamp) {
        captures.set(url, { horodatage: r.timestamp, fichier: r.filename, debut: Number(r.offset), longueur: Number(r.length) });
      }
    }
    console.log(`${crawl} : ${n} fiches${coupees ? `, ${coupees} lignes coupées` : ""}`);
  }
  return captures;
}

/** Le corps HTML d'un enregistrement WARC (réponse) : après les en-têtes WARC, puis les en-têtes HTTP. */
function corpsWarc(brut: Buffer): string {
  const t = gunzipSync(brut).toString("utf8");
  const i = t.indexOf("\r\n\r\n");
  const j = i >= 0 ? t.indexOf("\r\n\r\n", i + 4) : -1;
  return i < 0 || j < 0 ? "" : t.slice(j + 4);
}

/** Une fiche depuis les archives de Common Crawl. Un 503 y veut dire « ralentir » : on attend, puis on réessaie. */
async function lireCommonCrawl(c: CaptureCC): Promise<Lue> {
  for (let essai = 0; essai < 6; essai++) {
    const attente = (derniere.get("data.commoncrawl.org") ?? 0) + ECART_ARCHIVES_CC_MS - Date.now();
    if (attente > 0) await dormir(attente);
    derniere.set("data.commoncrawl.org", Date.now());
    let res: Response;
    try {
      res = await fetch(`https://data.commoncrawl.org/${c.fichier}`, {
        headers: { ...ENTETES, range: `bytes=${c.debut}-${c.debut + c.longueur - 1}` },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      console.warn(`  Common Crawl : ${(err as Error).message} ; on attend 20 s`);
      await dormir(20_000);
      continue;
    }
    if (res.status === 206 || res.status === 200) {
      const f: FicheArchivee = lireFicheArchivee(corpsWarc(Buffer.from(await res.arrayBuffer())));
      return { id: f.id, lat: f.lat, lon: f.lon, photo: f.photo };
    }
    await res.body?.cancel().catch(() => undefined);
    if (res.status < 500 && res.status !== 429) return { echec: `HTTP ${res.status}` };
    console.warn(`  Common Crawl : HTTP ${res.status} ; on attend ${15 * (essai + 1)} s`);
    await dormir(15_000 * (essai + 1));
  }
  return { echec: "Common Crawl indisponible" };
}

/** La dernière copie de chaque fiche sur archive.org (index CDX, une requête), à son adresse exacte. */
async function copiesArchivees(): Promise<Map<string, { adresse: string; horodatage: string }>> {
  const q = new URLSearchParams({ url: PREFIXE_FICHES, matchType: "prefix", filter: "statuscode:200", fl: "original,timestamp", output: "json" });
  const res = await obtenir(`https://web.archive.org/cdx/search/cdx?${q}`, {}, ECART_ARCHIVE_MS);
  if (!res.ok) throw new Error(`index d'archive.org : HTTP ${res.status}`);
  const lignes = (await res.json()) as string[][];
  const dernieres = new Map<string, { adresse: string; horodatage: string }>();
  for (const [original, horodatage] of lignes.slice(1)) {
    const url = adresseFiche(original);
    if (!url) continue;
    if ((dernieres.get(url)?.horodatage ?? "") < horodatage) dernieres.set(url, { adresse: original, horodatage });
  }
  return dernieres;
}

/** Les mots propres d'un nom de résidence : « Résidence les Fontaines Blanches - MH » → `fontaines blanches`. */
const MOTS_VIDES = new Set("residence residences chalet chalets appartement appartements hotel les le la l d de du des mh maeva home pierre vacances et".split(" "));
function motsPropres(s: string): string {
  return slug(s)
    .split("-")
    .filter((w) => w && !MOTS_VIDES.has(w))
    .join(" ");
}

/**
 * Une fiche dont le nom est celui d'une résidence en vente, encore sans
 * position, dans sa station : elle se lit d'abord. Les autres suivent, car
 * une résidence renommée garde son identifiant.
 */
function prioritaires(table: TableSkiPlanet): (url: string) => boolean {
  const cles = Object.keys(table.stations);
  const noms = new Map(cles.map((c) => [c, new Set(table.stations[c].residences.filter((r) => r[2] == null).map((r) => motsPropres(r[1])))]));
  return (url) => {
    const m = url.match(/\/location-ski\/([^/_]+)_([^/]+)\.html$/);
    if (!m) return false;
    const cle = cles.find((c) => c === m[2]) ?? cles.find((c) => m[2].startsWith(`${c}-`) || c.startsWith(`${m[2]}-`));
    return cle != null && noms.get(cle)!.has(motsPropres(m[1]));
  };
}

function poserPositions(lues: Record<string, Lue>): { posees: number; total: number } {
  const table = lireTable();
  const parId = new Map<string, Extract<Lue, { id: string | null }>>();
  for (const l of Object.values(lues)) if ("id" in l && l.id && l.lat != null) parId.set(l.id, l);
  let posees = 0;
  let total = 0;
  for (const s of Object.values(table.stations)) {
    s.residences = s.residences.map((r) => {
      total++;
      const l = parId.get(String(r[0]));
      const suivante: LigneResidence = l ? [r[0], r[1], l.lat, l.lon, l.photo ?? r[4]] : r;
      if (suivante[2] != null) posees++;
      return suivante;
    });
  }
  table.genere = aujourdhui();
  ecrireTable(table);
  return { posees, total };
}

async function positions(max: number): Promise<void> {
  if (!existsSync(TABLE)) throw new Error("pas de table : lancer d'abord --residences");
  const lues = lireLues();
  const enVente = prioritaires(lireTable());
  const aLire = (urls: Iterable<string>) => [...urls].filter((u) => !(u in lues)).sort((a, b) => Number(enVente(b)) - Number(enVente(a)));
  let n = 0;
  const noter = (fin = false) => {
    writeFileSync(LUES, JSON.stringify(lues));
    const { posees, total } = poserPositions(lues);
    console.log(`${fin ? "fin : " : ""}${n} fiches lues ; ${posees} résidences sur ${total} ont une position`);
  };
  try {
    // 1. Common Crawl.
    const cc = await capturesCommonCrawl();
    const fichesCC = aLire(cc.keys()).slice(0, max);
    console.log(`Common Crawl : ${cc.size} fiches, ${fichesCC.length} à lire, dont ${fichesCC.filter(enVente).length} au nom d'une résidence en vente sans position`);
    for (const url of fichesCC) {
      lues[url] = await lireCommonCrawl(cc.get(url)!);
      if (++n % 25 === 0) noter();
    }
    // 2. L'Internet Archive, pour les fiches du plan du site que Common Crawl n'a pas.
    if (n < max) {
      const fiches = await fichesDuPlan();
      const copies = await copiesArchivees();
      const fichesWb = aLire(fiches.filter((u) => copies.has(u))).slice(0, max - n);
      console.log(`Internet Archive : ${fiches.length} fiches au plan du site, ${copies.size} archivées, ${fichesWb.length} à lire`);
      for (const url of fichesWb) {
        const { adresse, horodatage } = copies.get(url)!;
        const res = await obtenir(`https://web.archive.org/web/${horodatage}id_/${adresse}`, { accept: "text/html" }, ECART_ARCHIVE_MS);
        if (res.ok) {
          const f = lireFicheArchivee(await res.text());
          lues[url] = { id: f.id, lat: f.lat, lon: f.lon, photo: f.photo };
        } else {
          await res.body?.cancel().catch(() => undefined);
          lues[url] = { echec: `HTTP ${res.status}` };
        }
        if (++n % 25 === 0) noter();
      }
    }
  } finally {
    noter(true);
  }
}

const args = process.argv.slice(2);
const max = Number(args[args.indexOf("--max") + 1]) || Number.POSITIVE_INFINITY;
try {
  if (args.includes("--residences")) await residences();
  if (args.includes("--positions")) await positions(args.includes("--max") ? max : Number.POSITIVE_INFINITY);
  if (!args.includes("--residences") && !args.includes("--positions")) {
    console.log("usage : npm run scrape:ski-planet -- --residences | --positions [--max N]");
  }
} catch (err) {
  console.error(err instanceof Refus ? `arrêt sur refus, sans reprise : ${err.message}` : err);
  process.exitCode = 1;
}
