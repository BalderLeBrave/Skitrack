/**
 * Le rattachement des domaines mondiaux aux fiches qui portent leurs couleurs.
 *
 *     node --experimental-strip-types scripts/build-couleurs-monde.ts
 *
 * Écrit `src/lib/monde/data/couleurs.json`.
 *
 * ## Le problème
 *
 * OpenSkiMap compte les tronçons par couleur pour 4 239 domaines sur 5 720.
 * Pour les 1 481 autres, il n'a relevé aucune piste — ce qui n'est pas la même
 * chose que « ce domaine n'a pas de pistes ». Deux relevés du dépôt savent
 * pourtant quelque chose de beaucoup d'entre eux : `skiinfo.json` et
 * `skiresort.json`, tous deux rangés par fiche et non par domaine.
 *
 * Il manque donc une jointure, et elle n'a aucune clé commune : ni identifiant
 * partagé, ni nom comparable — « Les Portes du Soleil » chez l'un,
 * « Portes du Soleil (Morzine/Avoriaz/…) » chez l'autre. **Reste la position.**
 *
 * ## Ce que la jointure vaut
 *
 * Elle rapproche deux points à moins de `RAYON_KM` l'un de l'autre, et c'est
 * tout ce qu'elle affirme. Ce n'est pas une identité : deux domaines voisins
 * d'une même vallée peuvent tomber sous le même rayon, et le plus proche gagne
 * sans que personne n'ait vérifié que c'est le bon.
 *
 * D'où trois choix :
 *
 * 1. **La distance est écrite à côté du rattachement.** Un domaine rattaché à
 *    4,8 km n'est pas un domaine rattaché à 200 m, et l'écran doit pouvoir le
 *    dire.
 * 2. **La fiche retenue est nommée** (son `slug`), pour qu'un rattachement
 *    douteux se vérifie à la main sans relancer quoi que ce soit.
 * 3. **On écrit les valeurs brutes de la source, pas une répartition calculée.**
 *    La règle qui en tire quatre couleurs vit dans `monde/couleurs.ts` et n'est
 *    écrite qu'une fois ; la recopier ici en ferait une seconde, que la
 *    prochaine mesure de `partVerte.json` laisserait en arrière.
 *
 * ## Ce que ce fichier ne contient pas
 *
 * Les domaines qu'OpenSkiMap mesure déjà : leur répartition est dans leur
 * propre enregistrement, et `repartition()` la préfère de toute façon. Ce
 * fichier ne porte que le recours.
 *
 * Il ne contient pas non plus le recours par les pistes du GeoPackage, qui
 * ajoutait 159 domaines dans l'analyse : ce fichier de 2 Go n'est pas dans le
 * dépôt, et un script du dépôt ne dépend pas d'un téléchargement local.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../src/lib/monde/data");

/**
 * Le rayon de rattachement.
 *
 * Cinq kilomètres : c'est l'ordre de grandeur d'un domaine, et la distance
 * qui sépare le point de référence d'OpenSkiMap — souvent le barycentre des
 * pistes — du point d'une fiche, qui pointe plutôt le village. Au-delà, on ne
 * rattache plus, on suppose.
 */
const RAYON_KM = 5;

type Point = { lat: number; lon: number };

type FicheSkiinfo = Point & {
  slug: string;
  nom: string;
  pct: { vertes: number; bleues: number; rouges: number; noires: number } | null;
};

type FicheSkiresort = Point & {
  slug: string;
  nom: string;
  kmFaciles: number | null;
  kmMoyennes: number | null;
  kmDifficiles: number | null;
};

type Domaine = {
  id: string;
  nom: string;
  lat: number;
  lon: number;
  counts?: { green: number; blue: number; red: number; black: number } | null;
};

