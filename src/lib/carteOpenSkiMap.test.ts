import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StyleSpecification } from "maplibre-gl";
import {
  ATTRIBUTION_PISTES,
  ATTRIBUTION_RELIEF,
  STYLE_OPENSKIMAP,
  adapterStyle,
} from "./carteOpenSkiMap.ts";

type AvecCredit = { attribution?: string };

/** Un style à l'image de `terrain_v2.json` : mêmes sources, une couche de chaque sorte. */
const style: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openskimap.org/fonts/{fontstack}/{range}.pbf",
  sprite: "https://tiles.openskimap.org/sprites/v2",
  terrain: { source: "terrain" },
  sources: {
    openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
    openskimap: { type: "vector", url: "https://tiles.openskimap.org/openskimap-internal.json" },
    hillshade: { type: "raster-dem", tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"] },
    terrain: { type: "raster-dem", tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"] },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#fff" } },
    { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water" },
    { id: "hillshading", type: "hillshade", source: "hillshade" },
    { id: "downhill-runs", type: "line", source: "openskimap", "source-layer": "runs" },
    { id: "operating-lift", type: "line", source: "openskimap", "source-layer": "lifts" },
    { id: "ski-area-labels", type: "symbol", source: "openskimap", "source-layer": "skiareas" },
  ],
};

describe("adapterStyle", () => {
  it("en surcouche, ne garde que les couches et la source OpenSkiMap, sans fond ni terrain", () => {
    const s = adapterStyle(style, { fond: false, pistes: true });
    assert.deepEqual(
      s.layers.map((l) => l.id),
      ["downhill-runs", "operating-lift", "ski-area-labels"],
    );
    assert.deepEqual(Object.keys(s.sources), ["openskimap"]);
    assert.equal(s.terrain, undefined);
    // Les glyphes et le sprite restent : les noms de pistes en ont besoin.
    assert.equal(s.glyphs, style.glyphs);
    assert.equal(s.sprite, style.sprite);
  });

  it("en fond, garde tout sauf le terrain 3D, et retire les pistes si on les éteint", () => {
    const tout = adapterStyle(style, { fond: true, pistes: true });
    assert.equal(tout.layers.length, style.layers.length);
    assert.equal(tout.terrain, undefined);
    // La source `terrain` ne servait qu'à la 3D : partie avec elle.
    assert.deepEqual(Object.keys(tout.sources), ["openmaptiles", "openskimap", "hillshade"]);

    const sansPistes = adapterStyle(style, { fond: true, pistes: false });
    assert.deepEqual(
      sansPistes.layers.map((l) => l.id),
      ["background", "water", "hillshading"],
    );
    assert.ok(!("openskimap" in sansPistes.sources));
  });

  it("pose les crédits sur les sources qui n'en portent pas, sans écraser les autres", () => {
    const s = adapterStyle(style, { fond: true, pistes: true });
    assert.equal((s.sources.openskimap as AvecCredit).attribution, ATTRIBUTION_PISTES);
    assert.equal((s.sources.hillshade as AvecCredit).attribution, ATTRIBUTION_RELIEF);
    // OpenFreeMap porte son crédit dans son TileJSON : on n'y touche pas.
    assert.equal((s.sources.openmaptiles as AvecCredit).attribution, undefined);

    const deja: StyleSpecification = {
      ...style,
      sources: {
        ...style.sources,
        openskimap: { type: "vector", url: "https://tiles.openskimap.org/openskimap-internal.json", attribution: "x" },
      },
    };
    const adapte = adapterStyle(deja, { fond: false, pistes: true });
    assert.equal((adapte.sources.openskimap as AvecCredit).attribution, "x");
  });

  it("ne modifie pas le style reçu", () => {
    const copie = JSON.parse(JSON.stringify(style));
    adapterStyle(style, { fond: false, pistes: true });
    adapterStyle(style, { fond: true, pistes: false });
    assert.deepEqual(style, copie);
  });

  it("lit le style à l'adresse où OpenSkiMap le sert", () => {
    assert.equal(STYLE_OPENSKIMAP, "https://tiles.openskimap.org/styles/terrain_v2.json");
  });
});
