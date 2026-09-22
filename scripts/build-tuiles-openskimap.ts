/**
 * Les tuiles vectorielles des pistes, remontées, domaines et points de ski
 * d'Europe, dans un seul fichier PMTiles — nos tuiles, bâties chez nous.
 *
 *     node --experimental-strip-types --max-old-space-size=12000 \
 *       scripts/build-tuiles-openskimap.ts <dossier des eu-*.geojson> [sortie.pmtiles]
 *
 * ## Pourquoi ce fichier existe
 *
 * OpenSkiMap interdit l'usage direct de ses tuiles (« Direct use of tiles
 * hosted at tiles.openskimap.org is not permitted. Please prepare and host
 * your own tiles using the data from openskidata.org instead. ») et son
 * serveur le fait respecter. Voici donc les tuiles préparées comme ils le
 * demandent : à partir des données ouvertes d'openskidata.org, découpées au
 * périmètre de Skitrack par `filtrer-openskidata-europe.py`.
 *
 * ## Semblables aux leurs, en tout ce qui se voit
 *
 * Le dépôt openskidata-processor est public ; ce script en reprend ce qui
 * décide de l'apparence :
 *
 * - **les mêmes couches** — `skiareas`, `lifts`, `runs`, `spots` — aux
 *   mêmes zooms que `TilesGenerator.ts` (domaines dès z0, remontées dès z5,
 *   pistes et points dès z9, tout jusqu'à z15) ;
 * - **les mêmes attributs**, calculés par les mêmes fonctions : ce script
 *   est un portage de `MapboxGLFormatter.ts`, et appelle `openskidata-format`
 *   — le paquet npm d'OpenSkiMap — pour les couleurs des pistes, le nom et
 *   le type des remontées, exactement comme le fait leur pipeline. Seuls
 *   manquent les attributs que le style ne lit jamais (`skiAreas`,
 *   `stationIds`, `tunnel`, `difficulty`) : des identifiants de quarante
 *   caractères répétés dans chaque tuile, un tiers du fichier pour rien.
 *
 * Ce qui diffère : leur découpage passe par tippecanoe, un binaire Linux ;
 * ici c'est geojson-vt, en Node, faute de Linux sur ce poste. Les tracés
 * sont les mêmes ; la simplification aux zooms bas et l'élagage des tuiles
 * trop denses suivent une règle voisine (une tuile est tenue sous 500 ko
 * compressés, comme la limite par défaut de tippecanoe) mais pas le même
 * algorithme. À z13 et au-delà, là où l'on regarde une station, rien ne
 * distingue les deux.
 *
 * ## Le format PMTiles, écrit ici
 *
 * Aucune bibliothèque Node n'écrit de PMTiles v3 ; le format est simple et
 * documenté (protomaps/PMTiles, spec/v3), il est écrit ici : en-tête de
 * 127 octets, répertoire racine (16 ko au plus, sinon des feuilles),
 * métadonnées JSON, données des tuiles rangées dans l'ordre de la courbe de
 * Hilbert (`zxyToTileId` du paquet `pmtiles`), le tout compressé en gzip.
 * Deux tuiles identiques ne sont écrites qu'une fois. Le fichier est relu à
 * la fin par le lecteur officiel, et trois tuiles sont décodées : si ça ne
 * passe pas, le script échoue.
 */

import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, readSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";
import { PMTiles, zxyToTileId, type Source, type RangeResponse } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import Protobuf from "pbf";
import centroid from "@turf/centroid";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import { lineString } from "@turf/helpers";
import {
  getLiftColor,
  getLiftNameAndType,
  getRunColorName,
  runColorNameToValue,
} from "openskidata-format";

const ENTREE = resolve(process.argv[2] ?? ".");
const SORTIE = resolve(process.argv[3] ?? "public/carte/openskimap-europe.pmtiles");
/**
 * OpenSkiMap va jusqu'à z15. Ici, z14 par défaut : MapLibre sur-zoome la
 * dernière tuile, et à 4096 unités par tuile, z14 place un point à 0,6 m
 * près — rien ne se voit —, pour un fichier deux fois moins lourd. `--z 15`
 * pour l'identique.
 */
