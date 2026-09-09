import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_PISTE_FILTER, stationMatchesPiste, type PisteFilter, type StationSlopes } from "./pistes.ts";
import { stationHasGlacier, passLinkFor } from "./forfaits/catalog.ts";

type Row = { id: string; minM: number; maxM: number; slopes: StationSlopes };

/** Altitudes France Montagnes + comptes OSM, recopiés du catalogue stations. */
const ROWS: Row[] = [
  {
    id: "les-2-alpes",
    minM: 1284,
    maxM: 3511,
    slopes: { announcedKm: 225, counts: { green: 62, blue: 137, red: 33, black: 17, other: 1 }, source: "osm" },
  },
  {
    id: "chamonix",
    minM: 1046,
    maxM: 2505,
    slopes: { announcedKm: 150, counts: { green: 17, blue: 19, red: 23, black: 13 }, source: "osm" },
  },
  {
    id: "val-thorens",
    minM: 1110,
    maxM: 3223,
    slopes: { announcedKm: 150, counts: { green: 168, blue: 422, red: 222, black: 55, other: 4 }, source: "osm" },
  },
  {
    id: "tignes",
    minM: 1559,
    maxM: 3456,
    slopes: { announcedKm: 150, counts: { green: 68, blue: 195, red: 111, black: 30, other: 11 }, source: "osm" },
  },
  {
    id: "meribel",
    minM: 1110,
    maxM: 3223,
    slopes: { announcedKm: 150, counts: { green: 168, blue: 422, red: 222, black: 55, other: 4 }, source: "osm" },
  },
  {
    id: "val-disere",
    minM: 1559,
    maxM: 3456,
    slopes: { announcedKm: 150, counts: { green: 68, blue: 195, red: 111, black: 30, other: 11 }, source: "osm" },
  },
  {
    id: "alpe-d-huez",
    minM: 1124,
    maxM: 3314,
    slopes: { announcedKm: 250, counts: { green: 131, blue: 89, red: 75, black: 33, other: 22 }, source: "osm" },
  },
  {
    id: "la-clusaz",
    minM: 1030,
    maxM: 2476,
    slopes: { announcedKm: 125, counts: { green: 29, blue: 60, red: 47, black: 11, other: 1 }, source: "osm" },
  },
];

function f(preset: PisteFilter["preset"]): PisteFilter {
  return { ...EMPTY_PISTE_FILTER, preset };
}

function ids(preset: PisteFilter["preset"]): string[] {
  return ROWS.filter((s) =>
    stationMatchesPiste(s.slopes, f(preset), {
      minM: s.minM,
      maxM: s.maxM,
      glacier: stationHasGlacier(s.id),
      linked: passLinkFor(s.id, s.slopes.announcedKm).isLinked,
    }),
  ).map((s) => s.id);
}

describe("profils skieur", () => {
  it("expert : sommet ≥ 3000 m ou ≥ 12 noires — La Clusaz hors, Chamonix dedans", () => {
    const got = ids("expert");
    assert.ok(got.includes("chamonix"));
    assert.ok(got.includes("les-2-alpes"));
    assert.ok(!got.includes("la-clusaz"));
  });

  it("haut : seulement sommet France Montagnes ≥ 3000 m", () => {
    const got = ids("haut");
    assert.ok(got.includes("les-2-alpes"));
    assert.ok(got.includes("alpe-d-huez"));
    assert.ok(!got.includes("chamonix"));
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

  it("itinéraires OSM ≥ 4 : ADH / Tignes / 3 Vallées, pas 2 Alpes ni Clusaz", () => {
    const got = ids("itineraires");
    assert.ok(got.includes("alpe-d-huez"));
    assert.ok(got.includes("tignes"));
    assert.ok(got.includes("val-thorens"));
    assert.ok(!got.includes("les-2-alpes"));
    assert.ok(!got.includes("la-clusaz"));
    assert.ok(!got.includes("chamonix"));
  });
});

