import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { altitudeAide, altitudeLbl, cleAltitude, lireIgn, pointAltitude, positionApprochee } from "./altitude.ts";

describe("altitude d'un logement", () => {
  it("lit la réponse de l'IGN ; -99999 (hors données) n'est pas une altitude", () => {
    assert.deepEqual(lireIgn({ elevations: [986.36, -99999, 1984.63] }, 3), [986, null, 1985]);
    assert.deepEqual(lireIgn({ elevations: [{ z: 1200.4 }] }, 1), [1200]);
    assert.deepEqual(lireIgn(null, 2), [null, null]);
  });

  it("un point utilisable, arrondi à une dizaine de mètres pour le cache", () => {
    assert.equal(cleAltitude(45.50544, 6.675305), "45.5054,6.6753");
    assert.equal(pointAltitude({ lat: 0, lon: 0 }), null);
    assert.equal(pointAltitude({ lat: null, lon: 6 }), null);
    assert.deepEqual(pointAltitude({ lat: 45.5, lon: 6.6 }), { lat: 45.5, lon: 6.6 });
  });

  it("environ pour un point approché (Airbnb, adresse géocodée), au mètre sinon", () => {
    assert.equal(positionApprochee({ source: "Airbnb", gpsSource: null }), true);
    assert.equal(positionApprochee({ source: "Abritel", gpsSource: "ban" }), true);
    assert.equal(positionApprochee({ source: "Gîtes de France", gpsSource: "triangule" }), true);
    assert.equal(positionApprochee({ source: "Gîtes de France", gpsSource: null }), false);
    assert.equal(positionApprochee({ source: "Centrale", gpsSource: null }), false);
    assert.equal(altitudeLbl({ m: 1850, source: "ign" }, false), "1 850 m");
    assert.equal(altitudeLbl({ m: 1850, source: "ign" }, true), "env. 1 850 m");
    assert.equal(altitudeLbl(null, false), "Altitude inconnue");
    assert.equal(altitudeLbl(undefined, false), "Altitude en cours");
    assert.match(altitudeAide({ m: 1850, source: "dem" }, true), /Copernicus.*dizaines de mètres/);
  });
});
