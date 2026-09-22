import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StyleSpecification } from "maplibre-gl";
import STYLE from "./carte/openskimap.style.json" with { type: "json" };
import { prefixerIcone, sortiesIcone } from "./carte/prefixerIcone.ts";
import { adapterStyle, styleResolu } from "./carteOpenSkiMap.ts";

describe("prefixerIcone", () => {
  it("préfixe un littéral, laisse le vide vide", () => {
    assert.equal(prefixerIcone("airport_11", "ofm:"), "ofm:airport_11");
    assert.equal(prefixerIcone("", "ofm:"), "");
  });

  it("descend dans step, match et case au lieu d'envelopper : « zoom » doit rester en tête", () => {
    assert.deepEqual(prefixerIcone(["step", ["zoom"], "circle_11_black", 10, ""], "ofm:"), [
      "step",
      ["zoom"],
      "ofm:circle_11_black",
      10,
      "",
    ]);
    assert.deepEqual(
      prefixerIcone(["match", ["get", "subclass"], ["florist", "furniture"], ["get", "subclass"], "shop"], "ofm:"),
      ["match", ["get", "subclass"], ["florist", "furniture"], ["concat", "ofm:", ["get", "subclass"]], "ofm:shop"],
    );
    assert.deepEqual(prefixerIcone(["case", ["has", "x"], "a", "b"], "ski:"), ["case", ["has", "x"], "ski:a", "ski:b"]);
  });

  it("met le préfixe en tête d'un concat, et enveloppe le reste", () => {
    assert.deepEqual(prefixerIcone(["concat", "oneway-", ["get", "colorName"]], "ski:"), [
      "concat",
      "ski:",
      "oneway-",
      ["get", "colorName"],
    ]);
    assert.deepEqual(prefixerIcone(["to-string", ["get", "class"]], "ofm:"), ["concat", "ofm:", ["to-string", ["get", "class"]]]);
  });

  it("sortiesIcone énumère ce que l'expression peut rendre", () => {
    assert.deepEqual(sortiesIcone(["step", ["zoom"], "ofm:a", 10, ""]), ["ofm:a", ""]);
    assert.deepEqual(sortiesIcone(["match", ["get", "s"], ["x"], "ofm:x", ["concat", "ofm:", ["get", "s"]]]), ["ofm:x", "ofm:…"]);
  });
});

type AvecUrl = { url?: string; tiles?: string[] };

/** Un style à l'image du nôtre : mêmes sources, une couche de chaque sorte. */
const style: StyleSpecification = {
  version: 8,
  glyphs: "{{ORIGINE}}/fonts/glyphes/{fontstack}/{range}.pbf",
  sprite: [
    { id: "ofm", url: "https://tiles.openfreemap.org/sprites/ofm_f384/ofm" },
    { id: "ski", url: "{{ORIGINE}}/carte/sprite-ski" },
  ],
  terrain: { source: "hillshade" },
  sources: {
    openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
    openskimap: { type: "vector", url: "pmtiles://{{ORIGINE}}/carte/openskimap-europe.pmtiles" },
    hillshade: { type: "raster-dem", tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"] },
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
    assert.deepEqual(s.sprite, style.sprite);
  });

  it("en fond, garde tout sauf le terrain 3D, et retire les pistes si on les éteint", () => {
    const tout = adapterStyle(style, { fond: true, pistes: true });
    assert.equal(tout.layers.length, style.layers.length);
    assert.equal(tout.terrain, undefined);
    assert.deepEqual(Object.keys(tout.sources), ["openmaptiles", "openskimap", "hillshade"]);

    const sansPistes = adapterStyle(style, { fond: true, pistes: false });
    assert.deepEqual(
      sansPistes.layers.map((l) => l.id),
      ["background", "water", "hillshading"],
    );
    assert.ok(!("openskimap" in sansPistes.sources));
  });

  it("ne modifie pas le style reçu", () => {
    const copie = JSON.parse(JSON.stringify(style));
    adapterStyle(style, { fond: false, pistes: true });
    adapterStyle(style, { fond: true, pistes: false });
    assert.deepEqual(style, copie);
  });
});

