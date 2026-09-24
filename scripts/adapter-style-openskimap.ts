/**
 * Le style de carte de Skitrack, dérivé de celui d'OpenSkiMap et rebranché
 * sur des sources dont l'usage est permis.
 *
 *     node --experimental-strip-types scripts/adapter-style-openskimap.ts [terrain_v2.json]
 *
 * Écrit `src/lib/carte/openskimap.style.json`. Sans argument, lit le style
 * à l'adresse où OpenSkiMap le sert (`terrain_v2.json`) ; avec, lit la copie
 * donnée. Le style d'origine n'est pas versionné ; le dérivé l'est, et dit
 * d'où il vient.
 *
 * ## Ce qui est repris, et ce qui est remplacé
 *
 * Les **couches** — leurs filtres, couleurs, largeurs, étiquettes — sont
 * celles d'OpenSkiMap, telles quelles : c'est ce qui fait qu'une piste rouge
 * se lit pareil ici et là-bas. Les **sources**, elles, changent toutes :
 *
 * | source        | chez OpenSkiMap                 | ici                                       |
 * |---------------|---------------------------------|-------------------------------------------|
 * | `openskimap`  | tiles.openskimap.org (interdit) | `/carte/openskimap-europe.pmtiles`, à nous |
 * | `openmaptiles`| OpenFreeMap                     | OpenFreeMap (usage libre, crédit)          |
 * | `hillshade`   | Mapterhorn                      | Mapterhorn (tuiles publiques, crédit)      |
 * | `terrain`     | Mapterhorn, 3D                  | retiré : Leaflet ne connaît que le plan    |
 * | `naturalearth`| tiles.openskimap.org            | retiré : OpenFreeMap couvre les bas zooms  |
 * | glyphes       | tiles.openskimap.org            | `/fonts/glyphes/`, polices libres           |
 * | sprite        | tiles.openskimap.org            | OpenFreeMap (`ofm:`) + `/carte/sprite-ski` (`ski:`) |
 *
 * Deux sprites, donc deux préfixes : MapLibre l'admet, à condition que
 * chaque nom d'icône porte le sien. Les expressions `icon-image` sont
 * réécrites en conséquence, préfixe porté à leurs sorties
 * (`src/lib/carte/prefixerIcone.ts`). Un seul nom du fond manque au sprite
 * d'OpenFreeMap (`guidepost`) ; il ne s'affichera pas.
 *
 * `{{ORIGINE}}` marque l'origine du site, connue seulement à l'exécution :
 * le sprite et les glyphes veulent des adresses absolues.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SOURCE = "https://tiles.openskimap.org/styles/terrain_v2.json";

/**
 * Les polices du style, et le nom du dossier de glyphes qui les sert
 * (`scripts/extraire-glyphes.py`) : sans espace, parce que le serveur
 * statique de Vite ne retrouve pas un `Noto%20Sans%20Regular`.
 */
const POLICES: Record<string, string> = {
  "Open Sans Semibold": "open-sans-semibold",
  "Noto Sans Regular": "noto-sans-regular",
  "Noto Sans Bold": "noto-sans-bold",
  "Noto Sans Italic": "noto-sans-italic",
};
const SORTIE = resolve(import.meta.dirname, "../src/lib/carte/openskimap.style.json");

type Style = {
  version: number;
  sources: Record<string, Record<string, unknown>>;
  layers: { id: string; source?: string; layout?: Record<string, unknown>; [k: string]: unknown }[];
  sprite?: unknown;
  glyphs?: string;
  terrain?: unknown;
  metadata?: Record<string, unknown>;
  [k: string]: unknown;
};

async function lireStyle(): Promise<Style> {
  if (process.argv[2]) return JSON.parse(readFileSync(resolve(process.argv[2]), "utf8")) as Style;
  const res = await fetch(SOURCE, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" } });
  if (!res.ok) throw new Error(`style : HTTP ${res.status}`);
  return (await res.json()) as Style;
}

const { prefixerIcone: prefixer } = await import("../src/lib/carte/prefixerIcone.ts");

const style = await lireStyle();

const { terrain: _terrain, ...reste } = style;
void _terrain;
const sortie: Style = {
  ...reste,
  metadata: {
    ...(style.metadata ?? {}),
    "skitrack:origine":
      "Couches du style terrain_v2 d'OpenSkiMap.org (openskimap.org), sources remplacées ; voir scripts/adapter-style-openskimap.ts",
    "skitrack:adapte": new Date().toISOString().slice(0, 10),
  },
  glyphs: "{{ORIGINE}}/fonts/glyphes/{fontstack}/{range}.pbf",
  sprite: [
    { id: "ofm", url: "https://tiles.openfreemap.org/sprites/ofm_f384/ofm" },
    { id: "ski", url: "{{ORIGINE}}/carte/sprite-ski" },
  ],
  sources: {
    openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
    hillshade: {
      type: "raster-dem",
      tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
      encoding: "terrarium",
      tileSize: 512,
      minzoom: 0,
      maxzoom: 17,
      attribution: '© <a href="https://mapterhorn.com">Mapterhorn</a>',
    },
    openskimap: {
      type: "vector",
      url: "pmtiles://{{ORIGINE}}/carte/openskimap-europe.pmtiles",
      attribution:
        '© <a href="https://openskimap.org">OpenSkiMap.org</a> · © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: style.layers
    .filter((l) => l.source !== "naturalearth" && l.source !== "terrain")
    .map((l) => {
      if (!l.layout) return l;
      const layout = { ...l.layout };
      if ("icon-image" in layout) {
        const prefixe = l.source === "openskimap" ? "ski:" : "ofm:";
        layout["icon-image"] = prefixer(layout["icon-image"], prefixe);
      }
      if (Array.isArray(layout["text-font"])) {
        layout["text-font"] = (layout["text-font"] as string[]).map((f) => POLICES[f] ?? f);
      }
      return { ...l, layout };
    }),
};

// Les polices connues du style, toutes servies.
for (const l of sortie.layers) {
  for (const f of (l.layout?.["text-font"] as string[] | undefined) ?? []) {
    if (!Object.values(POLICES).includes(f)) throw new Error(`police sans glyphes : ${f}`);
  }
}

// Les sources oubliées par une couche ne doivent pas rester.
const utilisees = new Set(sortie.layers.map((l) => l.source).filter(Boolean));
for (const s of Object.keys(sortie.sources)) if (!utilisees.has(s)) delete sortie.sources[s];

mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, JSON.stringify(sortie, null, 1) + "\n", "utf8");
const parSource = sortie.layers.reduce<Record<string, number>>((acc, l) => {
  const k = l.source ?? "(fond)";
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});
console.log(`${SORTIE}\n  ${sortie.layers.length} couches :`, parSource, `\n  sources : ${Object.keys(sortie.sources).join(", ")}`);
