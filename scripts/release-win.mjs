#!/usr/bin/env node
/**
 * L'installateur Windows : l'application bâtie pour un serveur Node (et non
 * pour Vercel, le préréglage par défaut de `vite.config.ts`), puis
 * `electron-builder`.
 *
 *   npm run release:win      # prépare aussi le Python et le navigateur embarqués
 *
 * La marche complète, depuis un clone neuf, est dans docs/INSTALLATEUR-WINDOWS.md.
 *
 * Vérifie avant d'empaqueter ce que l'installateur doit contenir, et le
 * revérifie dans `release/win-unpacked` une fois empaqueté :
 * - le serveur Nitro (`.output/server/index.mjs`), en préréglage node-server ;
 * - le Python embarqué et ses modules (`build/python`) ;
 * - le navigateur de Playwright à la révision du playwright-core tracé
 *   (`build/ms-playwright`) ;
 * - les workers Airbnb, Booking et HomeToGo (`scrape/…`) ;
 * - les tuiles de la carte des pistes (`build/carte/openskimap-europe.pmtiles`,
 *   hors dépôt). Faute de mieux, celles de `public/carte` (le développement)
 *   sont copiées dans `build/carte`. Elles ne passent pas par le dossier
 *   public du serveur bâti : le serveur statique de Nitro ignore `Range`,
 *   c'est `server/middleware/pmtiles-plages.ts` qui les sert. Le fichier de
 *   `public/carte` est donc mis de côté le temps de `vite build`, puis remis.
 *   Sans tuiles, la carte des pistes de l'app installée reste vide ;
 *   l'empaquetage s'arrête.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { EXE_SHELL } from "./preparer-navigateur.mjs";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const TUILES = "openskimap-europe.pmtiles";
const tuilesBuild = join(racine, "build", "carte", TUILES);
const tuilesPublic = join(racine, "public", "carte", TUILES);
const tuilesDeCote = join(racine, "build", `.public-carte-${TUILES}`);

function lancer(cmd, args, env = {}) {
  console.log(`> ${[cmd, ...args].join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: racine, shell: process.platform === "win32", env: { ...nettoyer(process.env), ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/**
 * Ce que Vite intégrerait au client bâti depuis le shell : l'app installée
 * sert ses tuiles elle-même et tourne sans authentification, quoi qu'en dise
 * l'environnement du poste qui l'empaquette.
 */
function nettoyer(env) {
  const e = { ...env };
  delete e.VITE_TUILES_OPENSKIMAP;
  e.VITE_AUTH_ENABLED = "false";
  return e;
}

const echec = (message) => {
  console.error(message);
  process.exit(1);
};

const manque = (chemin, quoi) => {
  if (!existsSync(join(racine, chemin))) echec(`Manque ${quoi} : ${chemin}`);
};

/**
 * Nitro trace les dépendances du serveur : `playwright-core` sait piloter
 * Electron, et le traçage copiait tout le paquet `electron`, binaire compris
 * (326 Mo, relevé le 3 octobre 2026), dans `.output/server/node_modules`. Le
 * serveur ne s'en sert jamais : l'application, elle, tourne déjà sous
 * Electron. On le retire du serveur bâti, avec celles de ses dépendances que
 * rien d'autre n'utilise (Electron 44 : @electron/get, undici, debug… et les
 * binaires d'extract-zip pour dix plateformes).
 */
