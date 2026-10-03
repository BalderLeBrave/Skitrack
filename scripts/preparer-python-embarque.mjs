#!/usr/bin/env node
/**
 * Le Python que l'installateur Windows embarque pour les workers de relevé
 * (`scrape/airbnb`, `scrape/booking`) : la distribution « embeddable » de
 * python.org, et les dépendances des workers installées à côté.
 *
 *   node scripts/preparer-python-embarque.mjs
 *
 * Écrit `build/python/` (ignoré par git), que `electron-builder.yml` copie dans
 * les ressources de l'application ; `desktop/main.mjs` le donne au serveur
 * par `SKITRACK_PYTHON`. Sans lui, l'application installée cherchait un
 * Python sur la machine, qui n'avait en général ni curl_cffi ni bs4 : Airbnb
 * ne venait que par Cozy, et Booking pas du tout.
 *
 * Télécharge depuis python.org (une archive d'environ 11 Mo) et PyPI (les
 * roues de curl_cffi, beautifulsoup4, requests et leurs dépendances). Un
 * Python 3 installé sur la machine sert seulement à lancer `pip`.
 */

import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

/** La 3.12 ne publie plus de binaires depuis la 3.12.10 ; la 3.13 en publie encore. */
export const VERSION_PYTHON = "3.13.16";
const COURTE = VERSION_PYTHON.split(".").slice(0, 2).join("");

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const cible = join(racine, "build", "python");
const cache = join(racine, "build", "python-cache");
const archive = join(cache, `python-${VERSION_PYTHON}-embed-amd64.zip`);
const sitePackages = join(cible, "Lib", "site-packages");
const exigences = ["scrape/airbnb/requirements.txt", "scrape/booking/requirements.txt"].map((p) => join(racine, p));

function lancer(cmd, args) {
  console.log(`> ${[cmd, ...args].join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: racine });
  return r.status === 0;
}

async function telecharger() {
  if (existsSync(archive)) return;
  mkdirSync(cache, { recursive: true });
  const url = `https://www.python.org/ftp/python/${VERSION_PYTHON}/python-${VERSION_PYTHON}-embed-amd64.zip`;
  console.log(`Téléchargement de ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`python.org : HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(archive));
}

function extraire() {
  rmSync(cible, { recursive: true, force: true });
  mkdirSync(cible, { recursive: true });
  // Le `tar` de Windows (bsdtar) lit les archives zip ; celui de Git Bash, le
  // premier dans le PATH sous son terminal, prend « C: » pour un hôte distant.
  const tar =
    process.platform === "win32" ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
  if (!lancer(tar, ["-xf", archive, "-C", cible])) throw new Error("extraction de l'archive Python impossible");
}

/**
 * La distribution « embeddable » ignore `site-packages` : son fichier `._pth`
 * fixe le chemin de recherche et commente `import site`. On y ajoute le
 * dossier des dépendances et on rétablit `site`.
 */
function ouvrirSitePackages() {
  const pth = join(cible, `python${COURTE}._pth`);
  if (!existsSync(pth)) throw new Error(`fichier ${pth} absent de l'archive`);
  const lignes = readFileSync(pth, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => (l.trim() === "#import site" ? "import site" : l));
  if (!lignes.includes("Lib\\site-packages")) lignes.splice(lignes.length - 1, 0, "Lib\\site-packages");
  if (!lignes.includes("import site")) lignes.push("import site");
  writeFileSync(pth, `${lignes.join("\r\n")}\r\n`);
}

/** Les roues pour ce Python et cette machine, installées dans `Lib/site-packages`. */
function installerDependances() {
  mkdirSync(sitePackages, { recursive: true });
  const pip = process.platform === "win32" ? ["py", ["-3"]] : ["python3", []];
  const args = [
    ...pip[1],
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    "--no-cache-dir",
    "--target",
    sitePackages,
    "--platform",
    "win_amd64",
    "--python-version",
    VERSION_PYTHON.split(".").slice(0, 2).join("."),
    "--implementation",
    "cp",
    "--only-binary=:all:",
    ...exigences.flatMap((f) => ["-r", f]),
  ];
  if (!lancer(pip[0], args)) throw new Error("installation des dépendances des workers impossible");
}

function verifier() {
  const py = join(cible, "python.exe");
  const ok = lancer(py, ["-c", "import curl_cffi, bs4, requests, sys; print('python embarqué', sys.version.split()[0], 'curl_cffi', curl_cffi.__version__)"]);
  if (!ok) throw new Error("le Python embarqué n'importe pas les modules des workers");
  // Les caches d'octets se refont à l'exécution : ils n'ont rien à faire dans l'installateur.
  const sansCache = (d) => {
    for (const n of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, n.name);
      if (n.isDirectory()) {
        if (n.name === "__pycache__") rmSync(p, { recursive: true, force: true });
        else sansCache(p);
      }
    }
  };
  sansCache(cible);
}

await telecharger();
extraire();
ouvrirSitePackages();
installerDependances();
verifier();
console.log(`Python ${VERSION_PYTHON} prêt dans ${cible}`);
