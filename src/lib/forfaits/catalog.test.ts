import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { domainForStation, FORFAIT_CATALOG, passLinkFor, stationHasGlacier } from "./catalog.ts";

describe("catalogue forfaits FR", () => {
  it("ne contient que la France", () => {
    assert.ok(FORFAIT_CATALOG.length > 100);
    assert.ok(FORFAIT_CATALOG.every((d) => d.country === "FR"));
  });

  it("relie les 8 stations mises en avant", () => {
    for (const id of [
      "les-2-alpes",
      "chamonix",
      "val-thorens",
      "tignes",
      "meribel",
      "val-disere",
      "alpe-d-huez",
      "la-clusaz",
    ]) {
      const d = domainForStation(id);
      assert.ok(d, id);
      assert.ok(d.seed?.j6 != null, id);
    }
  });

  it("glacier catalogue : 2 Alpes oui, Méribel non", () => {
    assert.equal(stationHasGlacier("les-2-alpes"), true);
    assert.equal(stationHasGlacier("tignes"), true);
    assert.equal(stationHasGlacier("meribel"), false);
    assert.equal(stationHasGlacier("la-clusaz"), false);
  });

  it("forfait lié publié, km de zone lus pas inventés", () => {
    const vt = passLinkFor("val-thorens", 150);
    assert.equal(vt.isLinked, true);
    assert.equal(vt.linkedKm, 600);
    assert.ok(vt.line?.includes("3 Vallées"));
    const meribel = passLinkFor("meribel", 150);
    assert.equal(meribel.isLinked, true);
    assert.equal(meribel.linkedKm, 600);
    const tignes = passLinkFor("tignes", 150);
    assert.equal(tignes.isLinked, true);
    assert.equal(tignes.pass, "Espace Killy");
    const twoA = passLinkFor("les-2-alpes", 225);
    assert.equal(twoA.isLinked, false);
    const clusaz = passLinkFor("la-clusaz", 125);
    assert.equal(clusaz.isLinked, false);
  });
});