function km(a: Point, b: Point): number {
  const r = Math.PI / 180;
  const p1 = a.lat * r;
  const p2 = b.lat * r;
  const dp = (b.lat - a.lat) * r;
  const dl = (b.lon - a.lon) * r;
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Une grille au degré, pour ne pas comparer 5 720 domaines à 8 337 fiches.
 *
 * Chaque fiche est rangée dans sa case et dans les huit qui l'entourent : une
 * recherche n'a plus qu'à lire la case du domaine. Le rayon retenu étant très
 * inférieur au degré, aucun voisin utile n'échappe à ce voisinage.
 */
function grille<T extends Point>(points: readonly T[]): Map<string, T[]> {
  const g = new Map<string, T[]>();
  for (const p of points) {
    const la = Math.floor(p.lat);
    const lo = Math.floor(p.lon);
    for (let dla = -1; dla <= 1; dla++) {
      for (let dlo = -1; dlo <= 1; dlo++) {
        const k = `${la + dla}|${lo + dlo}`;
        const lot = g.get(k);
        if (lot) lot.push(p);
        else g.set(k, [p]);
      }
    }
  }
  return g;
}

/** La fiche la plus proche dans le rayon, et sa distance. */
function laPlusProche<T extends Point>(
  d: Point,
  g: Map<string, T[]>,
): { fiche: T; km: number } | null {
  const lot = g.get(`${Math.floor(d.lat)}|${Math.floor(d.lon)}`);
  if (!lot) return null;
  let meilleure: T | null = null;
  let meilleurKm = RAYON_KM;
  for (const f of lot) {
    const dist = km(d, f);
    if (dist <= meilleurKm) {
      meilleurKm = dist;
      meilleure = f;
    }
  }
  return meilleure ? { fiche: meilleure, km: meilleurKm } : null;
}

function lire<T>(nom: string): T {
  return JSON.parse(readFileSync(resolve(DATA, nom), "utf8")) as T;
}

// ─── Les domaines, tous pays confondus ────────────────────────────────────────

const domaines: Domaine[] = [];
for (const f of readdirSync(DATA).sort()) {
  if (!/^[A-Z]{2}\.json$/.test(f)) continue;
  domaines.push(...lire<Domaine[]>(f));
}

/** Un domaine dont OpenSkiMap compte au moins un tronçon coloré n'a besoin de
 *  personne. Zéro tronçon coloré n'est pas une répartition : c'est une absence. */
function mesureParOpenSkiMap(d: Domaine): boolean {
  const c = d.counts;
  if (!c) return false;
  return c.green + c.blue + c.red + c.black >= 1;
}

const orphelins = domaines.filter((d) => !mesureParOpenSkiMap(d));

// ─── Les deux relevés ─────────────────────────────────────────────────────────

type Releve<T> = { releve: string; source: string; fiches: Record<string, T> };

const skiinfo = lire<Releve<FicheSkiinfo & { lat: number | null; lon: number | null }>>("skiinfo.json");
const skiresort = lire<Releve<FicheSkiresort & { lat: number | null; lon: number | null }>>("skiresort.json");

const fichesSkiinfo = Object.values(skiinfo.fiches).filter(
  (f): f is FicheSkiinfo => f.lat != null && f.lon != null && f.pct != null,
);

const fichesSkiresort = Object.values(skiresort.fiches).filter(
  (f): f is FicheSkiresort =>
    f.lat != null &&
    f.lon != null &&
    (f.kmFaciles != null || f.kmMoyennes != null || f.kmDifficiles != null),
);

const gSkiinfo = grille(fichesSkiinfo);
const gSkiresort = grille(fichesSkiresort);

// ─── La jointure ──────────────────────────────────────────────────────────────

type Rattachement =
  | {
      s: "skiinfo";
      ref: string;
      nom: string;
      km: number;
      skiinfo: { vertes: number; bleues: number; rouges: number; noires: number };
    }
  | {
      s: "skiresort";
      ref: string;
      nom: string;
      km: number;
      skiresort: { faciles: number | null; moyennes: number | null; difficiles: number | null };
    };

const rattaches: Record<string, Rattachement> = {};
let parSkiinfo = 0;
let parSkiresort = 0;

for (const d of orphelins) {
  const si = laPlusProche(d, gSkiinfo);
  if (si) {
    rattaches[d.id] = {
      s: "skiinfo",
      ref: si.fiche.slug,
      nom: si.fiche.nom,
      km: Math.round(si.km * 100) / 100,
      skiinfo: si.fiche.pct,
    };
    parSkiinfo++;
    continue;
  }
  const sr = laPlusProche(d, gSkiresort);
  if (sr) {
    rattaches[d.id] = {
      s: "skiresort",
      ref: sr.fiche.slug,
      nom: sr.fiche.nom,
      km: Math.round(sr.km * 100) / 100,
      skiresort: {
        faciles: sr.fiche.kmFaciles,
        moyennes: sr.fiche.kmMoyennes,
        difficiles: sr.fiche.kmDifficiles,
      },
    };
    parSkiresort++;
  }
}

const sortie = {
  calcule: new Date().toISOString().slice(0, 10),
  quoi: "rattachement, par la position, des domaines qu'OpenSkiMap ne mesure pas aux fiches Skiinfo et skiresort qui portent une répartition",
  regle: `la fiche la plus proche à ${RAYON_KM} km au plus, Skiinfo avant skiresort ; la distance retenue est écrite avec le rattachement`,
  rayonKm: RAYON_KM,
  releves: { skiinfo: skiinfo.releve, skiresort: skiresort.releve },
  domaines: domaines.length,
  mesuresOpenSkiMap: domaines.length - orphelins.length,
  rattachesSkiinfo: parSkiinfo,
  rattachesSkiresort: parSkiresort,
  rattachements: rattaches,
};

writeFileSync(
  resolve(DATA, "couleurs.json"),
  JSON.stringify(sortie, null, 1) + "\n",
  "utf8",
);

const couverts = sortie.mesuresOpenSkiMap + parSkiinfo + parSkiresort;
const pct = (n: number) => `${((n / domaines.length) * 100).toFixed(1)} %`;
console.log(`Domaines du référentiel          : ${domaines.length}`);
console.log(`  mesurés par OpenSkiMap         : ${sortie.mesuresOpenSkiMap.toString().padStart(5)}   ${pct(sortie.mesuresOpenSkiMap)}`);
console.log(`  rattachés à une fiche Skiinfo  : ${parSkiinfo.toString().padStart(5)}   ${pct(parSkiinfo)}`);
console.log(`  rattachés à une fiche skiresort: ${parSkiresort.toString().padStart(5)}   ${pct(parSkiresort)}`);
console.log(`  aucune couleur possible        : ${(domaines.length - couverts).toString().padStart(5)}   ${pct(domaines.length - couverts)}`);
console.log(`                                   ───── cumul ${pct(couverts)}`);
