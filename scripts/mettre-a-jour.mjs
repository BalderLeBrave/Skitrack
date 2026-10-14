#!/usr/bin/env node
/**
 * Met le dossier à jour depuis GitHub au lancement de SKITRACK.bat.
 *
 *   node scripts/mettre-a-jour.mjs
 *
 * Avance rapide seulement (`git merge --ff-only origin/master`) : jamais de
 * fusion, jamais de modification locale touchée. Si une mise à jour toucherait
 * un fichier modifié localement, git refuse, le script le dit et SKITRACK se
 * lance quand même. Rien à faire hors de master, si master a des commits non
 * poussés, pendant une fusion ou un rebase, ou hors ligne.
 *
 * Quand package-lock.json a changé depuis la dernière installation, les
 * dépendances sont réinstallées (`npm ci`), binaire d'Electron compris.
 *
 * Code de sortie : 0, sauf 3 quand la mise à jour a changé SKITRACK.bat, que
 * cmd ne doit pas continuer à lire en cours de route : il se relance.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const tampon = join(racine, "node_modules", ".cache", "skitrack", "dependances.sha256");
const windows = process.platform === "win32";

const git = (...args) => {
  const r = spawnSync("git", args, { cwd: racine, encoding: "utf8", windowsHide: true });
  return { ok: r.status === 0, sortie: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
};
const dire = (m) => console.log(`[mise à jour] ${m}`);
const empreinte = (f) => (existsSync(f) ? createHash("sha256").update(readFileSync(f)).digest("hex") : "");

function mettreAJourGit() {
  if (!git("--version").ok) return dire("git introuvable : pas de mise à jour.");
  if (!existsSync(join(racine, ".git"))) return dire("pas un dépôt git : pas de mise à jour.");
  for (const f of ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "rebase-merge", "rebase-apply"]) {
    if (existsSync(join(racine, ".git", f))) return dire("opération git en cours : pas de mise à jour.");
  }
  const branche = git("rev-parse", "--abbrev-ref", "HEAD").sortie;
  if (branche !== "master") return dire(`branche ${branche} : seul master se met à jour.`);
  if (!git("fetch", "--quiet", "origin", "master").ok) return dire("GitHub injoignable : on continue sans mise à jour.");
  const avance = Number(git("rev-list", "--count", "origin/master..HEAD").sortie);
  if (avance > 0) return dire(`master a ${avance} commit(s) non poussé(s) : pas de mise à jour.`);
  const retard = Number(git("rev-list", "--count", "HEAD..origin/master").sortie);
  if (!retard) return;
  const avant = git("rev-parse", "HEAD").sortie;
  const fusion = git("merge", "--ff-only", "--quiet", "origin/master");
  if (!fusion.ok) {
    dire("mise à jour refusée par git (des fichiers modifiés localement sont concernés) :");
    console.log(fusion.sortie);
    return;
  }
  dire(`${retard} commit(s) récupéré(s) : ${git("log", "--oneline", "-1").sortie}`);
  return git("diff", "--name-only", avant, "HEAD").sortie.split(/\r?\n/);
}

function mettreAJourDependances() {
  const lock = empreinte(join(racine, "package-lock.json"));
  const installe = existsSync(tampon) ? readFileSync(tampon, "utf8").trim() : "";
  if (lock === installe && existsSync(join(racine, "node_modules", "vite"))) return;
  dire("installation des dépendances (npm ci), une minute…");
  const npm = spawnSync(windows ? "npm.cmd" : "npm", ["ci", "--no-audit", "--no-fund"], {
    cwd: racine,
    stdio: "inherit",
    shell: windows,
  });
  if (npm.status !== 0) return dire("npm ci a échoué : relancer SKITRACK.bat, ou npm ci à la main.");
  // Le binaire d'Electron se télécharge à part, par le script d'installation du paquet.
  const electron = join(racine, "node_modules", "electron");
  if (existsSync(join(electron, "install.js")) && !existsSync(join(electron, "path.txt"))) {
    spawnSync(process.execPath, [join(electron, "install.js")], { cwd: racine, stdio: "inherit" });
  }
  mkdirSync(dirname(tampon), { recursive: true });
  writeFileSync(tampon, `${lock}\n`);
}

const changes = mettreAJourGit() ?? [];
mettreAJourDependances();
process.exit(changes.includes("SKITRACK.bat") ? 3 : 0);
