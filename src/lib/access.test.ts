import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attachAccess, nearestLiftDe } from "./access.ts";
import { formatLiftSpan, liftArrivalM } from "./liftSpan.ts";
import type { Listing } from "./listings.ts";
import { skiAccessLabel, LIFT_FOOT_M } from "./skiAccess.ts";
import { stationById, type Station } from "./stations.ts";
import { remonteeInconnue } from "./stay/statut.ts";

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
    assert.equal(liftArrivalM(listing, ele), 2410);
    assert.equal(formatLiftSpan(listing, () => null), null);
    assert.equal(liftArrivalM(listing, () => null), null);
    assert.equal(formatLiftSpan({}, ele), null);
    assert.equal(liftArrivalM({}, ele), null);
  });
});

const deuxAlpes = () => stationById("les-2-alpes")!;

/** Une annonce nue, à 319 m de la gare de Jandri I : l’arrondi à la dizaine
 *  a quelque chose à faire. */
function annonce(extra: Partial<Listing> = {}): Listing {
  return {
    id: "jandri",
    stationId: "les-2-alpes",
    title: "Chalet",
    source: "Airbnb",
    total: 1800,
    currency: "EUR",
    capacity: 8,
    bedrooms: 3,
    available: true,
    photo: null,
    url: "https://www.airbnb.fr/rooms/1",
    lat: 45.0093,
    lon: 6.1225,
    proven: "test",
    ...extra,
  };
}

describe("attachAccess : la remontée structurée", () => {
  it("position de l’annonce : extraite, à la dizaine de mètres près", () => {
    const row = attachAccess(annonce(), deuxAlpes());
    const n = row.completude?.nearestLift;
    assert.ok(n);
    assert.equal(n.status, "extracted");
    assert.equal(n.positionSource, "listing");
    assert.equal(n.liftName, "Jandri I");
    assert.equal(n.liftType, "gondola");
    assert.equal(n.distanceM, 320);
    assert.equal((n.distanceM ?? 1) % 10, 0);
    // C’est la remontée cherchée, celle de la station, et non `distToLiftM`.
    assert.equal(row.searchedLiftM, 319);
    assert.equal(n.distanceM, Math.round((row.searchedLiftM ?? 0) / 10) * 10);
    assert.equal(n.liftName, row.searchedLiftName);
    assert.equal(n.liftId, null);
    assert.equal(n.liftsDatasetVersion, null);
    assert.equal(n.reason, undefined);
  });

  it("position d’adresse géocodée : dérivée", () => {
    const row = attachAccess(
      annonce({ proven: "ITEA gites-web 2026-09-03 · adresse" }),
      deuxAlpes(),
    );
    const n = row.completude?.nearestLift;
    assert.ok(n);
    assert.equal(n.status, "derived");
    assert.equal(n.positionSource, "geocoded_address");
    assert.equal(n.distanceM, 320);
    assert.equal(n.liftName, "Jandri I");
  });

  it("sans position, ou à (0, 0) : inconnue, tous les champs nuls", () => {
    const sans = [
      annonce({ lat: null, lon: null }),
      annonce({ lat: 45, lon: null }),
      annonce({ lat: 0, lon: 0 }),
    ];
    for (const l of sans) {
      const n = attachAccess(l, deuxAlpes()).completude?.nearestLift;
      assert.deepEqual(n, remonteeInconnue("position inconnue"), l.id);
    }
  });

  it("station sans remontée connue : inconnue, avec la raison", () => {
    // Un identifiant hors du référentiel OSM, à Paris : rien à 40 km.
    const fictive: Station = { ...deuxAlpes(), id: "station-fictive", lat: 48.8566, lon: 2.3522 };
    const n = attachAccess(annonce({ lat: 48.86, lon: 2.35 }), fictive).completude?.nearestLift;
    assert.deepEqual(n, remonteeInconnue("aucune remontée connue pour cette station"));
  });

  it("hors du domaine, la remontée de la station cherchée reste mesurée", () => {
    // La Pastourelle, à Bonneval-sur-Arc, cherchée depuis Val d’Isère
    // (`domainFit.test.ts`) : `distToLiftM` s’efface, la fiche structurée dit
    // à combien sont les remontées de Val d’Isère, de l’autre côté de l’Iseran.
    const val = stationById("val-disere")!;
    const row = attachAccess(
      annonce({ stationId: val.id, lat: 45.371686, lon: 7.046794, locality: "Bonneval-sur-Arc" }),
      val,
    );
    assert.equal(row.domainFit, "other");
    assert.equal(row.distToLiftM, null);
    const n = row.completude?.nearestLift;
    assert.ok(n);
    assert.equal(n.status, "extracted");
    assert.ok((n.distanceM ?? 0) > 4000, String(n.distanceM));
    assert.equal(n.distanceM, Math.round((row.searchedLiftM ?? 0) / 10) * 10);
  });

  it("garde le reste d’une completude déjà posée", () => {
    const bedrooms = { value: 3, status: "extracted" as const, source: "Airbnb" };
    const row = attachAccess({ ...annonce(), completude: { bedrooms } }, deuxAlpes());
    assert.deepEqual(row.completude?.bedrooms, bedrooms);
    assert.equal(row.completude?.nearestLift?.status, "extracted");
    // Sans position aussi : la branche courte ne perd rien.
    const sans = attachAccess(
      { ...annonce({ lat: null, lon: null }), completude: { bedrooms } },
      deuxAlpes(),
    );
    assert.deepEqual(sans.completude?.bedrooms, bedrooms);
    assert.equal(sans.completude?.nearestLift?.status, "unknown");
  });

  it("computedAt est une date ISO, celle du calcul", () => {
    const avant = Date.now();
    const n = nearestLiftDe(annonce(), deuxAlpes());
    assert.ok(n.computedAt);
    assert.equal(new Date(n.computedAt).toISOString(), n.computedAt);
    assert.ok(Date.parse(n.computedAt) >= avant - 1000);
    assert.ok(Date.parse(n.computedAt) <= Date.now() + 1000);
  });
});
