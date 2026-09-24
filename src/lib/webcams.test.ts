import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { STATIONS } from "./stations.ts";
import { webcamsForStation } from "./webcams.ts";

const urls = (id: string) => webcamsForStation(id).map((c) => c.url);

describe("webcams d'une station", () => {
  it("toutes les stations d'un même domaine proposent les mêmes caméras", () => {
    const parDomaine = new Map<string, string[]>();
    for (const s of STATIONS) {
      if (!s.domain) continue;
      parDomaine.set(s.domain, [...(parDomaine.get(s.domain) ?? []), s.id]);
    }
    for (const [domaine, ids] of parDomaine) {
      const attendu = [...urls(ids[0])].sort();
      for (const id of ids) assert.deepEqual([...urls(id)].sort(), attendu, `${domaine} : ${id}`);
    }
  });

  it("La Tania, sans caméra propre, montre les quatre des 3 Vallées", () => {
    const cams = webcamsForStation("la-tania");
    assert.equal(cams.length, 4);
    assert.ok(cams.every((c) => c.duDomaine && c.station));
  });

  it("la caméra propre passe en tête, sans doublon d'URL", () => {
    const cams = webcamsForStation("val-thorens");
    assert.equal(cams[0].label, "Panorama 3 Vallées");
    assert.equal(cams[0].duDomaine, false);
    assert.equal(new Set(cams.map((c) => c.url)).size, cams.length);
  });

  it("une station isolée garde sa seule caméra", () => {
    assert.equal(webcamsForStation("chamonix").length, 1);
  });
});
