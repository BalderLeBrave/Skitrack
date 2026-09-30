// Crée scrape/.venv et y installe les dépendances des workers Airbnb et Booking.
//
// Les collecteurs le trouvent d'eux-mêmes (src/lib/scrape/python.server.ts) :
// plus besoin de renseigner SKITRACK_PYAIRBNB_PYTHON. Sans ce venv, ils
// essaient les Python de la machine, qui n'ont en général ni curl_cffi ni bs4.
//
// Le lancement de l'application (electron-dev.mjs) l'exécute de lui-même, en
// arrière-plan, quand le venv manque ou que ses dépendances ont changé
// (python-scrape.mjs). À la main :
//
//   npm run scrape:python

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { marquerPythonScrape, pythonVenv, REQUIREMENTS } from "./python-scrape.mjs";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const venv = join(racine, "scrape", ".venv");
const py = pythonVenv(racine);

function run(cmd, args) {
  console.log(`> ${[cmd, ...args].join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: racine });
  return r.status === 0;
}

// Un venv à moitié créé (sous Debian sans python3-venv, `python -m venv`
// échoue après avoir posé l'interpréteur, mais sans pip) se refait en entier,
// au lieu d'être réutilisé tel quel à chaque lancement.
const complet = existsSync(py) && spawnSync(py, ["-m", "pip", "--version"], { stdio: "ignore" }).status === 0;

if (!complet) {
  // Le raccourci « python3 » du Microsoft Store n'est pas un interpréteur :
  // sous Windows on passe par le lanceur `py`.
  const bases = process.platform === "win32" ? [["py", ["-3"]], ["python", []]] : [["python3", []], ["python", []]];
  const ok = bases.some(([cmd, pre]) => run(cmd, [...pre, "-m", "venv", "--clear", venv]));
  if (!ok) {
    console.error("Aucun Python 3 n'a pu créer le venv. Installez Python 3.10+ puis relancez.");
    process.exit(1);
  }
}

if (!run(py, ["-m", "pip", "install", "--disable-pip-version-check", ...REQUIREMENTS.flatMap((r) => ["-r", r])])) {
  process.exit(1);
}
marquerPythonScrape(racine);
console.log(`\nVenv prêt : ${py}`);
