#!/usr/bin/env node
/**
 * Comble l'écart entre les photos relevées et les copies locales.
 *
 *   node scripts/fetch-missing-photos.mjs           liste l'écart
 *   node scripts/fetch-missing-photos.mjs --write   télécharge et réécrit l'index
 *
 * `src/lib/skiinfo.photos.json` porte 231 URL de photos de station.
 * `public/stations/` en porte 229. Les deux manquantes, `larche` et
 * `le-chazelet`, ont donc une URL relevée mais aucun fichier : `skiinfoPhoto()`
 * rend `null` et la fiche s'affiche sans photo. Ce n'est pas un bug, c'est un
 * téléchargement qui n'a jamais abouti, et il se répare en le relançant.
 *
 * Le script est délibérément sans dépendance : `fetch` et `node:fs` suffisent,
 * et une tâche d'entretien qui s'exécute deux fois par an ne justifie pas
 * d'ajouter quoi que ce soit au `package.json`.
 *
 * Un corps de moins de 20 ko est refusé. Les deux sources répondent 200 avec
 * une page d'erreur HTML quand l'image a bougé, et une page d'erreur écrite
 * dans `public/stations/larche.jpg` serait pire que l'absence : la fiche
 * afficherait fièrement un cadre cassé, et le test des photos compterait 230
 * fichiers en se croyant réparé.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = join(ROOT, "src/lib/skiinfo.photos.json");
const LOCAL = join(ROOT, "src/lib/skiinfo.photos.local.json");
const DIR = join(ROOT, "public/stations");
const MIN_BYTES = 20 * 1024;

const write = process.argv.includes("--write");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Fichiers réellement présents, sans se fier à l'index. */
function filesOnDisk() {
  if (!existsSync(DIR)) return new Set();
  return new Set(
    readdirSync(DIR)
      .filter((f) => f.endsWith(".jpg"))
      .map((f) => f.slice(0, -4)),
  );
}

async function download(id, url) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return { id, ok: false, why: `HTTP ${res.status}` };
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < MIN_BYTES) {
    return { id, ok: false, why: `${bytes.length} octets, sous le seuil de ${MIN_BYTES}` };
  }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, `${id}.jpg`), bytes);
  return { id, ok: true, bytes: bytes.length };
}

async function main() {
  const index = readJson(INDEX);
  const rows = index.rows ?? {};
  const onDisk = filesOnDisk();

  const missing = Object.entries(rows)
    .filter(([, row]) => row && typeof row.url === "string" && row.url.startsWith("http"))
    .filter(([id]) => !onDisk.has(id))
    .map(([id, row]) => ({ id, url: row.url }));

  console.log(`${Object.keys(rows).length} URL relevées, ${onDisk.size} fichiers locaux.`);
  if (missing.length === 0) {
    console.log("Aucun écart : chaque URL relevée a sa copie locale.");
    return;
  }

  console.log(`${missing.length} sans copie locale :`);
  for (const m of missing) console.log(`  ${m.id}  ${m.url}`);

  if (!write) {
    console.log("\nRelancer avec --write pour télécharger.");
    return;
  }

  const done = [];
  for (const m of missing) {
    try {
      const r = await download(m.id, m.url);
      if (r.ok) {
        done.push(r.id);
        console.log(`  ${r.id} : ${r.bytes} octets écrits.`);
      } else {
        console.log(`  ${r.id} : refusé, ${r.why}.`);
      }
    } catch (err) {
      console.log(`  ${m.id} : échec, ${err instanceof Error ? err.message : String(err)}.`);
    }
  }

  if (done.length === 0) {
    console.log("\nRien de téléchargé, l'index reste tel quel.");
    return;
  }

  // L'index local est reconstruit depuis le disque, pas depuis la liste des
  // succès : c'est la seule façon qu'il dise ce qui est vraiment là.
  const files = [...filesOnDisk()].sort();
  const local = readJson(LOCAL);
  writeFileSync(LOCAL, `${JSON.stringify({ at: local.at, files })}\n`, "utf8");
  console.log(`\n${done.length} photo(s) ajoutée(s). ${LOCAL} réécrit : ${files.length} fichiers.`);
  console.log("Le compte de `src/lib/skiinfo.photos.test.ts` est à mettre à jour en conséquence.");
}

await main();