const zArg = process.argv.indexOf("--z");
const MAXZOOM = zArg > 0 ? Number(process.argv[zArg + 1]) : 14;
/** Limite de tippecanoe par défaut : 500 ko par tuile. */
const TUILE_MAX = 500_000;

type Props = Record<string, unknown>;
type Feature = { type: "Feature"; geometry: GeoJSON.Geometry; properties: Props };

// ── Le formatage des attributs : portage de MapboxGLFormatter.ts ──────────

/** Les tableaux deviennent du JSON, comme tippecanoe ; les nuls disparaissent. */
function propre(p: Props): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === null || v === undefined) continue;
    out[k] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return out;
}

function nomAvecRef(name: unknown, ref: unknown): string | null {
  if (ref == null) return (name as string | null) ?? null;
  if (name == null) return ref as string;
  return `${ref} - ${name}`;
}

const USAGE_TUILE: Record<string, string> = { downhill: "downhill", nordic: "nordic", skitour: "skitour" };

function formaterPiste(f: Feature): Feature | null {
  const p = f.properties as { uses?: string[]; [k: string]: unknown };
  const uses = p.uses ?? [];
  if (uses.length && uses.every((u) => u === "connection")) return null;
  const colorName = getRunColorName(p.difficultyConvention as never, (p.difficulty as never) ?? null);
  const out: Props = {
    id: p.id,
    name: nomAvecRef(p.name, p.ref),
    oneway: p.oneway,
    lit: p.lit,
    gladed: p.gladed,
    patrolled: p.patrolled,
    color: runColorNameToValue(colorName),
    colorName,
    grooming: p.grooming,
    snowmaking: p.snowmaking,
    snowfarming: p.snowfarming,
  };
  // Un décalage par usage, centré : la piste mixte se dessine en deux traits
  // côte à côte, comme chez eux.
  const usages = [...new Set(uses.map((u) => USAGE_TUILE[u] ?? "other"))].sort();
  usages.forEach((u, i) => {
    out[u] = i - (usages.length - 1) / 2;
  });
  return { type: "Feature", geometry: f.geometry, properties: propre(out) };
}

function formaterRemontee(f: Feature): Feature {
  const p = f.properties;
  const out: Props = {
    id: p.id,
    name_and_type: nomAvecRef(getLiftNameAndType(p as never), p.ref),
    color: getLiftColor(p.status as never),
    status: p.status,
    access: p.access,
  };
  return { type: "Feature", geometry: f.geometry, properties: propre(out) };
}

function formaterPoint(f: Feature): Feature {
  const p = f.properties;
  const base: Props = { id: p.id, spotType: p.spotType };
  if (p.spotType === "lift_station") {
    Object.assign(base, { name: p.name, liftId: p.liftId, position: p.position, entry: p.entry, exit: p.exit });
  } else if (p.spotType === "crossing") {
    base.dismount = p.dismount;
  }
  return { type: "Feature", geometry: f.geometry, properties: propre(base) };
}

type Stats = {
  runs?: { byActivity?: Record<string, { byDifficulty?: Record<string, { lengthInKm: number }> }> };
  minElevation?: number;
  maxElevation?: number;
};

function distance(parDifficulte: Record<string, { lengthInKm: number }> | undefined): number {
  return Object.values(parDifficulte ?? {}).reduce((d, v) => d + (v.lengthInKm ?? 0), 0);
}

function nomCourt(name: unknown): string | null {
  const n = name as string | null;
  return n && n.length > 20 ? n.split("(")[0]!.trim() : n;
}

/** `centralPointsInFeature` de GeoTransforms.ts : un point sûr d'être dans le polygone. */
function pointCentral(g: GeoJSON.Geometry): GeoJSON.Point | GeoJSON.MultiPoint {
  if (g.type === "Point") return g;
  if (g.type === "MultiPolygon") {
    return {
      type: "MultiPoint",
      coordinates: g.coordinates.map(
        (c) => (pointCentral({ type: "Polygon", coordinates: c }) as GeoJSON.Point).coordinates,
      ),
    };
  }
  if (g.type !== "Polygon") throw new Error(`géométrie de domaine inattendue : ${g.type}`);
  const centre = centroid(g).geometry;
  if (booleanPointInPolygon(centre, g)) return centre;
  let meilleur: GeoJSON.Feature<GeoJSON.Point> | null = null;
  for (const anneau of g.coordinates) {
    const proche = nearestPointOnLine(lineString(anneau), centre);
    if (!meilleur || (proche.properties.dist ?? Infinity) < (meilleur.properties.dist ?? Infinity)) meilleur = proche;
  }
  return meilleur!.geometry;
}

