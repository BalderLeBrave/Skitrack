/**
 * Les modules npm que le process principal d'Electron (`desktop/main.mjs`)
 * charge depuis app.asar : `electron-updater` et ses dépendances, résolues
 * comme Node les résoudrait. `electron-builder.yml` exclut tous les
 * node_modules d'app.asar (plus de 200 Mo jamais chargés) ; `release-win.mjs`
 * vérifie que ces modules-ci y sont, et qu'ils s'y chargent.
 *
 *   node scripts/modules-desktop.mjs     # la liste, pour electron-builder.yml
 */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");

export const RACINES_DESKTOP = ["electron-updater"];

/** Les dossiers de paquets atteints, relatifs à la racine (`node_modules/…`). */
export function modulesDesktop() {
  const vus = new Set();
  const resoudre = (nom, depuis) => {
    for (let d = depuis; ; d = dirname(d)) {
      const p = join(d, "node_modules", nom);
      if (existsSync(join(p, "package.json"))) return p;
      if (dirname(d) === d) return null;
    }
  };
  const parcourir = (nom, depuis) => {
    const dossier = resoudre(nom, depuis);
    if (!dossier) throw new Error(`module introuvable : ${nom} (depuis ${depuis})`);
    const rel = relative(racine, dossier).split(sep).join("/");
    if (vus.has(rel)) return;
    vus.add(rel);
    const pj = JSON.parse(readFileSync(join(dossier, "package.json"), "utf8"));
    for (const n of Object.keys({ ...pj.dependencies, ...pj.optionalDependencies })) parcourir(n, dossier);
  };
  for (const r of RACINES_DESKTOP) parcourir(r, racine);
  return [...vus].sort();
}

/**
 * Leurs noms, imbriqués compris : electron-builder range les paquets à sa
 * façon dans app.asar (fs-extra/node_modules/universalify y remonte au premier
 * niveau), le motif de `files` doit donc les nommer tous.
 */
export function modulesDesktopHauts() {
  const noms = modulesDesktop().map((r) => r.slice(r.lastIndexOf("node_modules/") + "node_modules/".length));
  return [...new Set(noms)].sort();
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(modulesDesktopHauts().join(","));
}
