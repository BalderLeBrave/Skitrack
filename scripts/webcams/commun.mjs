// Ce que partagent les scripts du relevé des webcams (voir docs/WEBCAMS.md).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Se présenter comme un navigateur, comme le relevé de l'app (consigne du
// propriétaire, 24 sept. 2026).
export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** Le dossier de travail : premier argument, sinon `travail/webcams` (ignoré par git). */
export function dossier(arg) {
  const d = path.resolve(arg || "travail/webcams");
  mkdirSync(d, { recursive: true });
  return d;
}

export const lireJson = (f) => JSON.parse(readFileSync(f, "utf8"));
export const ecrireJson = (f, x) => writeFileSync(f, JSON.stringify(x, null, 1));

/** Sans accents ni casse, ponctuation réduite à des espaces. */
export const plier = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const net = (s) => plier(s).replace(/[^a-z0-9]+/g, " ").trim();
export const slug = (s) =>
  plier(s).replace(/'/g, "-").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const pause = (ms) => new Promise((r) => setTimeout(r, ms));
