import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stationHasGlacier, passLinkFor } from "./forfaits/catalog.ts";
import {
  allocateInts,
  classicCount,
  countLogicalRuns,
  displayPct,
  EMPTY_PISTE_FILTER,
  stationMatchesPiste,
  type PisteFilter,
} from "./pistes.ts";
import { SKIINFO } from "./skiinfo.ts";
import { STATIONS } from "./stations.ts";

function f(preset: PisteFilter["preset"]): PisteFilter {
  return { ...EMPTY_PISTE_FILTER, preset };
}

function ids(preset: PisteFilter["preset"]): string[] {
  return STATIONS.filter((s) =>
    stationMatchesPiste(s.slopes, f(preset), {
      minM: s.minM,
      maxM: s.maxM,
      glacier: stationHasGlacier(s.id),
      linked: passLinkFor(s.id, s.slopes.announcedKm).isLinked,
    }),
  ).map((s) => s.id);
}

describe("1 piste = 1 source_id", () => {
  it("une relation multi-ways compte 1, le way membre n’est pas recompté", () => {
    const counts = countLogicalRuns([
      { sourceId: "rel/1", kind: "relation", activity: "downhill", difficulty: "novice" },
      { sourceId: "way/11", kind: "way", activity: "downhill", difficulty: "novice", memberOf: "rel/1" },
      { sourceId: "way/12", kind: "way", activity: "downhill", difficulty: "novice", memberOf: "rel/1" },
      { sourceId: "way/13", kind: "way", activity: "downhill", difficulty: "novice", memberOf: "rel/1" },
    ]);
    assert.equal(counts.green, 1);
    assert.equal(counts.blue ?? 0, 0);
  });

  it("way orphelin = 1 piste ; nordique ignoré ; expert ≠ black", () => {
    const counts = countLogicalRuns([
      { sourceId: "way/20", kind: "way", activity: "downhill", difficulty: "easy" },
      { sourceId: "way/21", kind: "way", activity: "nordic", difficulty: "easy" },
      { sourceId: "rel/2", kind: "relation", activity: "downhill", difficulty: "expert" },
      { sourceId: "rel/3", kind: "relation", activity: "downhill", difficulty: "advanced" },
    ]);
    assert.equal(counts.blue, 1);
    assert.equal(counts.black, 1);
    assert.equal(counts.other, 1);
    assert.equal(counts.green ?? 0, 0);
  });
});

describe("mix Skiinfo", () => {
  it("chaque station mise en avant : n pistes, km et % = bloc Skiinfo", () => {
    for (const id of [
      "les-2-alpes",
      "chamonix",
      "val-thorens",
      "tignes",
      "meribel",
      "val-disere",
      "alpe-d-huez",
      "la-clusaz",
    ]) {
      const s = STATIONS.find((x) => x.id === id)!;
      const w = SKIINFO[id];
      assert.ok(w, id);
      assert.equal(classicCount(s.slopes.counts), w.n, id);
      assert.equal(s.slopes.announcedKm, w.km, id);
      assert.equal(displayPct(s.slopes, "green"), w.pct.green, id);
      assert.equal(displayPct(s.slopes, "blue"), w.pct.blue, id);
      assert.equal(displayPct(s.slopes, "red"), w.pct.red, id);
      assert.equal(displayPct(s.slopes, "black"), w.pct.black, id);
      assert.equal(s.slopes.source, "skiinfo");
    }
  });

  it("catalogue FR Skiinfo : 200+ stations, pas de Jura suisse, GPS partout", () => {
    assert.ok(STATIONS.length >= 220, String(STATIONS.length));
    assert.ok(STATIONS.every((s) => s.lat != null && s.lon != null));
    const ids = new Set(STATIONS.map((s) => s.id));
    assert.ok(!ids.has("st-cergue-la-dole"));
    assert.ok(!ids.has("le-brassus"));
    assert.ok(ids.has("avoriaz"));
    assert.ok(ids.has("serre-chevalier"));
    assert.ok(ids.has("font-romeu-pyrenees-2000"));
  });

  it("Val Thorens ≠ Méribel ; Tignes ≠ Val d'Isère", () => {
    const vt = STATIONS.find((s) => s.id === "val-thorens")!.slopes;
    const mb = STATIONS.find((s) => s.id === "meribel")!.slopes;
    const t = STATIONS.find((s) => s.id === "tignes")!.slopes;
    const v = STATIONS.find((s) => s.id === "val-disere")!.slopes;
    assert.equal(classicCount(vt.counts), 86);
    assert.equal(classicCount(mb.counts), 73);
    assert.equal(classicCount(t.counts), 84);
    assert.equal(classicCount(v.counts), 78);
    assert.notEqual(vt.counts.green, mb.counts.green);
    assert.notEqual(t.pct?.black, v.pct?.black);
  });

  it("plus grande reste : 86 pistes × 15/41/35/9 = 86", () => {
    const parts = allocateInts([15, 41, 35, 9], 86);
    assert.equal(parts.reduce((a, b) => a + b, 0), 86);
  });
});

describe("profils skieur", () => {
  it("expert : sommet ≥ 3000 m ou ≥ 12 noires — La Clusaz hors", () => {
    const got = ids("expert");
    assert.ok(got.includes("chamonix"));
    assert.ok(got.includes("les-2-alpes"));
    assert.ok(got.includes("tignes"));
    assert.ok(!got.includes("la-clusaz"));
  });

  it("haut : sommet de la fiche Skiinfo ≥ 3000 m", () => {
    const got = ids("haut");
    assert.ok(got.includes("les-2-alpes"));
    assert.ok(got.includes("alpe-d-huez"));
    assert.ok(got.includes("chamonix"));
    assert.ok(!got.includes("meribel"));
    assert.ok(!got.includes("la-clusaz"));
  });

  it("glacier : drapeau catalogue, pas d’invention", () => {
    const got = ids("glacier");
    assert.ok(got.includes("les-2-alpes"));
    assert.ok(got.includes("chamonix"));
    assert.ok(got.includes("tignes"));
    assert.ok(!got.includes("meribel"));
    assert.ok(!got.includes("la-clusaz"));
    assert.equal(stationHasGlacier("les-2-alpes"), true);
    assert.equal(stationHasGlacier("meribel"), false);
  });

  it("forfait lié : 3 Vallées / Espace Killy / MBU, pas 2 Alpes ni La Clusaz", () => {
    const got = ids("lie");
    assert.ok(got.includes("val-thorens"));
    assert.ok(got.includes("meribel"));
    assert.ok(got.includes("tignes"));
    assert.ok(got.includes("chamonix"));
    assert.ok(!got.includes("les-2-alpes"));
    assert.ok(!got.includes("la-clusaz"));
  });

  it("itinéraires : Skiinfo n’a pas de colonne other", () => {
    assert.equal(ids("itineraires").length, 0);
  });
});
