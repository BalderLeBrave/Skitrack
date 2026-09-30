import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inverser, parMesure, parTexte, sensLbl, sensLu } from "./tri.ts";

describe("sens du tri", () => {
  it("dans les deux sens, le non mesuré finit en queue", () => {
    const xs = [3, null, 1, undefined, 2, Number.NaN];
    const ranger = (sens: 1 | -1) => [...xs].sort((a, b) => parMesure(a, b, sens));
    assert.deepEqual(ranger(1).slice(0, 3), [1, 2, 3]);
    assert.deepEqual(ranger(-1).slice(0, 3), [3, 2, 1]);
    for (const sens of [1, -1] as const) {
      assert.ok(
        ranger(sens)
          .slice(3)
          .every((v) => v == null || Number.isNaN(v)),
      );
    }
  });

  it("les noms, à la française, de A à Z et de Z à A", () => {
    const noms = ["Zermatt", "Élan", "Avoriaz"];
    assert.deepEqual([...noms].sort((a, b) => parTexte(a, b, 1)), ["Avoriaz", "Élan", "Zermatt"]);
    assert.deepEqual([...noms].sort((a, b) => parTexte(a, b, -1)), ["Zermatt", "Élan", "Avoriaz"]);
  });

  it("inverser, relire, nommer", () => {
    assert.equal(inverser(1), -1);
    assert.equal(inverser(-1), 1);
    assert.equal(sensLu(-1, 1), -1);
    assert.equal(sensLu("croissant", -1), -1);
    assert.equal(sensLbl(1), "Croissant");
    assert.equal(sensLbl(-1), "Décroissant");
    assert.equal(sensLbl(1, true), "A → Z");
    assert.equal(sensLbl(-1, true), "Z → A");
  });
});
