import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ign from "./alt.ign.json" with { type: "json" };
import {
  alpineFeatureCollection,
  alpineStations,
  isAlpine,
  mapFilter,
} from "./alpine.ts";
import { STATIONS } from "./stations.ts";

describe("carte alpine + IGN", () => {
  it("231 stations alpines FR, IGN RGE ALTI au pin pour celles du dépôt", () => {
    const rows = alpineStations();
    assert.equal(rows.length, 231);
    assert.equal(rows.filter((s) => s.massif === "Alpes du Nord").length, 167);
    assert.equal(rows.filter((s) => s.massif === "Alpes du Sud").length, 64);
    assert.ok(STATIONS.filter((s) => !isAlpine(s)).every((s) => !s.massif.startsWith("Alpes")));
    assert.equal(ign.source, "IGN RGE ALTI");
    // Le classeur n’apporte pas de relevé IGN au pin : l’invariant ne vaut
    // que pour les stations qui viennent du dépôt.
    const depot = rows.filter((s) => s.origin === "depot");
    assert.equal(depot.length, 156);
    for (const s of depot) {
      assert.equal(s.demM, ign.m[s.id as keyof typeof ign.m], s.id);
      assert.ok(s.demM != null && s.demM > 400 && s.demM < 4000, s.id);
    }
    assert.ok(rows.filter((s) => s.origin === "classeur").every((s) => s.demM == null));
  });

  it("France entière : 320 pins, massifs hors Alpes présents", () => {
    assert.equal(mapFilter(STATIONS, "all").length, 320);
    assert.equal(mapFilter(STATIONS, "pyrenees").length, 40);
    assert.equal(mapFilter(STATIONS, "jura").length, 13);
    assert.equal(mapFilter(STATIONS, "vosges").length, 19);
    assert.equal(mapFilter(STATIONS, "central").length, 16);
    assert.equal(mapFilter(STATIONS, "corse").length, 1);
  });

  it("points IGN connus : 2 Alpes 1670, Val Thorens 2298, Chamonix 1036, Oz Poutran 1333, Isola 2028", () => {
    assert.equal(ign.m["les-2-alpes"], 1670);
    assert.equal(ign.m["val-thorens"], 2298);
    assert.equal(ign.m["chamonix"], 1036);
    assert.equal(ign.m["alpe-d-huez"], 1808);
    assert.equal(ign.m["oz-en-oisans"], 1333);
    assert.equal(ign.m["isola-2000"], 2028);
  });

  it("filtre haut = sommet fiche ≥ 3000 m", () => {
    const haut = mapFilter(STATIONS, "haut");
    assert.ok(haut.some((s) => s.id === "les-2-alpes"));
    assert.ok(haut.some((s) => s.id === "chamonix"));
    assert.ok(!haut.some((s) => s.id === "la-clusaz"));
    assert.ok(haut.every((s) => s.maxM >= 3000));
  });

  it("GeoJSON : Valmeinier ≠ Valloire ; Oz n’est plus au Pic Blanc", () => {
    const fc = alpineFeatureCollection(mapFilter(STATIONS, "all"));
    assert.equal(fc.features.length, 320);
    const vt = fc.features.find((f) => f.properties?.id === "valmeinier")!;
    const vo = fc.features.find((f) => f.properties?.id === "valloire")!;
    const oz = fc.features.find((f) => f.properties?.id === "oz-en-oisans")!;
    assert.notDeepEqual(vt.geometry.coordinates, vo.geometry.coordinates);
    assert.equal(vt.geometry.coordinates[0], 6.4817);
    assert.ok(Math.abs(oz.geometry.coordinates[0] - 6.07081) < 0.0002);
    assert.equal(oz.properties?.demM, 1333);
  });

  it("chaque pin du dépôt a la photo Skiinfo ; le classeur n’en a pas", () => {
    const fc = alpineFeatureCollection(mapFilter(STATIONS, "all"));
    const origin = new Map(STATIONS.map((s) => [s.id, s.origin]));
    for (const f of fc.features) {
      const photo = f.properties?.photo;
      const id = String(f.properties?.id);
      if (origin.get(id) === "classeur") {
        assert.equal(photo, null, id);
        continue;
      }
      if (id === "larche" || id === "le-chazelet") {
        assert.equal(photo, null, id);
        continue;
      }
      assert.equal(typeof photo, "string", id);
      assert.ok(String(photo).startsWith("/stations/"), id);
    }
    const two = fc.features.find((f) => f.properties?.id === "les-2-alpes")!;
    assert.equal(two.properties?.photo, "/stations/les-2-alpes.jpg");
  });

  it("Saint-Véran : village = IGN 2036 m (entre base et sommet), pas 1740", () => {
    const s = STATIONS.find((x) => x.id === "saint-veran")!;
    assert.equal(s.villageM, 2036);
    assert.equal(s.minM, 1740);
    assert.equal(s.maxM, 2830);
  });
});
