#!/usr/bin/env node
/**
 * Publie l'installateur bâti par `npm run release:win` comme Release GitHub
 * (tag v<version>) : c'est là que l'application installée cherche ses mises à
 * jour (`publish` d'electron-builder.yml, desktop/main.mjs).
 *
 *   npm run release:publier
 *
 * Envoie les trois fichiers qu'electron-updater lit : `latest.yml` (version,
 * nom et empreinte SHA-512 de l'installateur), l'installateur, et son
 * `.blockmap` (le téléchargement différentiel : une mise à jour ne reprend que
 * les blocs qui ont changé). Les Releases précédentes doivent rester en ligne :
 * leur .blockmap sert de base au différentiel.
 *
 * Demande `gh` connecté au compte qui peut publier sur le dépôt
 * (`gh auth login`), et le commit courant poussé sur GitHub.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEPOT = "BalderLeBrave/Skitrack";

const echec = (message) => {
  console.error(message);
  process.exit(1);
};
const sortie = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: racine, encoding: "utf8" });
  return { ok: r.status === 0, texte: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
};

const version = JSON.parse(readFileSync(join(racine, "package.json"), "utf8")).version;
const tag = `v${version}`;
const exe = join(racine, "release", `SKITRACK-${version}-x64.exe`);
const fichiers = [join(racine, "release", "latest.yml"), exe, `${exe}.blockmap`];

for (const f of fichiers) if (!existsSync(f)) echec(`Manque ${f} : lancer d'abord npm run release:win.`);
const manifeste = readFileSync(fichiers[0], "utf8");
if (!manifeste.includes(`version: ${version}`) || !manifeste.includes(`SKITRACK-${version}-x64.exe`)) {
  echec(`release/latest.yml ne décrit pas SKITRACK ${version} : relancer npm run release:win.`);
}

if (!sortie("gh", ["auth", "status"]).ok) echec("gh n'est pas connecté : gh auth login.");
if (sortie("gh", ["release", "view", tag, "-R", DEPOT]).ok) {
  echec(`La Release ${tag} existe déjà : monter la version dans package.json, puis npm run release:win.`);
}
const commit = sortie("git", ["rev-parse", "HEAD"]).texte;
if (!sortie("git", ["branch", "-r", "--contains", commit]).texte) {
  echec(`Le commit ${commit.slice(0, 7)} n'est pas sur GitHub : le pousser d'abord.`);
}
if (sortie("git", ["status", "--porcelain", "--untracked-files=no"]).texte) {
  echec("Des modifications ne sont pas commitées : l'installateur ne correspondrait à aucun commit.");
}

console.log(`Publication de ${tag} (${commit.slice(0, 7)}) sur ${DEPOT}…`);
const r = spawnSync(
  "gh",
  ["release", "create", tag, ...fichiers, "-R", DEPOT, "--target", commit, "--title", `SKITRACK ${version}`, "--notes",
    `Installateur Windows de SKITRACK ${version}. Les installations existantes se mettent à jour d'elles-mêmes.`],
  { cwd: racine, stdio: "inherit" },
);
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`Publié : https://github.com/${DEPOT}/releases/tag/${tag}`);
