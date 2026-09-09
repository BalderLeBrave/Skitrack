import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isCabinLift, liftFleet, nearestLift } from "./osmAccess.ts";

describe("remontées OSM", () => {
  it("apparie les deux gares du télémixte Diable", () => {
    const hit = nearestLift("les-2-alpes", 45.004361, 6.124768);
    assert.ok(hit);
    assert.equal(hit.name, "Diable");
    assert.equal(hit.kind, "mixed_lift");
    assert.ok(hit.m < 30);
    assert.ok(hit.otherLat != null && hit.otherLon != null);
    assert.ok(Math.abs((hit.otherLat as number) - 44.998073) < 0.001);
    assert.ok(Math.abs((hit.otherLon as number) - 6.148005) < 0.001);
  });

  it("compte chaque remontée une fois (deux gares = un appareil)", () => {
    const f = liftFleet("les-2-alpes");
    assert.equal(f.unique, 29);
    assert.equal(f.gondola, 5);
    assert.equal(f.mixed_lift, 4);
    assert.equal(f.chair_lift, 20);
    assert.equal(f.cable_car, 0);
    const chx = liftFleet("chamonix");
    assert.ok(chx.cable_car >= 1);
    assert.ok(chx.unique < 58);
  });

  it("cabine = télécabine, téléphérique, télémixte, funiculaire", () => {
    assert.equal(isCabinLift("gondola"), true);
    assert.equal(isCabinLift("cable_car"), true);
    assert.equal(isCabinLift("mixed_lift"), true);
    assert.equal(isCabinLift("chair_lift"), false);
    assert.equal(isCabinLift(null), false);
  });
});