function formaterDomaine(f: Feature): Feature {
  const p = f.properties;
  const s = (p.statistics as Stats | null) ?? null;
  const descente = s?.runs?.byActivity?.downhill?.byDifficulty;
  const nordique = s?.runs?.byActivity?.nordic?.byDifficulty;
  const out: Props = {
    id: p.id,
    name: nomCourt(p.name),
    status: p.status,
    downhillDistance: descente ? Math.round(distance(descente)) : null,
    nordicDistance: nordique ? Math.round(distance(nordique)) : null,
    maxElevation: s?.maxElevation != null ? Math.round(s.maxElevation) : null,
    vertical:
      s?.maxElevation != null && s?.minElevation != null ? Math.round(s.maxElevation - s.minElevation) : null,
  };
  const activites = (p.activities as string[] | undefined) ?? [];
  if (activites.includes("downhill")) out.has_downhill = true;
  if (activites.includes("nordic")) out.has_nordic = true;
  return { type: "Feature", geometry: pointCentral(f.geometry), properties: propre(out) };
}

// ── Lecture et index ─────────────────────────────────────────────────────

function lire(jeu: string, formater: (f: Feature) => Feature | null): Feature[] {
  const brut = JSON.parse(readFileSync(resolve(ENTREE, `eu-${jeu}.geojson`), "utf8")) as { features: Feature[] };
  const out: Feature[] = [];
  for (const f of brut.features) {
    const g = formater(f);
    if (g) out.push(g);
  }
  console.log(`${jeu.padEnd(10)} ${brut.features.length} lus, ${out.length} tuilés`);
  return out;
}

type Couche = {
  nom: string;
  minzoom: number;
  index: ReturnType<typeof geojsonvt>;
  champs: Record<string, "String" | "Number" | "Boolean">;
};

function indexer(nom: string, minzoom: number, features: Feature[], champs: Couche["champs"]): Couche {
  const index = new geojsonvt(
    { type: "FeatureCollection", features } as never,
    { maxZoom: MAXZOOM, indexMaxZoom: 5, indexMaxPoints: 100_000, tolerance: 3, extent: 4096, buffer: 64 },
  );
  return { nom, minzoom, index, champs };
}

// ── PMTiles ──────────────────────────────────────────────────────────────

type Entree = { tileId: number; offset: number; length: number; runLength: number };

function varint(n: number, out: number[]): void {
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
}

function serialiser(entrees: Entree[]): Buffer {
  const out: number[] = [];
  varint(entrees.length, out);
  let dernier = 0;
  for (const e of entrees) {
    varint(e.tileId - dernier, out);
    dernier = e.tileId;
  }
  for (const e of entrees) varint(e.runLength, out);
  for (const e of entrees) varint(e.length, out);
  for (let i = 0; i < entrees.length; i++) {
    const e = entrees[i]!;
    const p = entrees[i - 1];
    varint(i > 0 && p && e.offset === p.offset + p.length ? 0 : e.offset + 1, out);
  }
  return gzipSync(Buffer.from(out));
}

/** Racine de 16 ko au plus ; au-delà, des feuilles, de plus en plus larges. */
function repertoires(entrees: Entree[]): { racine: Buffer; feuilles: Buffer } {
  const seule = serialiser(entrees);
  if (seule.length <= 16_384) return { racine: seule, feuilles: Buffer.alloc(0) };
  for (let taille = 4096; ; taille *= 2) {
    const morceaux: Buffer[] = [];
    const racineEntrees: Entree[] = [];
    let offset = 0;
    for (let i = 0; i < entrees.length; i += taille) {
      const feuille = serialiser(entrees.slice(i, i + taille));
      racineEntrees.push({ tileId: entrees[i]!.tileId, offset, length: feuille.length, runLength: 0 });
      morceaux.push(feuille);
      offset += feuille.length;
    }
    const racine = serialiser(racineEntrees);
    if (racine.length <= 16_384) return { racine, feuilles: Buffer.concat(morceaux) };
  }
}