function retirerElectronDuServeur() {
  const modules = join(racine, ".output", "server", "node_modules");
  const paquet = join(racine, ".output", "server", "package.json");
  const depsDe = (nom) => {
    const pj = join(modules, nom, "package.json");
    if (!existsSync(pj)) return [];
    const p = JSON.parse(readFileSync(pj, "utf8"));
    return Object.keys({ ...p.dependencies, ...p.optionalDependencies, ...p.peerDependencies });
  };
  const fermeture = (racines) => {
    const vus = new Set();
    const pile = [...racines];
    while (pile.length) {
      const n = pile.pop();
      if (vus.has(n)) continue;
      vus.add(n);
      pile.push(...depsDe(n));
    }
    return vus;
  };
  const p = existsSync(paquet) ? JSON.parse(readFileSync(paquet, "utf8")) : { dependencies: {} };
  const autres = Object.keys(p.dependencies ?? {}).filter((n) => n !== "electron");
  const gardes = fermeture(autres.filter((n) => !fermeture(["electron"]).has(n)));
  const retires = [...fermeture(["electron"])].filter((n) => !gardes.has(n));
  for (const n of retires) {
    rmSync(join(modules, n), { recursive: true, force: true });
    delete p.dependencies?.[n];
    const portee = n.startsWith("@") ? join(modules, n.split("/")[0]) : null;
    if (portee && existsSync(portee) && readdirSync(portee).length === 0) rmSync(portee, { recursive: true });
  }
  if (existsSync(paquet)) writeFileSync(paquet, `${JSON.stringify(p, null, 2)}\n`);
  if (retires.length > 1) console.log(`Retirés du serveur bâti : ${retires.join(", ")}`);
}

/** Les tuiles du développement, mises de côté le temps de `vite build`. */
function mettreTuilesDeCote() {
  if (!existsSync(tuilesPublic)) return;
  renameSync(tuilesPublic, tuilesDeCote);
  // `lancer` sort par process.exit en cas d'échec, et Ctrl+C tuerait le
  // process sans « exit » : la remise en place doit passer par là aussi.
  process.on("exit", remettreTuiles);
  for (const s of ["SIGINT", "SIGBREAK", "SIGHUP"]) process.on(s, () => process.exit(130));
}

function remettreTuiles() {
  if (existsSync(tuilesDeCote) && !existsSync(tuilesPublic)) renameSync(tuilesDeCote, tuilesPublic);
}

const versionDe = (dossier) => JSON.parse(readFileSync(join(dossier, "package.json"), "utf8")).version;

/* ---------- Avant l'empaquetage ---------- */

for (const v of ["VITE_TUILES_OPENSKIMAP"]) {
  for (const f of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    const p = join(racine, f);
    if (existsSync(p) && readFileSync(p, "utf8").includes(v)) {
      echec(`${f} définit ${v} : le client de l'app installée irait chercher ses tuiles ailleurs. Le retirer.`);
    }
  }
}

// Un run interrompu a pu laisser les tuiles du développement de côté.
remettreTuiles();

// Les tuiles de public/carte (le développement) l'emportent sur une copie plus
// ancienne dans build/carte : `npm run tuiles:batir` écrit par défaut là.
if (existsSync(tuilesPublic)) {
  const pub = statSync(tuilesPublic);
  const bat = existsSync(tuilesBuild) ? statSync(tuilesBuild) : null;
  if (!bat || pub.mtimeMs > bat.mtimeMs) {
    mkdirSync(dirname(tuilesBuild), { recursive: true });
    console.log(`Copie des tuiles de public/carte (${pub.mtime.toISOString()}) vers build/carte`);
    copyFileSync(tuilesPublic, tuilesBuild);
  }
}

manque("build/python/python.exe", "le Python embarqué (node scripts/preparer-python-embarque.mjs)");
manque(join("build", "ms-playwright", EXE_SHELL), "le navigateur de Playwright (node scripts/preparer-navigateur.mjs)");
manque(
  "build/carte/openskimap-europe.pmtiles",
  "les tuiles de la carte des pistes (docs/TUILES-OPENSKIMAP.md, « Installateur Windows »)",
);
for (const worker of ["scrape/airbnb/cli.py", "scrape/booking/cli.py", "scrape/hometogo/lire.py"]) {
  manque(worker, "un worker de relevé");
}

mettreTuilesDeCote();
try {
  lancer("node", ["scripts/with-app-env.mjs", "vite", "build"], { NITRO_PRESET: "node-server" });
} finally {
  remettreTuiles();
}

