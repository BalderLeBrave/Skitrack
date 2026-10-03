#!/usr/bin/env node
/**
 * L'installateur Windows : l'application bâtie pour un serveur Node (et non
 * pour Vercel, le préréglage par défaut de `vite.config.ts`), puis
 * `electron-builder`.
 *
 *   npm run release:win      # prépare aussi le Python embarqué
 *
 * Vérifie avant d'empaqueter ce que l'installateur doit contenir :
 * - le serveur Nitro (`.output/server/index.mjs`) ;
 * - le Python embarqué et ses modules (`build/python`) ;
 * - les tuiles de la carte des pistes (`build/carte/openskimap-europe.pmtiles`,
 *   hors dépôt : à copier depuis le poste qui les a bâties). Elles ne passent
 *   pas par `public/` : le serveur statique de Nitro ignore `Range`, c'est
 *   `server/middleware/pmtiles-plages.ts` qui les sert. Sans elles, la carte
 *   des pistes de l'app installée reste vide ; l'empaquetage s'arrête.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");

function lancer(cmd, args, env = {}) {
  console.log(`> ${[cmd, ...args].join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: racine, shell: process.platform === "win32", env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const manque = (chemin, quoi) => {
  if (existsSync(join(racine, chemin))) return;
  console.error(`Manque ${quoi} : ${chemin}`);
  process.exit(1);
};

/**
 * Nitro trace les dépendances du serveur : `playwright-core` sait piloter
 * Electron, et le traçage copiait tout le paquet `electron`, binaire compris
 * (326 Mo, relevé le 3 octobre 2026), dans `.output/server/node_modules`. Le
 * serveur ne s'en sert jamais : l'application, elle, tourne déjà sous
 * Electron. On le retire du serveur bâti.
 */
function retirerElectronDuServeur() {
  const dossier = join(racine, ".output", "server", "node_modules", "electron");
  if (existsSync(dossier)) rmSync(dossier, { recursive: true, force: true });
  const paquet = join(racine, ".output", "server", "package.json");
  if (existsSync(paquet)) {
    const p = JSON.parse(readFileSync(paquet, "utf8"));
    if (p.dependencies?.electron) {
      delete p.dependencies.electron;
      writeFileSync(paquet, `${JSON.stringify(p, null, 2)}\n`);
    }
  }
}

manque("build/python/python.exe", "le Python embarqué (node scripts/preparer-python-embarque.mjs)");
manque("build/carte/openskimap-europe.pmtiles", "les tuiles de la carte des pistes (docs/TUILES-OPENSKIMAP.md)");
if (existsSync(join(racine, "public/carte/openskimap-europe.pmtiles"))) {
  console.error("Les tuiles sont aussi dans public/carte : le serveur statique les servirait sans tranches. Les retirer de public/.");
  process.exit(1);
}

lancer("node", ["scripts/with-app-env.mjs", "vite", "build"], { NITRO_PRESET: "node-server" });
manque(".output/server/index.mjs", "le serveur Nitro");
retirerElectronDuServeur();

lancer("npx", ["electron-builder", "--win"]);
