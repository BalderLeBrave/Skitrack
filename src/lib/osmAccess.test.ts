import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attachAccess } from "./access.ts";
import { OSM_ACCESS, OSM_LIFTS } from "./osmAccess.data.ts";
import { isCabinLift, liftFleet, nearestLift, stationLifts } from "./osmAccess.ts";
import { stationById } from "./stations.ts";
import type { Listing } from "./listings.ts";

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

  it("chaque station du référentiel a des gares de remontées", () => {
    assert.ok(OSM_LIFTS.length > 2000, `OSM_LIFTS ${OSM_LIFTS.length}`);
    assert.ok(Object.keys(OSM_ACCESS).length >= 300, `OSM_ACCESS ${Object.keys(OSM_ACCESS).length}`);
  });

  it("Flumet, hors des 8 stations d’origine, mesure une remontée au pin", () => {
    const flumet = stationById("flumet-st-nicolas-la-chapelle");
    assert.ok(flumet);
    const hit = nearestLift(flumet.id, flumet.lat, flumet.lon);
    assert.ok(hit, "aucune remontée autour de Flumet");
    assert.ok(hit.m < 2_000, `trop loin : ${hit.m} m (${hit.name})`);
    const listing = attachAccess(
      {
        id: "flumet-pin",
        stationId: flumet.id,
        title: "Chalet",
        source: "Airbnb",
        total: 1800,
        currency: "EUR",
        guests: 8,
        bedrooms: 3,
        available: true,
        photo: null,
        url: "https://www.airbnb.fr/rooms/1",
        lat: flumet.lat,
        lon: flumet.lon,
        proven: "test",
      } as Listing,
      flumet,
    );
    assert.ok(listing.distToLiftM != null && listing.distToLiftM < 2_000, String(listing.distToLiftM));
  });

  it("stationLifts : Diable a deux gares, 29 appareils aux 2 Alpes", () => {
    const rows = stationLifts("les-2-alpes");
    assert.equal(rows.length, 29);
    const diable = rows.find((r) => r.name === "Diable" && r.kind === "mixed_lift");
    assert.ok(diable);
    assert.ok(diable.bLat != null && diable.bLon != null);
  });
});