manque(".output/server/index.mjs", "le serveur Nitro");
const nitro = JSON.parse(readFileSync(join(racine, ".output", "nitro.json"), "utf8"));
if (!String(nitro.preset ?? "").startsWith("node")) echec(`Serveur bâti en préréglage « ${nitro.preset} » : il faut node-server.`);
if (existsSync(join(racine, ".output", "public", "carte", TUILES))) {
  echec("Les tuiles sont dans .output/public/carte : le serveur statique les servirait sans tranches.");
}
const coreTrace = join(racine, ".output", "server", "node_modules", "playwright-core");
manque(".output/server/node_modules/playwright-core/package.json", "playwright-core dans le serveur bâti");
const coreDepot = dirname(fileURLToPath(import.meta.resolve("playwright-core/package.json")));
if (versionDe(coreTrace) !== versionDe(coreDepot)) {
  echec(
    `playwright-core tracé ${versionDe(coreTrace)} ≠ ${versionDe(coreDepot)} du dépôt : le navigateur embarqué ne serait pas le bon.`,
  );
}
retirerElectronDuServeur();

lancer("npx", ["electron-builder", "--win"]);

// Un installateur qui échoue aux contrôles suivants ne garde pas son nom de
// diffusion.
const installateur = join(racine, "release", `SKITRACK-${versionDe(racine)}-x64.exe`);
process.on("exit", (code) => {
  if (code === 0) return;
  for (const f of [installateur, `${installateur}.blockmap`]) if (existsSync(f)) renameSync(f, `${f}.REFUSE`);
});

/* ---------- Après : ce que l'installateur contient vraiment ---------- */

const ressources = join(racine, "release", "win-unpacked", "resources");
const attendus = [
  ["output/server/index.mjs", "le serveur"],
  ["output/tuiles/openskimap-europe.pmtiles", "les tuiles"],
  ["output/scrape/airbnb/cli.py", "le worker Airbnb"],
  ["output/scrape/booking/cli.py", "le worker Booking"],
  ["output/scrape/hometogo/lire.py", "le lecteur HomeToGo"],
  ["python/python.exe", "le Python embarqué"],
  ["python/Lib/site-packages/curl_cffi", "curl_cffi"],
  [join("ms-playwright", EXE_SHELL), "le navigateur de Playwright"],
];
const absents = attendus.filter(([p]) => !existsSync(join(ressources, p)));
if (absents.length) echec(`L'installateur bâti n'a pas ${absents.map(([p, q]) => `${q} (${p})`).join(", ")}.`);
const restes = ["electron", "@electron", "@electron-internal"].filter((n) =>
  existsSync(join(ressources, "output", "server", "node_modules", n)),
);
if (restes.length) echec(`Electron est encore dans le serveur empaqueté : ${restes.join(", ")}.`);
// L'installateur NSIS saute sans rien dire tout fichier dont le chemin complet
// dépasse 260 caractères (relevé le 13 octobre 2026 : la DLL de curl_cffi
// manquait, Airbnb et Booking ne se lançaient plus). Sous
// C:\Users\<nom>\AppData\Local\Programs\SKITRACK\ (50 caractères pour un nom
// de 6 lettres), 150 laissent la marge d'un long nom ou d'un dossier choisi.
const plusLong = (dossier, base = dossier) =>
  readdirSync(dossier, { withFileTypes: true }).reduce((max, e) => {
    const p = join(dossier, e.name);
    return Math.max(max, e.isDirectory() ? plusLong(p, base) : relative(base, p).length);
  }, 0);
const longueur = plusLong(join(racine, "release", "win-unpacked"));
if (longueur > 150) echec(`Un chemin de l'application fait ${longueur} caractères (150 au plus) : il risque de dépasser 260 une fois installé.`);
const asar = statSync(join(ressources, "app.asar")).size;
if (asar > 20 * 1024 * 1024) echec(`app.asar fait ${(asar / 1e6).toFixed(0)} Mo : des node_modules y sont repartis.`);
console.log(`Installateur complet : ${attendus.length} éléments vérifiés dans ${ressources}`);
