#!/usr/bin/env node
/**
 * Le réseau piéton de chaque station, pour mesurer à pied, et non plus à vol
 * d'oiseau, la distance d'un logement à sa remontée (`src/lib/stay/aPied.ts`).
 *
 *   npm run reseau:pieton                          toutes les stations
 *   npm run reseau:pieton -- les-2-alpes tignes    quelques-unes
 *   npm run reseau:pieton -- les-2-alpes --depuis reponse.json
 *
 * Options :
 *   --depuis <fichier>  une réponse Overpass déjà enregistrée (JSON), pour une
 *                       seule station : rien ne part sur le réseau ;
 *   --endpoint <url>    le serveur Overpass (défaut : `OVERPASS_URL`, sinon
 *                       https://overpass-api.de/api/interpreter) ;
 *   --rafraichir        redemander à Overpass même quand la réponse est en cache ;
 *   --pause <s>         secondes entre deux requêtes (défaut : 10).
 *
 * Pour chaque station : ses repères (le sien et ceux de ses villages,
 * `villages.ts`), ses gares (celles que l'écran mesure déjà : la liste de la
 * station, `osmAccess.snapshot.json`, et l'index national, `osmLifts.json`, à
 * 3 km au plus d'un repère, remontées hors service retirées), puis une requête
 * Overpass des voies piétonnes autour de chaque repère et de ses gares, 1 km
 * de marge. La réponse brute est gardée dans `travail/reseau-pieton/` (hors
 * Git) : une seconde passe ne redemande rien. Le tri des voies, la
 * simplification et le branchement des gares sont dans
 * `src/lib/geo/reseauPieton.ts` (`construireReseau`), testés sans réseau.
 *
 * Overpass est un service partagé : une requête à la fois, une pause entre
 * deux, et sur 429 ou 50x une attente qui double (30 s, 1 min, 2 min…).
 *
 * Sortie : `public/reseau-pieton/<station>.json` et
 * `public/reseau-pieton/index.json` (les stations qui ont un fichier, que
 * l'écran lit avant d'en demander un), et un rapport sur la sortie standard.
 * Le dossier `public/` part tel quel dans l'application de bureau
 * (`vite build` le copie dans `.output/public`, qu'`electron-builder.yml`
 * embarque).
 *
 * Lancé par `node --experimental-strip-types` : il lit les données du dépôt
 * par leurs modules TypeScript.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SORTIE = join(RACINE, "public", "reseau-pieton");
const CACHE = join(RACINE, "travail", "reseau-pieton");
const MARGE_M = 1000;
const ESSAIS = 6;
const AGENT = "SKITRACK-reseau-pieton/1.0 (scripts/build-reseau-pieton.mjs ; une requete a la fois)";

const { construireReseau, emprisesAutour, GARE_MAX_M, garesAutour, requeteOverpass } = await import(
  "../src/lib/geo/reseauPieton.ts"
);
const { OSM_ACCESS, OSM_LIFTS } = await import("../src/lib/osmAccess.data.ts");
const { RAYON_GARE_STATION_M } = await import("../src/lib/remontees.ts");
const { STATIONS } = await import("../src/lib/stations.ts");
const { VILLAGES } = await import("../src/lib/villages.ts");

/* ---------- Arguments ---------- */

const args = process.argv.slice(2);
const opt = { depuis: null, endpoint: process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter", rafraichir: false, pause: 10 };
const demandees = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--depuis") opt.depuis = args[++i];
  else if (a === "--endpoint") opt.endpoint = args[++i];
  else if (a === "--rafraichir") opt.rafraichir = true;
  else if (a === "--pause") opt.pause = Number(args[++i]);
  else if (a.startsWith("--")) {
    console.error(`option inconnue : ${a}`);
    process.exit(1);
  } else demandees.push(a);
}
if (opt.depuis && demandees.length !== 1) {
  console.error("--depuis lit la réponse d'une seule station : nommer cette station.");
  process.exit(1);
}
if (!Number.isFinite(opt.pause) || opt.pause < 0) opt.pause = 10;

const parId = new Map(STATIONS.map((s) => [s.id, s]));
const inconnues = demandees.filter((id) => !parId.has(id));
if (inconnues.length) {
  console.error(`station(s) inconnue(s) : ${inconnues.join(", ")}`);
  process.exit(1);
}
const stations = demandees.length ? demandees.map((id) => parId.get(id)) : STATIONS;

/* ---------- Overpass ---------- */

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let derniereRequete = 0;