function entete(champs: {
  racine: number;
  metadonnees: number;
  feuilles: number;
  tuiles: number;
  adressees: number;
  entrees: number;
  contenus: number;
  minzoom: number;
  bornes: [number, number, number, number];
}): Buffer {
  const b = Buffer.alloc(127);
  b.write("PMTiles", 0, "latin1");
  b.writeUInt8(3, 7);
  let pos = 127;
  const u64 = (o: number, v: number) => b.writeBigUInt64LE(BigInt(v), o);
  u64(8, pos);
  u64(16, champs.racine);
  pos += champs.racine;
  u64(24, pos);
  u64(32, champs.metadonnees);
  pos += champs.metadonnees;
  u64(40, pos);
  u64(48, champs.feuilles);
  pos += champs.feuilles;
  u64(56, pos);
  u64(64, champs.tuiles);
  u64(72, champs.adressees);
  u64(80, champs.entrees);
  u64(88, champs.contenus);
  b.writeUInt8(1, 96); // groupé
  b.writeUInt8(2, 97); // répertoires en gzip
  b.writeUInt8(2, 98); // tuiles en gzip
  b.writeUInt8(1, 99); // MVT
  b.writeUInt8(champs.minzoom, 100);
  b.writeUInt8(MAXZOOM, 101);
  const [ouest, sud, est, nord] = champs.bornes;
  b.writeInt32LE(Math.round(ouest * 1e7), 102);
  b.writeInt32LE(Math.round(sud * 1e7), 106);
  b.writeInt32LE(Math.round(est * 1e7), 110);
  b.writeInt32LE(Math.round(nord * 1e7), 114);
  b.writeUInt8(5, 118);
  b.writeInt32LE(Math.round(((ouest + est) / 2) * 1e7), 119);
  b.writeInt32LE(Math.round(((sud + nord) / 2) * 1e7), 123);
  return b;
}

// ── Le découpage ─────────────────────────────────────────────────────────

function bornesDe(features: Feature[]): [number, number, number, number] {
  let o = 180,
    s = 90,
    e = -180,
    n = -90;
  const visite = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") {
      const [x, y] = c as number[];
      o = Math.min(o, x!);
      e = Math.max(e, x!);
      s = Math.min(s, y!);
      n = Math.max(n, y!);
    } else for (const x of c) visite(x);
  };
  for (const f of features) visite((f.geometry as { coordinates?: unknown }).coordinates);
  return [o, s, e, n];
}

