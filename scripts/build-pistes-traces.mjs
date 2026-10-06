#!/usr/bin/env node
/**
 * Les tracés des pistes par domaine, pour mesurer la piste la plus proche
 * d'un logement (fiche d'annonce, `src/lib/stay/accesPistes.ts`).
 *
 *   node scripts/build-pistes-traces.mjs <runs.geojson> [<date du téléchargement AAAA-MM-JJ>]
 *
 * `runs.geojson` est le fichier d'openskidata.org tel qu'il est publié
 * (https://tiles.openskimap.org/geojson/runs.geojson, 835 Mo le 6 oct. 2026) :
 * une piste par ligne, lue en flux, sans dépendance.
 *
 * `public/pistes-detail/` porte le détail des pistes de chaque domaine, mais
 * seulement leur point le plus bas : on ne peut pas y mesurer une distance à
 * une piste. Ce script écrit, pour chacun de ses domaines, les lignes des
 * pistes de descente qui passent dans son emprise (les points bas de ses
 * tronçons, plus 2 km de marge). Choisir par l'emprise plutôt que par
 * l'identifiant de domaine : l'identifiant change d'un export à l'autre
 * (`build-pistes-detail.py`), et la piste la plus proche d'un logement peut
 * appartenir au domaine voisin.
 *
 * Les tracés sont simplifiés à 3 m près (Douglas-Peucker) et arrondis à cinq
 * décimales, soit un mètre environ. Une surface (polygone) garde son contour
 * extérieur.
 *
 * Sortie : `public/pistes-traces/<domaine de tête>.json`, même nom que dans
 * `public/pistes-detail/`, et un rapport sur la sortie standard.
 */

import { createReadStream, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const DETAIL = join(RACINE, "public", "pistes-detail");
const SORTIE = join(RACINE, "public", "pistes-traces");
const MARGE_M = 2000;
const TOLERANCE_M = 3;
const SOURCE = "openskidata.org runs.geojson (pistes de descente), tracés simplifiés à 3 m (scripts/build-pistes-traces.mjs)";

const [, , fichierRuns, dateArg] = process.argv;
if (!fichierRuns) {
  console.error("usage : node scripts/build-pistes-traces.mjs <runs.geojson> [AAAA-MM-JJ]");
  process.exit(1);
}
const le = dateArg ?? statSync(fichierRuns).mtime.toISOString().slice(0, 10);

/** Mètres par degré, autour d'une latitude. */
function echelle(lat) {
  return { x: 111_320 * Math.cos((lat * Math.PI) / 180), y: 110_540 };
}

/** L'emprise d'un domaine : ses points bas, plus la marge. */
function emprise(detail) {
  const pts = detail.troncons.map((t) => t.bas).filter(Boolean);
  if (!pts.length) return null;
  const lats = pts.map((p) => p[1]);
  const lons = pts.map((p) => p[0]);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const e = echelle(lat0);
  return {
    s: Math.min(...lats) - MARGE_M / e.y,
    n: Math.max(...lats) + MARGE_M / e.y,
    o: Math.min(...lons) - MARGE_M / e.x,
    e: Math.max(...lons) + MARGE_M / e.x,
  };
}

/** Douglas-Peucker en mètres, sur une projection locale. */
function simplifier(pts) {
  if (pts.length <= 2) return pts;
  const e = echelle(pts[0][1]);
  const xy = pts.map(([lon, lat]) => [lon * e.x, lat * e.y]);
  const garder = new Uint8Array(pts.length);
  garder[0] = garder[pts.length - 1] = 1;
  const pile = [[0, pts.length - 1]];
  while (pile.length) {
    const [a, b] = pile.pop();
    let max = 0;
    let k = -1;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > max) {
        max = d;
        k = i;
      }
    }
    if (k >= 0 && max > TOLERANCE_M) {
      garder[k] = 1;
      pile.push([a, k], [k, b]);
    }
  }
  return pts.filter((_, i) => garder[i]);
}

const r5 = (v) => Math.round(v * 1e5) / 1e5;

/** Les lignes d'une géométrie : une ligne, plusieurs, ou le contour d'une surface. */
function lignes(g) {
  if (!g) return [];
  if (g.type === "LineString") return [g.coordinates];
  if (g.type === "MultiLineString") return g.coordinates;
  if (g.type === "Polygon") return [g.coordinates[0]];
  if (g.type === "MultiPolygon") return g.coordinates.map((p) => p[0]);
  return [];
}

// Les domaines de `public/pistes-detail/`, et leur emprise.
const domaines = [];
for (const f of readdirSync(DETAIL).filter((f) => f.endsWith(".json"))) {
  const detail = JSON.parse(readFileSync(join(DETAIL, f), "utf8"));
  const b = emprise(detail);
  if (b) domaines.push({ fichier: f, nom: detail.nom, b, pistes: [] });
}

let lues = 0;
let descente = 0;
const lecture = createInterface({ input: createReadStream(fichierRuns, { encoding: "utf8" }), crlfDelay: Infinity });
for await (const brute of lecture) {
  const ligne = brute.trim().replace(/,$/, "");
  if (!ligne.startsWith('{"type":"Feature"')) continue;
  lues++;
  const f = JSON.parse(ligne);
  const p = f.properties ?? {};
  if (!Array.isArray(p.uses) || !p.uses.includes("downhill")) continue;
  descente++;
  const traits = lignes(f.geometry).filter((l) => l.length >= 2);
  if (!traits.length) continue;
  for (const d of domaines) {
    const dans = traits.some((l) => l.some(([lon, lat]) => lat >= d.b.s && lat <= d.b.n && lon >= d.b.o && lon <= d.b.e));
    if (!dans) continue;
    for (const l of traits) {
      d.pistes.push({
        n: typeof p.name === "string" && p.name.trim() ? p.name.trim() : null,
        r: typeof p.ref === "string" && p.ref.trim() ? p.ref.trim() : null,
        d: typeof p.difficulty === "string" ? p.difficulty : null,
        l: simplifier(l.map(([lon, lat]) => [lon, lat])).map(([lon, lat]) => [r5(lon), r5(lat)]),
      });
    }
  }
}

mkdirSync(SORTIE, { recursive: true });
let octets = 0;
for (const d of domaines) {
  const texte = JSON.stringify({ domaine: d.fichier.replace(/\.json$/, ""), nom: d.nom, le, source: SOURCE, pistes: d.pistes });
  writeFileSync(join(SORTIE, d.fichier), texte);
  octets += texte.length;
}
const vides = domaines.filter((d) => !d.pistes.length).map((d) => d.nom);
console.log(`${lues} tracés lus, ${descente} de descente ; ${domaines.length} domaines écrits, ${(octets / 1e6).toFixed(1)} Mo.`);
if (vides.length) console.log(`Sans piste dans l'emprise : ${vides.join(", ")}`);
