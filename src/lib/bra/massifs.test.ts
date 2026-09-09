import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { braCodeOf, braMassifOf } from "./massifs.ts";

describe("bra massifs FR", () => {
  it("rattache les stations mises en avant", () => {
    assert.equal(braMassifOf("Les 2 Alpes"), "Oisans");
    assert.equal(braCodeOf("Les 2 Alpes"), 15);
    assert.equal(braMassifOf("Chamonix-Mont-Blanc"), "Mont-Blanc");
    assert.equal(braCodeOf("Tignes"), 6);
    assert.equal(braMassifOf("Val Thorens"), "Vanoise");
    assert.equal(braMassifOf("Alpe d'Huez"), "Grandes-Rousses");
    assert.equal(braMassifOf("La Clusaz"), "Aravis");
  });
});
