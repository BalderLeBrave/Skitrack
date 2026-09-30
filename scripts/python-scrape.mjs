// Le venv des workers Python (scrape/.venv) : où il est, et s'il est à jour.
//
// `npm run scrape:python` (installer-python-scrape.mjs) le crée et y installe
// les dépendances d'Airbnb et de Booking. Il laisse ensuite un tampon, hors de
// scrape/, avec l'empreinte des fichiers requirements.txt : tant que le venv
// existe et que ces fichiers n'ont pas changé, rien n'est à refaire.
// `electron-dev.mjs` lit ce tampon à chaque lancement et relance l'installation
// en arrière-plan quand il manque ou qu'il est périmé.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Les fichiers de dépendances des workers, relatifs à la racine. */
export const REQUIREMENTS = ["airbnb", "booking"].map((w) => join("scrape", w, "requirements.txt"));

/** L'interpréteur du venv, selon la plateforme. */
export function pythonVenv(racine, platform = process.platform) {
  const venv = join(racine, "scrape", ".venv");
  return platform === "win32" ? join(venv, "Scripts", "python.exe") : join(venv, "bin", "python");
}

/** Le tampon laissé par une installation réussie : hors de scrape/, ignoré par git. */
export function cheminTampon(racine) {
  return join(racine, "node_modules", ".cache", "skitrack", "python-scrape.json");
}

/** L'empreinte des requirements.txt : elle change dès qu'une dépendance change. */
export function empreinteRequirements(racine) {
  const h = createHash("sha256");
  for (const f of REQUIREMENTS) {
    const p = join(racine, f);
    h.update(f);
    h.update(existsSync(p) ? readFileSync(p) : "absent");
  }
  return h.digest("hex");
}

/** Vrai quand le venv existe et que ses dépendances sont celles d'aujourd'hui. */
export function pythonScrapeAJour(racine, platform = process.platform) {
  if (!existsSync(pythonVenv(racine, platform))) return false;
  try {
    const t = JSON.parse(readFileSync(cheminTampon(racine), "utf8"));
    return t?.empreinte === empreinteRequirements(racine);
  } catch {
    return false;
  }
}

/** Note une installation réussie. */
export function marquerPythonScrape(racine) {
  const p = cheminTampon(racine);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ empreinte: empreinteRequirements(racine), le: new Date().toISOString() }));
}
