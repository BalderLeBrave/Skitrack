import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ignSkiinfo, ignSkiinfoAll, ignSkiinfoSummary } from "./ignSkiinfo.ts";
import { STATIONS } from "./stations.ts";

describe("IGN × Skiinfo", () => {
  it("231 stations : IGN ≈ village pour 217, 11 dans le domaine, 2 sous la base, 1 au sommet", () => {
    const rows = ignSkiinfoAll();
    const s = ignSkiinfoSummary(rows);
    assert.equal(s.n, 231);
    assert.equal(s.village, 217);
    assert.equal(s.domaine, 11);
    assert.equal(s.sous_base, 2);
    assert.equal(s.sommet, 1);
    assert.equal(s.sur_sommet, 0);
    assert.equal(s.manque, 0);
    assert.equal(s.medianAbsBase, 19);
  });

  it("2 Alpes : IGN 1670 dans le domaine (Skiinfo 1300–3600), Δ base +370", () => {
    const r = ignSkiinfo(STATIONS.find((x) => x.id === "les-2-alpes")!);
    assert.equal(r.ignM, 1670);
    assert.equal(r.skiMin, 1300);
    assert.equal(r.skiMax, 3600);
    assert.equal(r.dBase, 370);
    assert.equal(r.dSummit, -1930);
    assert.equal(r.verdict, "domaine");
  });

  it("Tignes : IGN 2089 = hamlet, Skiinfo base 1550, pas un sommet", () => {
    const r = ignSkiinfo(STATIONS.find((x) => x.id === "tignes")!);
    assert.equal(r.ignM, 2089);
    assert.equal(r.skiMin, 1550);
    assert.equal(r.verdict, "domaine");
    assert.equal(r.dBase, 539);
  });

  it("Gavarnie-Gèdre : pin station IGN 1825 ≈ base Skiinfo 1850", () => {
    const r = ignSkiinfo(STATIONS.find((x) => x.id === "gavarnie-gedre")!);
    assert.equal(r.ignM, 1825);
    assert.equal(r.skiMin, 1850);
    assert.equal(r.verdict, "village");
    assert.ok(Math.abs(r.dBase ?? 99) <= 30);
  });

  it("Isola 2000 : front de neige IGN 2028, plus le fond de vallée", () => {
    const r = ignSkiinfo(STATIONS.find((x) => x.id === "isola-2000")!);
    assert.equal(r.ignM, 2028);
    assert.equal(r.skiMin, 2000);
    assert.equal(r.verdict, "village");
  });

  it("reste sous la base : Lans-en-Vercors et Goulier (pas de pin IGN au front de neige)", () => {
    const sous = ignSkiinfoAll().filter((r) => r.verdict === "sous_base").map((r) => r.id).sort();
    assert.deepEqual(sous, ["goulier", "lans-en-vercors"]);
  });

  it("l’IGN ne fournit pas de mix de pistes — hors comparaison", () => {
    const r = ignSkiinfo(STATIONS.find((x) => x.id === "val-thorens")!);
    assert.equal("km" in r, false);
    assert.equal("counts" in r, false);
  });
});
