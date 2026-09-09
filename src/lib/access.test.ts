import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatLiftSpan } from "./liftSpan.ts";
import { skiAccessLabel, LIFT_FOOT_M } from "./skiAccess.ts";

describe("accès ski", () => {
  it("n’invente rien sans mesure", () => {
    assert.equal(skiAccessLabel(null), null);
    assert.equal(skiAccessLabel(undefined), null);
  });

  it("au pied = ≤ 200 m mesurés", () => {
    assert.equal(skiAccessLabel(0), "Au pied des pistes");
    assert.equal(skiAccessLabel(LIFT_FOOT_M), "Au pied des pistes");
    assert.equal(skiAccessLabel(201), "Moins de 500 m");
    assert.equal(skiAccessLabel(500), "Moins de 500 m");
    assert.equal(skiAccessLabel(501), "Moins de 1 km");
    assert.equal(skiAccessLabel(1000), "Moins de 1 km");
    assert.equal(skiAccessLabel(1001), null);
  });

  it("arrivée = gare OSM la plus haute, jamais inventée", () => {
    const listing = {
      liftLat: 45,
      liftLon: 6,
      liftOtherLat: 45.01,
      liftOtherLon: 6.02,
    };
    const ele = (lat: number, lon: number) => {
      if (lat === 45 && lon === 6) return 1650;
      if (lat === 45.01 && lon === 6.02) return 2410;
      return null;
    };
    assert.equal(formatLiftSpan(listing, ele), "arrivée 2 410 m · +760 m");
    assert.equal(formatLiftSpan(listing, () => null), null);
    assert.equal(formatLiftSpan({}, ele), null);
  });
});