function empreinte(id: unknown): number {
  const h = createHash("md5").update(String(id)).digest();
  return h.readUInt32LE(0) % 1000;
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const domaines = lire("ski_areas", formaterDomaine);
  const remontees = lire("lifts", formaterRemontee);
  const pistes = lire("runs", formaterPiste);
  const points = lire("spots", formaterPoint);
  const bornes = bornesDe([...pistes, ...remontees, ...domaines]);
  console.log(`emprise : ${bornes.map((v) => v.toFixed(2)).join(", ")}`);

  const couches: Couche[] = [
    indexer("skiareas", 0, domaines, {
      id: "String", name: "String", status: "String", downhillDistance: "Number", nordicDistance: "Number",
      maxElevation: "Number", vertical: "Number", has_downhill: "Boolean", has_nordic: "Boolean",
    }),
    indexer("lifts", 5, remontees, {
      id: "String", name_and_type: "String", color: "String", status: "String", access: "String",
    }),
    indexer("runs", 9, pistes, {
      id: "String", name: "String", oneway: "Boolean", lit: "Boolean", gladed: "Boolean",
      patrolled: "Boolean", color: "String", colorName: "String", grooming: "String", snowmaking: "Boolean",
      snowfarming: "Boolean", downhill: "Number", nordic: "Number", skitour: "Number", other: "Number",
    }),
    indexer("spots", 9, points, {
      id: "String", spotType: "String", name: "String", liftId: "String", position: "String",
      entry: "Boolean", exit: "Boolean", dismount: "String",
    }),
  ];
  console.log(`index construits en ${((Date.now() - t0) / 1000).toFixed(0)} s`);

  // Les tuiles vont d'abord dans un fichier de travail, dans l'ordre où elles
  // sortent ; elles sont recopiées dans l'ordre de Hilbert à la fin.
  const travail = SORTIE + ".tmp";
  const fd = openSync(travail, "w");
  let position = 0;
  const brouillon: { tileId: number; offset: number; length: number; hash: string }[] = [];
  let elaguees = 0;
  let minzoom = MAXZOOM;

  // Frontière : par couche, les tuiles non vides du zoom précédent, dont
  // seuls les enfants peuvent porter quelque chose.
  let frontiere = new Map<string, Set<string>>(couches.map((c) => [c.nom, new Set(["0/0"])]));
  for (let z = 0; z <= MAXZOOM; z++) {
    const candidates = new Set<string>();
    const suivante = new Map<string, Set<string>>(couches.map((c) => [c.nom, new Set()]));
    if (z === 0) candidates.add("0/0");
    else
      for (const s of frontiere.values())
        for (const k of s) {
          const [x, y] = k.split("/").map(Number) as [number, number];
          for (const dx of [0, 1]) for (const dy of [0, 1]) candidates.add(`${2 * x + dx}/${2 * y + dy}`);
        }
    let nb = 0;
    for (const k of candidates) {
      const [x, y] = k.split("/").map(Number) as [number, number];
      const parent = z === 0 ? "0/0" : `${x >> 1}/${y >> 1}`;
      const parties: Record<string, { features: unknown[] }> = {};
      for (const c of couches) {
        if (!frontiere.get(c.nom)!.has(parent)) continue;
        const t = c.index.getTile(z, x, y) as { features: { tags: Props }[] } | null;
        if (!t || !t.features.length) continue;
        suivante.get(c.nom)!.add(k);
        if (z >= c.minzoom) parties[c.nom] = t;
      }
      if (!Object.keys(parties).length) continue;
      let gz = gzipSync(vtpbf.fromGeojsonVt(parties as never, { version: 2, extent: 4096 }), { level: 9 });
      // Trop dense : on éclaircit les pistes par tranches, au hasard mais
      // toujours le même (empreinte de l'identifiant), jusqu'à passer.
      if (gz.length > TUILE_MAX && parties.runs) {
        const toutes = parties.runs.features as { tags: Props }[];
        for (const pour1000 of [700, 500, 350, 250, 150, 100, 60]) {
          parties.runs = { features: toutes.filter((f) => empreinte(f.tags.id) < pour1000) };
          gz = gzipSync(vtpbf.fromGeojsonVt(parties as never, { version: 2, extent: 4096 }), { level: 9 });
          if (gz.length <= TUILE_MAX) break;
        }
        elaguees++;
      }
      // Encodée, la tuile n'a plus à garder ses objets ; au dernier zoom,
      // plus sa source non plus — c'est là que tient l'essentiel de la mémoire.
      for (const p of Object.values(parties)) {
        p.features = [];
        if (z === MAXZOOM) (p as { source?: unknown }).source = null;
      }
      writeSync(fd, gz, 0, gz.length, position);
      brouillon.push({ tileId: zxyToTileId(z, x, y), offset: position, length: gz.length, hash: createHash("md5").update(gz).digest("hex") });
      position += gz.length;
      minzoom = Math.min(minzoom, z);
      nb++;
    }
    frontiere = suivante;
    console.log(`z${String(z).padStart(2)} : ${nb} tuiles (${(position / 1e6).toFixed(1)} Mo cumulés)`);
  }
  closeSync(fd);

  // Recopie dans l'ordre de Hilbert, sans doublon de contenu.
  brouillon.sort((a, b) => a.tileId - b.tileId);
  const lecture = openSync(travail, "r");
  const morceaux: Buffer[] = [];
  const entrees: Entree[] = [];
  const contenus = new Map<string, { offset: number; length: number }>();
  let offset = 0;
  for (const b of brouillon) {
    let c = contenus.get(b.hash);
    if (!c) {
      const buf = Buffer.alloc(b.length);
      readSync(lecture, buf, 0, b.length, b.offset);
      morceaux.push(buf);
      c = { offset, length: b.length };
      contenus.set(b.hash, c);
      offset += b.length;
    }
    const derniere = entrees[entrees.length - 1];
    if (derniere && derniere.offset === c.offset && derniere.tileId + derniere.runLength === b.tileId) {
      derniere.runLength++;
    } else {
      entrees.push({ tileId: b.tileId, offset: c.offset, length: c.length, runLength: 1 });
    }
  }
  closeSync(lecture);
  unlinkSync(travail);

  const tuiles = Buffer.concat(morceaux);
  const { racine, feuilles } = repertoires(entrees);
  const metadonnees = gzipSync(
    Buffer.from(
      JSON.stringify({
        name: "OpenSkiMap — Europe (tuiles Skitrack)",
        description:
          "Pistes, remontées, domaines et points de ski de cinquante pays d'Europe, tuilés depuis openskidata.org.",
        attribution:
          '© <a href="https://openskimap.org">OpenSkiMap.org</a> · © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        format: "pbf",
        type: "overlay",
        version: "1",
        vector_layers: couches.map((c) => ({ id: c.nom, fields: c.champs, minzoom: c.minzoom, maxzoom: MAXZOOM })),
        "skitrack:source": "https://openskidata.org — jeux runs, lifts, ski_areas, spots",
        "skitrack:releve": new Date().toISOString().slice(0, 10),
      }),
    ),
  );
  const tete = entete({
    racine: racine.length,
    metadonnees: metadonnees.length,
    feuilles: feuilles.length,
    tuiles: tuiles.length,
    adressees: brouillon.length,
    entrees: entrees.length,
    contenus: contenus.size,
    minzoom,
    bornes,
  });
  writeFileSync(SORTIE, Buffer.concat([tete, racine, metadonnees, feuilles, tuiles]));
  console.log(
    `\n${SORTIE}\n  ${brouillon.length} tuiles adressées, ${entrees.length} entrées, ${contenus.size} contenus distincts, ${elaguees} tuiles éclaircies\n  ${(tuiles.length / 1e6).toFixed(1)} Mo de tuiles, racine ${racine.length} o, feuilles ${(feuilles.length / 1e3).toFixed(0)} ko — ${((Date.now() - t0) / 60000).toFixed(1)} min`,
  );

  await verifier(SORTIE);
}

