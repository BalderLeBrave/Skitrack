#!/usr/bin/env node
/**
 * Le navigateur que l'installateur Windows embarque pour Playwright : le
 * « headless shell » de Chromium, à la révision exacte du `playwright-core`
 * du dépôt, celui que Nitro trace dans le serveur bâti.
 *
 *   node scripts/preparer-navigateur.mjs
 *
 * Écrit `build/ms-playwright/` (ignoré par git), que `electron-builder.yml`
 * copie dans les ressources de l'application ; `desktop/main.mjs` le désigne
 * au serveur par `PLAYWRIGHT_BROWSERS_PATH`. Sans lui, l'application installée
 * cherchait le navigateur dans `%LOCALAPPDATA%\ms-playwright`, qui n'existe que
 * sur un poste de développement : CozyCozy (Abritel, Booking, part Cozy
 * d'Airbnb), Gîtes de France, le repli de Booking et celui de HomeToGo
 * échouaient tous chez un tiers.
 *
 * `chromium.launch({ headless: true })` (`src/lib/scrape/browser.server.ts`)
 * lance le headless shell, pas le Chromium complet : seul lui est installé
 * (environ 250 Mo décompressés). Téléchargé depuis le CDN de Playwright.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const cible = join(racine, "build", "ms-playwright");
const require = createRequire(join(racine, "package.json"));

const dossierCore = dirname(require.resolve("playwright-core/package.json"));
const versionCore = JSON.parse(readFileSync(join(dossierCore, "package.json"), "utf8")).version;
const navigateurs = JSON.parse(readFileSync(join(dossierCore, "browsers.json"), "utf8")).browsers;
const shell = navigateurs.find((b) => b.name === "chromium-headless-shell");
if (!shell) throw new Error(`playwright-core ${versionCore} : pas de chromium-headless-shell dans browsers.json`);

/** Le chemin que Playwright cherchera, relatif au dossier des navigateurs. */
export const EXE_SHELL = join(
  `chromium_headless_shell-${shell.revision}`,
  "chrome-headless-shell-win64",
  "chrome-headless-shell.exe",
);

// realpath : lancé par une jonction ou un lien, argv[1] garde le chemin tapé.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`playwright-core ${versionCore}, chromium-headless-shell ${shell.revision}`);
  const r = spawnSync(process.execPath, [join(dossierCore, "cli.js"), "install", "--only-shell", "chromium"], {
    stdio: "inherit",
    cwd: racine,
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: cible },
  });
  if (r.status !== 0) throw new Error("installation du navigateur de Playwright impossible");

  const exe = join(cible, EXE_SHELL);
  if (!existsSync(exe)) throw new Error(`navigateur absent après installation : ${exe}`);

  // Une révision précédente, laissée par un ancien playwright-core, gonflerait
  // l'installateur sans jamais servir.
  const perimees = readdirSync(cible).filter(
    (n) => /^chromium_headless_shell-\d+$/.test(n) && n !== `chromium_headless_shell-${shell.revision}`,
  );
  if (perimees.length) {
    console.error(`Révisions périmées dans ${cible} : ${perimees.join(", ")}. Les supprimer avant l'empaquetage.`);
    process.exit(1);
  }

  // Lancement réel, sans le cache de l'utilisateur : la preuve que Playwright
  // trouve et démarre ce navigateur-là.
  const essai = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { chromium } from "playwright-core";
       const b = await chromium.launch({ headless: true });
       const p = await b.newPage();
       await p.setContent("<title>ok</title>");
       console.log("navigateur embarqué :", b.version(), await p.title());
       await b.close();`,
    ],
    { stdio: "inherit", cwd: racine, env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: cible } },
  );
  if (essai.status !== 0) throw new Error("le navigateur embarqué ne démarre pas");
  console.log(`Navigateur prêt dans ${cible}`);
}
