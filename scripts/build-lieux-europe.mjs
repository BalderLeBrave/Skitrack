#!/usr/bin/env node
/**
 * Les villes et villages d'Europe hors France, et le domaine qu'ils désignent :
 * `src/lib/lieuxEurope.json`, lu par `src/lib/europe.ts`.
 *
 * Source : GeoNames (CC BY 4.0), lieux habités d'au moins 1 000 habitants,
 * tels que le paquet npm `all-the-cities@3.1.0` (MIT) les publie dans
 * `cities.pbf`. download.geonames.org n'étant pas joignable partout, le
 * fichier est lu depuis ce paquet :
 *
 *   npm pack all-the-cities@3.1.0 && tar xzf all-the-cities-3.1.0.tgz
 *   node scripts/build-lieux-europe.mjs package/cities.pbf
 *
 * Chaque lieu à moins de `MAX_KM` d'un domaine européen hors France
 * (`src/lib/monde/data/*.json`) désigne le plus proche, avec la distance.
 * Plus loin, il ne désigne rien : on n'y skie pas.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Pbf from "pbf";

const MAX_KM = 40;
const racine = new URL("..", import.meta.url).pathname;
const pbfPath = process.argv[2];
if (!pbfPath) {
  console.error("usage : node scripts/build-lieux-europe.mjs <cities.pbf>");
  process.exit(1);
}

// Les domaines, comme `europe.ts` les sert : hors France, un par identifiant.
const dir = join(racine, "src/lib/monde/data");
const domaines = [];
const vus = new Set();
for (const f of readdirSync(dir).sort()) {
  const m = /^([A-Z]{2})\.json$/.exec(f);
  if (!m || m[1] === "FR") continue;
  for (const d of JSON.parse(readFileSync(join(dir, f), "utf8"))) {
    const pays = d.pays ?? [m[1]];
    if (pays[0] === "FR" || vus.has(d.id)) continue;
    vus.add(d.id);
    domaines.push({ id: d.id, lat: d.lat, lon: d.lon, pays: pays[0], km: d.km ?? 0 });
  }
}
const paysAvecDomaines = new Set(domaines.map((d) => d.pays));

// `all-the-cities/index.js`, sans son `require` du fichier voisin.
const pbf = new Pbf(readFileSync(pbfPath));
const lieux = [];
let lastLat = 0;
let lastLon = 0;
while (pbf.pos < pbf.length) {
  lieux.push(
    pbf.readMessage(
      (tag, c, p) => {
        if (tag === 1) p.readSVarint();
        else if (tag === 2) c.name = p.readString();
        else if (tag === 3) c.country = p.readString();
        else if (tag >= 4 && tag <= 8) p.readString();
        else if (tag === 9) c.population = p.readVarint();
        else if (tag === 10) c.lon = (lastLon += p.readSVarint()) / 1e5;
        else if (tag === 11) c.lat = (lastLat += p.readSVarint()) / 1e5;
      },
      { name: "", country: "", population: 0, lat: 0, lon: 0 },
    ),
  );
}

function km(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const ids = [];
const indexDe = new Map();
const sortie = [];
for (const l of lieux) {
  if (!paysAvecDomaines.has(l.country) || !l.name) continue;
  let best = null;
  let bestKm = Infinity;
  for (const d of domaines) {
    if (Math.abs(d.lat - l.lat) > 0.5) continue;
    const k = km(l.lat, l.lon, d.lat, d.lon);
    // À distance égale (à 1 km près), le plus grand domaine.
    if (k < bestKm - 1 || (Math.abs(k - bestKm) <= 1 && best && d.km > best.km)) {
      best = d;
      bestKm = k;
    }
  }
  if (!best || bestKm > MAX_KM) continue;
  if (!indexDe.has(best.id)) {
    indexDe.set(best.id, ids.length);
    ids.push(best.id);
  }
  sortie.push([l.name, indexDe.get(best.id), Math.round(bestKm)]);
}
sortie.sort((a, b) => a[0].localeCompare(b[0], "fr"));
writeFileSync(
  join(racine, "src/lib/lieuxEurope.json"),
  JSON.stringify({
    source: "GeoNames (CC BY 4.0) via all-the-cities@3.1.0",
    maxKm: MAX_KM,
    ids,
    lieux: sortie,
  }),
);
console.log(`${sortie.length} lieux, ${ids.length} domaines`);
