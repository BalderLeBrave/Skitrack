/**
 * La part du vert parmi les pistes faciles, pays par pays.
 *
 *     node --experimental-strip-types scripts/build-part-verte.ts
 *
 * Écrit `src/lib/monde/data/partVerte.json`.
 *
 * ## À quoi ça sert
 *
 * skiresort.fr classe en trois niveaux — Faciles, Moyennes, Difficiles — là où
 * le dépôt compte en vert, bleu, rouge et noir. « Faciles » fond le vert et le
 * bleu, et rien dans cette source ne permet de les séparer.
 *
 * Plutôt que de couper en deux au hasard, on mesure : parmi les domaines dont
 * OpenSkiMap a relevé les quatre couleurs, quelle part des pistes faciles est
 * verte, dans ce pays-là ?
 *
 * ## Ce que la mesure montre, et qui n'est pas un hasard
 *
 * Les écarts suivent les conventions nationales, et elles sont tranchées :
 * l'Autriche est à 5 %, la Suisse à 6 %, l'Italie et l'Allemagne à 8 % — ces
 * pays classent en bleu, rouge et noir, sans vert. La France est à 33 %, la
 * Suède à 45 %, la Norvège à 57 %.
 *
 * Un partage uniforme à cinquante-cinquante serait donc faux presque partout :
 * dix fois trop de vert en Autriche, et pas assez en Norvège.
 *
 * ## Ce que ça reste
 *
 * Une distribution observée, appliquée là où la mesure manque. **C'est une
 * estimation**, et la valeur qui en sort doit le dire — c'est à quoi sert le
 * champ `partage` de `couleurs.ts`. Le nombre de domaines ayant servi au
 * calcul est écrit à côté de chaque ratio, pour qu'on sache ce qu'il vaut.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");

/** En deçà, l'échantillon ne dit rien : on remonte au continent, puis au monde. */
const ASSEZ = 10;
/** Un domaine de moins de cinq pistes ne pèse pas sur une convention. */
const MINIMUM_PISTES = 5;
/** Et il faut des pistes faciles pour que la question se pose. */
const MINIMUM_FACILES = 3;

type Counts = { green: number; blue: number; red: number; black: number };
type D = { id: string; counts?: Counts };

const parPays = new Map<string, { vert: number; faciles: number; domaines: number }>();
for (const f of readdirSync(DATA)) {
  if (!/^[A-Z]{2}\.json$/.test(f)) continue;
  const cc = f.slice(0, -5);
  for (const d of JSON.parse(readFileSync(resolve(DATA, f), "utf8")) as D[]) {
    const c = d.counts;
    if (!c) continue;
    const total = c.green + c.blue + c.red + c.black;
    const faciles = c.green + c.blue;
    if (total < MINIMUM_PISTES || faciles < MINIMUM_FACILES) continue;
    const e = parPays.get(cc) ?? { vert: 0, faciles: 0, domaines: 0 };
    e.vert += c.green;
    e.faciles += faciles;
    e.domaines++;
    parPays.set(cc, e);
  }
}

const mondial = [...parPays.values()].reduce(
  (a, e) => ({ vert: a.vert + e.vert, faciles: a.faciles + e.faciles, domaines: a.domaines + e.domaines }),
  { vert: 0, faciles: 0, domaines: 0 },
);

const pays: Record<string, { part: number; domaines: number }> = {};
for (const [cc, e] of [...parPays].sort()) {
  if (e.domaines < ASSEZ) continue;
  pays[cc] = { part: Math.round((e.vert / e.faciles) * 1000) / 1000, domaines: e.domaines };
}

const sortie = {
  calcule: new Date().toISOString().slice(0, 10),
  quoi: "part du vert parmi les pistes faciles (vert + bleu), mesurée sur les domaines dont OpenSkiMap a relevé les quatre couleurs",
  regle: `au moins ${ASSEZ} domaines par pays, chacun d'au moins ${MINIMUM_PISTES} pistes dont ${MINIMUM_FACILES} faciles`,
  monde: { part: Math.round((mondial.vert / mondial.faciles) * 1000) / 1000, domaines: mondial.domaines },
  pays,
};

writeFileSync(resolve(DATA, "partVerte.json"), JSON.stringify(sortie, null, 1) + "\n", "utf8");

console.log(`${Object.keys(pays).length} pays ont un échantillon suffisant.`);
console.log(`Part mondiale : ${(sortie.monde.part * 100).toFixed(1)} % sur ${mondial.domaines} domaines.`);
const tri = Object.entries(pays).sort((a, b) => b[1].part - a[1].part);
for (const [cc, e] of [...tri.slice(0, 4), ...tri.slice(-4)]) {
  console.log(`  ${cc}  ${(e.part * 100).toFixed(0).padStart(3)} %   sur ${e.domaines} domaines`);
}