describe("styleResolu", () => {
  it("résout l'origine du site et pointe les tuiles chez nous par défaut", () => {
    const s = styleResolu("https://skitrack.example");
    assert.equal(s.glyphs, "https://skitrack.example/fonts/glyphes/{fontstack}/{range}.pbf");
    assert.equal(
      (s.sources.openskimap as AvecUrl).url,
      "pmtiles://https://skitrack.example/carte/openskimap-europe.pmtiles",
    );
    assert.ok(JSON.stringify(s).includes("https://skitrack.example/carte/sprite-ski"));
    assert.ok(!JSON.stringify(s).includes("{{ORIGINE}}"));
  });

  it("suit l'adresse de tuiles donnée, quand il y en a une", () => {
    const s = styleResolu("https://skitrack.example", " https://blob.example/ski.pmtiles ");
    assert.equal((s.sources.openskimap as AvecUrl).url, "pmtiles://https://blob.example/ski.pmtiles");
    // Vide ou blanc : on retombe sur le fichier à côté de l'application.
    assert.equal(
      (styleResolu("https://skitrack.example", "  ").sources.openskimap as AvecUrl).url,
      "pmtiles://https://skitrack.example/carte/openskimap-europe.pmtiles",
    );
  });
});

describe("le style versionné (carte/openskimap.style.json)", () => {
  const s = STYLE as unknown as StyleSpecification;

  it("ne touche à aucune tuile de tiles.openskimap.org", () => {
    // L'usage direct est interdit ; le style ne doit plus rien y chercher —
    // ni tuiles, ni glyphes, ni sprite. C'est la faute qui a mis la
    // production en panne le 22 septembre 2026.
    assert.ok(!JSON.stringify(s).includes("tiles.openskimap.org"));
  });

  it("n'a que trois sources, chacune à un usage permis", () => {
    assert.deepEqual(Object.keys(s.sources).sort(), ["hillshade", "openmaptiles", "openskimap"]);
    assert.equal((s.sources.openmaptiles as AvecUrl).url, "https://tiles.openfreemap.org/planet");
    assert.deepEqual((s.sources.hillshade as AvecUrl).tiles, ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"]);
    assert.equal((s.sources.openskimap as AvecUrl).url, "pmtiles://{{ORIGINE}}/carte/openskimap-europe.pmtiles");
    assert.equal(s.terrain, undefined);
  });

  it("préfixe chaque icône du sprite qui la porte : ofm: pour le fond, ski: pour les pistes", () => {
    let n = 0;
    for (const l of s.layers) {
      const icone = (l as { layout?: Record<string, unknown> }).layout?.["icon-image"];
      if (icone === undefined) continue;
      n++;
      const attendu = (l as { source?: string }).source === "openskimap" ? "ski:" : "ofm:";
      for (const sortie of sortiesIcone(icone)) {
        // Une sortie vide reste vide : « pas d'icône », pas « ofm: ».
        if (sortie === "") continue;
        assert.ok(sortie.startsWith(attendu), `${l.id} : ${sortie} dans ${JSON.stringify(icone)}`);
      }
    }
    assert.ok(n > 10, `${n} couches à icône`);
    assert.deepEqual(
      (s.sprite as { id: string }[]).map((x) => x.id),
      ["ofm", "ski"],
    );
  });

  it("garde les quarante couches de pistes d'OpenSkiMap et les quatre couches sources", () => {
    const pistes = s.layers.filter((l) => (l as { source?: string }).source === "openskimap");
    assert.equal(pistes.length, 40);
    assert.deepEqual(
      [...new Set(pistes.map((l) => (l as { "source-layer"?: string })["source-layer"]))].sort(),
      ["lifts", "runs", "skiareas", "spots"],
    );
  });
});
