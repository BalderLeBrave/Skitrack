import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { STATIONS } from "../../stations.ts";
import { SOURCES_AGENCES, agencesDe, lieuxDe, stationsDe } from "./couverture.ts";

describe("agences : couverture", () => {
  const ids = new Set(STATIONS.map((s) => s.id));

  it("chaque station des tables existe dans le référentiel, avec au moins un lieu lisible", () => {
    for (const source of SOURCES_AGENCES) {
      const stations = stationsDe(source);
      assert.ok(stations.length > 0, `${source} ne couvre aucune station`);
      for (const id of stations) {
        assert.ok(ids.has(id), `${source} : ${id} n'est pas une station du référentiel`);
        const lieux = lieuxDe(source, id);
        assert.ok(lieux.length > 0, `${source} : ${id} sans lieu`);
        assert.ok(lieux.every((l) => /^[\w:,-]+$/.test(l)), `${source} : ${id} a un lieu illisible`);
      }
    }
  });

  it("une station qu'aucune agence ne couvre n'en a aucune, et l'ordre est celui de la liste", () => {
    assert.deepEqual(agencesDe("station-inconnue"), []);
    const clusaz = agencesDe("la-clusaz");
    assert.deepEqual(clusaz, SOURCES_AGENCES.filter((s) => clusaz.includes(s)));
  });

  it("les noms des sources sont uniques", () => {
    assert.equal(new Set(SOURCES_AGENCES).size, SOURCES_AGENCES.length);
  });
});
