import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { freezeSplit, parseArome, wmoFr, type AromeReading } from "./arome.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/arome-2alpes.json", import.meta.url), "utf8"));

describe("AROME Météo-France", () => {
  it("lit la fixture 2 Alpes : 6,6 °C, ciel clair, neige 0 cm", () => {
    const r = parseArome(fixture, 1645);
    assert.equal(r.model, "arome_france");
    assert.equal(r.elevationM, 1645);
    assert.equal(r.tempC, 6.6);
    assert.equal(r.weatherCode, 0);
    assert.equal(r.weatherFr, "ciel clair");
    assert.ok(r.windKmh != null && r.windKmh >= 0);
    assert.ok(r.precip24hMm != null && r.precip24hMm >= 0);
    assert.equal(r.snowfall24hCm, 0);
    assert.equal(r.weatherFr, wmoFr(r.weatherCode));
  });

  it("WMO : 0 ciel clair, 71 neige, 95 orage ; hors table = null", () => {
    assert.equal(wmoFr(0), "ciel clair");
    assert.equal(wmoFr(71), "neige");
    assert.equal(wmoFr(95), "orage");
    assert.equal(wmoFr(12), null);
    assert.equal(wmoFr(null), null);
  });

  it("isotherme : décrit village/sommet, n’invente pas une altitude", () => {
    const v = { tempC: 6 } as AromeReading;
    const s = { tempC: -7 } as AromeReading;
    assert.equal(freezeSplit(v, s), "positif au village, gel au sommet");
    assert.equal(freezeSplit({ tempC: -2 } as AromeReading, { tempC: -8 } as AromeReading), "gel village et sommet");
    assert.equal(freezeSplit({ tempC: null } as AromeReading, s), null);
  });

  it("JSON vide : tout null, pas de zéro inventé sur la température", () => {
    const r = parseArome({});
    assert.equal(r.tempC, null);
    assert.equal(r.snowfall24hCm, null);
  });
});
