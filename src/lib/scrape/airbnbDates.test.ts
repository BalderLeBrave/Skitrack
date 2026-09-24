import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { datesSurchargees, nuitsDuLibelle, nuitsEntre, plagesEcrites, prixHorsSejour } from "./airbnbDates.ts";

const IN = "2026-12-19";
const OUT = "2026-12-26";

describe("airbnbDates", () => {
  it("compte les nuits", () => {
    assert.equal(nuitsEntre(IN, OUT), 7);
    assert.equal(nuitsDuLibelle("1 850 € pour 5 nuits"), 5);
    assert.equal(nuitsDuLibelle("1 850 € au total"), null);
  });

  it("lit les plages écrites sur la tuile", () => {
    assert.deepEqual(plagesEcrites(["20–27 déc."]), [{ de: { j: 20, m: 12 }, a: { j: 27, m: 12 } }]);
    assert.deepEqual(plagesEcrites(["28 déc. – 4 janv."]), [{ de: { j: 28, m: 12 }, a: { j: 4, m: 1 } }]);
    assert.deepEqual(plagesEcrites(["2-4 personnes", "3 chambres · 5 lits"]), []);
  });

  it("lit listingParamOverrides en objet ou en liste", () => {
    assert.deepEqual(datesSurchargees({ listingParamOverrides: { checkin: "2027-01-09", checkout: "2027-01-16" } }), {
      checkIn: "2027-01-09",
      checkOut: "2027-01-16",
    });
    assert.deepEqual(
      datesSurchargees({ listingParamOverrides: [{ key: "check_in", value: "2027-01-09" }, { key: "check_out", value: "2027-01-16" }] }),
      { checkIn: "2027-01-09", checkOut: "2027-01-16" },
    );
    assert.deepEqual(datesSurchargees({ checkin: "2027-01-09" }), {});
  });

  it("écarte un total pour un autre nombre de nuits", () => {
    assert.equal(prixHorsSejour({}, "1 850 € pour 5 nuits", [], IN, OUT), true);
    assert.equal(prixHorsSejour({}, "1 850 € pour 7 nuits", [], IN, OUT), false);
  });

  it("écarte un total pour d'autres dates", () => {
    assert.equal(prixHorsSejour({ listingParamOverrides: { checkin: "2027-01-09" } }, "1 850 € au total", [], IN, OUT), true);
    assert.equal(prixHorsSejour({}, "1 850 € au total", ["20–27 déc."], IN, OUT), true);
  });

  it("garde un total aux bonnes dates, ou sans indice", () => {
    assert.equal(prixHorsSejour({ listingParamOverrides: { checkin: IN, checkout: OUT } }, "1 850 € au total", ["19–26 déc."], IN, OUT), false);
    assert.equal(prixHorsSejour({}, "1 850 € au total", ["Appartement · 3 chambres"], IN, OUT), false);
  });
});