async function demanderOverpass(requete) {
  for (let essai = 0; essai < ESSAIS; essai++) {
    const attente = derniereRequete + opt.pause * 1000 - Date.now();
    if (attente > 0) await dormir(attente);
    derniereRequete = Date.now();
    let statut = 0;
    try {
      const r = await fetch(opt.endpoint, {
        method: "POST",
        headers: {
          "User-Agent": AGENT,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: `data=${encodeURIComponent(requete)}`,
      });
      statut = r.status;
      if (r.ok) return await r.json();
      if (statut !== 429 && statut < 500) throw new Error(`Overpass a répondu ${statut} : ${(await r.text()).slice(0, 300)}`);
    } catch (e) {
      if (statut && statut !== 429 && statut < 500) throw e;
      console.warn(`  essai ${essai + 1} : ${e instanceof Error ? e.message : String(e)}`);
    }
    const repos = 30_000 * 2 ** essai;
    console.warn(`  Overpass occupé (${statut || "réseau"}) : nouvel essai dans ${repos / 1000} s`);
    await dormir(repos);
  }
  throw new Error(`Overpass n'a pas répondu après ${ESSAIS} essais`);
}

/** La réponse Overpass d'une station : le fichier `--depuis`, le cache, ou
 *  le réseau (et alors le cache). */
async function reponse(station, requete) {
  if (opt.depuis) return { json: JSON.parse(readFileSync(opt.depuis, "utf8")), fichier: opt.depuis };
  const fichier = join(CACHE, `${station.id}.overpass.json`);
  if (!opt.rafraichir && existsSync(fichier)) return { json: JSON.parse(readFileSync(fichier, "utf8")), fichier };
  const json = await demanderOverpass(requete);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(fichier, JSON.stringify(json));
  return { json, fichier };
}

/** La date des données : celle de la base OSM d'Overpass, à défaut celle du fichier. */
function dateDe(json, fichier) {
  const t = json?.osm3s?.timestamp_osm_base;
  if (typeof t === "string" && /^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return statSync(fichier).mtime.toISOString().slice(0, 10);
}

/* ---------- Stations ---------- */

mkdirSync(SORTIE, { recursive: true });
const pool = (id) => [...(OSM_ACCESS[id]?.lifts ?? []), ...OSM_LIFTS];
let ecrites = 0;
const sansGare = [];
const echecs = [];
for (const s of stations) {
  const reperes = [{ lat: s.lat, lon: s.lon }, ...VILLAGES.filter((v) => v.station === s.id).map((v) => ({ lat: v.lat, lon: v.lon }))];
  const gares = garesAutour(reperes, pool(s.id), RAYON_GARE_STATION_M);
  if (!gares.length) {
    sansGare.push(s.id);
    continue;
  }
  const requete = requeteOverpass(emprisesAutour(reperes, gares, RAYON_GARE_STATION_M, MARGE_M));
  try {
    const { json, fichier } = await reponse(s, requete);
    if (!Array.isArray(json?.elements)) throw new Error("réponse sans `elements` : pas une réponse Overpass JSON");
    const { fichier: graphe, bilan } = construireReseau({
      elements: json.elements,
      gares,
      station: s.id,
      nom: s.name,
      le: dateDe(json, fichier),
      source: "© contributeurs OpenStreetMap (ODbL), via Overpass ; voies piétonnes d'hiver (scripts/build-reseau-pieton.mjs)",
    });
    if (!graphe.g.length) {
      echecs.push(`${s.id} : aucune gare à ${GARE_MAX_M} m d'une voie retenue`);
      continue;
    }
    const texte = JSON.stringify(graphe);
    writeFileSync(join(SORTIE, `${s.id}.json`), texte);
    ecrites++;
    console.log(
      `${s.id} : ${bilan.voiesRetenues}/${bilan.voiesLues} voies, ${bilan.noeuds} nœuds, ${bilan.troncons} tronçons, ` +
        `${bilan.gares} gares branchées (${bilan.garesNonBranchees} trop loin d'une voie), ` +
        `${bilan.morceauxRetires} morceaux sans gare retirés, ${(texte.length / 1e3).toFixed(0)} ko`,
    );
  } catch (e) {
    echecs.push(`${s.id} : ${e instanceof Error ? e.message : String(e)}`);
    console.error(`${s.id} : ${e instanceof Error ? e.message : String(e)}`);
  }
}

/* ---------- Index ---------- */

// Toutes les stations du dossier, pas seulement celles de cette passe : une
// passe partielle ne fait pas oublier les autres.
const index = { le: new Date().toISOString().slice(0, 10), source: "scripts/build-reseau-pieton.mjs", stations: {} };
let octets = 0;
for (const f of readdirSync(SORTIE).filter((f) => f.endsWith(".json") && f !== "index.json").sort()) {
  const texte = readFileSync(join(SORTIE, f), "utf8");
  const g = JSON.parse(texte);
  if (g?.v !== 1 || !Array.isArray(g.n)) continue;
  index.stations[g.station] = { nom: g.nom, le: g.le, noeuds: g.n.length / 2, gares: g.g.length };
  octets += texte.length;
}
writeFileSync(join(SORTIE, "index.json"), JSON.stringify(index));
console.log(
  `${ecrites} réseau(x) écrit(s) ; ${Object.keys(index.stations).length} dans l'index, ${(octets / 1e6).toFixed(1)} Mo.`,
);
if (sansGare.length) console.log(`Sans gare connue : ${sansGare.join(", ")}`);
if (echecs.length) {
  console.log(`Échecs :\n  ${echecs.join("\n  ")}`);
  process.exitCode = 1;
}