/** Relecture par le lecteur officiel, et décodage de trois tuiles. */
async function verifier(chemin: string): Promise<void> {
  const fd = openSync(chemin, "r");
  const source: Source = {
    getKey: () => chemin,
    async getBytes(offset: number, length: number): Promise<RangeResponse> {
      const buf = Buffer.alloc(length);
      readSync(fd, buf, 0, length, offset);
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + length) };
    },
  };
  const pm = new PMTiles(source);
  const h = await pm.getHeader();
  const meta = (await pm.getMetadata()) as { vector_layers: { id: string }[] };
  console.log(`\nrelecture : v${h.specVersion}, z${h.minZoom}–${h.maxZoom}, ${h.numAddressedTiles} tuiles, couches ${meta.vector_layers.map((l) => l.id).join("/")}`);
  // Val Thorens à z12, les Alpes à z9, le monde à z0.
  for (const [z, x, y] of [[12, 2123, 1465], [9, 265, 183], [0, 0, 0]] as const) {
    const r = await pm.getZxy(z, x, y);
    if (!r) throw new Error(`tuile ${z}/${x}/${y} absente`);
    // Le lecteur rend la tuile décompressée quand l'en-tête dit gzip.
    const octets = Buffer.from(r.data);
    const vt = new VectorTile(new Protobuf(octets[0] === 0x1f && octets[1] === 0x8b ? gunzipSync(octets) : octets));
    const couches = Object.entries(vt.layers).map(([n, l]) => `${n}=${l.length}`);
    console.log(`  ${z}/${x}/${y} : ${couches.join(" ")}`);
    if (z === 12 && !vt.layers.runs?.length) throw new Error("Val Thorens sans piste à z12");
  }
  closeSync(fd);
}

await main();
