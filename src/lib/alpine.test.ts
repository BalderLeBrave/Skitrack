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
import { REPERES_REVUS, STATIONS_AJOUTEES } from "./villages.ts";

describe("carte alpine + IGN", () => {
  it("156 stations alpines FR, IGN RGE ALTI au pin", () => {
    const rows = alpineStations();
    // 231 jusqu'au 26 septembre 2026 : Sainte-Foy Station, Saint-Pancrace les
    // Bottières et Lus-la-Croix-Haute (Alpes du Nord), « Praloup » au Sauze
    // (Alpes du Sud) doublaient une autre station (`IDS_RETIRES`). 227 jusqu'au
    // 30 septembre 2026 : Le Grand Puy (Alpes du Sud), fermé pour de bon, est
    // sorti sous ses deux identifiants (`seyne-les-alpes`, `le-grand-puy`).
    // 156 depuis le 5 octobre 2026 : une station est une fiche Skiinfo
    // (`villages.ts`). Alpes du Nord : les 112 fiches de l'index Skiinfo, plus
    // Sollières-Sardières, rangée sous la Savoie ; Alpes du Sud : 44 fiches,
    // moins Le Grand Puy.
    assert.equal(rows.length, 156);
    assert.equal(rows.filter((s) => s.massif === "Alpes du Nord").length, 113);
    assert.equal(rows.filter((s) => s.massif === "Alpes du Sud").length, 43);
    assert.ok(STATIONS.filter((s) => !isAlpine(s)).every((s) => !s.massif.startsWith("Alpes")));
    assert.equal(ign.source, "IGN RGE ALTI");
    // Toutes ont une fiche Skiinfo et un relevé IGN au pin : celui du
    // 9 septembre 2026 (`alt.ign.json`), sauf un repère revu le 5 octobre
    // (`REPERES_REVUS`) ou une station ajoutée, relevés au nouveau point.
    const depot = rows.filter((s) => s.origin === "depot");
    assert.equal(depot.length, 156);
    for (const s of depot) {
      const releve =
        REPERES_REVUS[s.id]?.demM ??
        STATIONS_AJOUTEES.find((a) => a.id === s.id)?.demM ??
        ign.m[s.id as keyof typeof ign.m];
      assert.equal(s.demM, releve, s.id);
      assert.ok(s.demM != null && s.demM > 400 && s.demM < 4000, s.id);
    }
  });

  it("France entière : 233 pins, massifs hors Alpes présents", () => {
    // Les fiches de l'index Skiinfo par massif (5 octobre 2026), les quatre
    // stations suisses que Skiinfo range dans « Jura » mises à part, plus Val
    // d'Ese et Haut Asco, que Skiinfo cite sans fiche.
    assert.equal(mapFilter(STATIONS, "all").length, 233);
    assert.equal(mapFilter(STATIONS, "pyrenees").length, 35);
    assert.equal(mapFilter(STATIONS, "jura").length, 9);
    assert.equal(mapFilter(STATIONS, "vosges").length, 17);
    assert.equal(mapFilter(STATIONS, "central").length, 13);
    assert.equal(mapFilter(STATIONS, "corse").length, 3);
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
    assert.equal(fc.features.length, 233);
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
      // Larche et Le Chazelet : URL morte ; Sollières-Sardières, ajoutée le
      // 5 octobre 2026, sans photo. Val d'Ese et Haut Asco ont la leur.
      if (["larche", "le-chazelet", "sollieres-sardieres"].includes(id)) {
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
