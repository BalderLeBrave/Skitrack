// Étape 1 du relevé des webcams (docs/WEBCAMS.md) : les stations du
// référentiel, et les caméras que la table leur donne déjà.
//
//   node --experimental-strip-types scripts/webcams/stations.ts [dossier]

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { STATIONS } from "../../src/lib/stations.ts";
import { webcamsForStation } from "../../src/lib/webcams.ts";

const dir = path.resolve(process.argv[2] || "travail/webcams");
mkdirSync(dir, { recursive: true });

const out = STATIONS.map((s) => {
  const cams = webcamsForStation(s.id);
  return {
    id: s.id,
    nom: s.name,
    dept: s.dept,
    commune: s.commune,
    massif: s.massif,
    domaine: s.domain ?? null,
    lat: s.lat,
    lon: s.lon,
    altMax: s.maxM,
    pistesKm: s.pistesKm ?? null,
    camsPropres: cams.filter((c) => !c.duDomaine).map((c) => c.url),
    camsDuDomaine: cams.filter((c) => c.duDomaine).map((c) => c.url),
  };
});
writeFileSync(path.join(dir, "stations.json"), JSON.stringify(out, null, 1));
const sans = out.filter((s) => s.camsPropres.length === 0).length;
console.log(`${out.length} stations, dont ${sans} sans caméra propre : ${path.join(dir, "stations.json")}`);
