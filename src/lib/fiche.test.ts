import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stationFiche } from "./fiche.ts";
import { STATIONS } from "./stations.ts";

describe("fiche détaillée", () => {
  it("2 Alpes : 96 pistes, 19/49/18/15 %, 220 km, plus longue 16 km", () => {
    const s = STATIONS.find((x) => x.id === "les-2-alpes")!;
    const f = stationFiche(s);
    assert.equal(f.n, 96);
    assert.equal(f.km, 220);
    assert.equal(f.longestKm, 16);
    assert.deepEqual(
      f.mix.map((r) => [r.color, r.n, r.pct]),
      [
        ["green", 18, 19],
        ["blue", 47, 49],
        ["red", 17, 18],
        ["black", 14, 15],
      ],
    );
    assert.equal(f.mix.reduce((n, r) => n + r.n, 0), 96);
    assert.ok(f.skiinfoUrl?.includes("/les-2-alpes/plans-des-pistes"));
    assert.equal(f.grain, "station");
    assert.equal(f.glacier, true);
  });

  it("chaque station FR a une fiche : GPS, IGN, mix ou partial", () => {
    assert.equal(STATIONS.length, 231);
    for (const s of STATIONS) {
      const f = stationFiche(s);
      assert.equal(f.id, s.id);
      assert.ok(f.lat && f.lon, s.id);
      assert.ok(f.demM != null, s.id);
      if (f.hasMix) {
        assert.equal(f.mix.reduce((n, r) => n + r.n, 0), f.n, s.id);
        assert.ok(f.n > 0, s.id);
      }
    }
  });

  it("Oz : mix Skiinfo 135 pistes / 250 km, pin Poutran pas Pic Blanc", () => {
    const f = stationFiche(STATIONS.find((x) => x.id === "oz-en-oisans")!);
    assert.equal(f.n, 135);
    assert.equal(f.km, 250);
    assert.equal(f.villageM, 1333);
    assert.equal(f.maxM, 3330);
  });
});
