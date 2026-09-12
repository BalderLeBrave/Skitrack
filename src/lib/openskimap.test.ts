import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { osmFor, osmSkiinfo, osmSkiinfoAll, osmSkiinfoSummary } from "./openskimap.ts";
import { STATIONS } from "./stations.ts";

describe("OpenSkiMap × Skiinfo", () => {
  it("229/231 domaines FR matchés ; 122 OSM = segments ; 2 absents", () => {
    const s = osmSkiinfoSummary(osmSkiinfoAll());
    assert.equal(s.n, 231);
    assert.equal(s.segments, 122);
    assert.equal(s.km_court, 46);
    assert.equal(s.ok, 25);
    assert.equal(s.ecart_n, 11);
    assert.equal(s.grain_domaine, 2);
    // Vingt-trois stations ont un domaine OSM dont les comptes valent zéro.
    // Elles étaient réparties entre « km OSM court » (19) et « écart de
    // comptes » (4), deux verdicts qui décrivent un écart de mesure là où il
    // n'y a aucune mesure. Elles ont leur propre verdict.
    assert.equal(s.osm_vide, 23);
    assert.equal(s.osm_absent, 2);
    assert.equal(
      s.segments + s.km_court + s.ok + s.ecart_n + s.grain_domaine + s.osm_vide + s.osm_absent,
      231,
    );
  });

  it("un domaine OSM à zéro piste se dit vide, pas plus court", () => {
    const rows = osmSkiinfoAll().filter((r) => r.verdict === "osm_vide");
    assert.equal(rows.length, 23);
    // Le zéro vient bien du témoin, il n'est pas fabriqué ici.
    for (const r of rows) {
      assert.equal(r.nOsm, 0);
      assert.equal(r.kmOsm, 0);
    }
    // « absent » reste distinct : là, il n'y a pas de domaine du tout.
    assert.equal(osmSkiinfoAll().filter((r) => r.verdict === "osm_absent").length, 2);
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
