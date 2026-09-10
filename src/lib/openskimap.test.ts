import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { osmFor, osmSkiinfo, osmSkiinfoAll, osmSkiinfoSummary } from "./openskimap.ts";
import { STATIONS } from "./stations.ts";

describe("OpenSkiMap × Skiinfo", () => {
  it("229/231 domaines FR matchés ; 122 OSM = segments ; 2 absents", () => {
    const s = osmSkiinfoSummary(osmSkiinfoAll());
    assert.equal(s.n, 231);
    assert.equal(s.segments, 122);
    assert.equal(s.km_court, 65);
    assert.equal(s.ok, 25);
    assert.equal(s.ecart_n, 15);
    assert.equal(s.grain_domaine, 2);
    assert.equal(s.osm_absent, 2);
  });

  it("2 Alpes : OSM 225 tracés / 107 km vs Skiinfo 96 pistes / 220 km", () => {
    const s = STATIONS.find((x) => x.id === "les-2-alpes")!;
    const r = osmSkiinfo(s);
    const osm = osmFor("les-2-alpes")!;
    assert.equal(r.verdict, "segments");
    assert.equal(r.nOsm, 225);
    assert.equal(r.nSki, 96);
    assert.equal(r.kmOsm, 107.1);
    assert.equal(r.kmSki, 220);
    assert.equal(r.minOsm, 1284);
    assert.equal(r.maxOsm, 3511);
    assert.equal(r.minSki, 1300);
    assert.equal(r.maxSki, 3600);
    assert.equal(osm.counts.green, 61);
    assert.equal(s.slopes.counts.green, 18);
  });

  it("Chamonix : Brévent/Flégère, pas Les Planards", () => {
    const r = osmSkiinfo(STATIONS.find((x) => x.id === "chamonix")!);
    assert.equal(r.osmName, "Brévent/Flégère (Chamonix)");
    assert.equal(r.nOsm, 64);
    assert.equal(r.nSki, 121);
    assert.equal(r.verdict, "km_court");
  });

  it("Tignes OSM = Tignes - Val d'Isère (domaine), comptes = segments", () => {
    const r = osmSkiinfo(STATIONS.find((x) => x.id === "tignes")!);
    assert.equal(r.osmName, "Tignes - Val d'Isère");
    assert.equal(r.nOsm, 350);
    assert.equal(r.nSki, 84);
    assert.equal(r.verdict, "segments");
  });

  it("le mix affiché reste Skiinfo, pas OpenSkiMap", () => {
    const s = STATIONS.find((x) => x.id === "les-2-alpes")!;
    assert.equal(s.slopes.source, "skiinfo");
    assert.equal(s.slopes.announcedKm, 220);
    assert.notEqual(osmFor("les-2-alpes")!.km, s.slopes.announcedKm);
  });
});
