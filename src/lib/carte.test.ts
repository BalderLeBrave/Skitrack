import assert from "node:assert/strict";
import { test } from "node:test";
import { foldName, orderStations, searchStations } from "./carte.ts";
import type { Station } from "./stations.ts";

function station(id: string, name: string, minM: number, maxM: number, km: number): Station {
  return {
    id,
    name,
    massif: "Alpes du Nord",
    villageM: minM,
    minM,
    maxM,
    photo: null,
    fmId: null,
    fmVillageM: null,
    fmMinM: null,
    fmMaxM: null,
    demM: null,
    pinKind: "base",
    gpsDup: false,
    lat: 45,
    lon: 6,
    slopes: {
      counts: {},
      announcedKm: km,
      source: "osm",
      quality: "ok",
    } as Station["slopes"],
  };
}

const ROWS = [
  station("megeve", "Megève", 1100, 2350, 400),
  station("2alpes", "Les 2 Alpes", 1300, 3600, 200),
  station("alpe", "Alpe d’Huez", 1250, 3330, 250),
];

test("foldName retire accents et casse", () => {
  assert.equal(foldName("  Megève "), "megeve");
  assert.equal(foldName("ALPE D’HUEZ"), "alpe d’huez");
});

test("searchStations ignore les accents et rend tout sur requête vide", () => {
  assert.deepEqual(
    searchStations(ROWS, "megeve").map((s) => s.id),
    ["megeve"],
  );
  assert.equal(searchStations(ROWS, "   ").length, 3);
  assert.equal(searchStations(ROWS, "zzz").length, 0);
});

test("orderStations trie sans muter la source", () => {
  const ids = (o: Parameters<typeof orderStations>[1]) => orderStations(ROWS, o).map((s) => s.id);
  assert.deepEqual(ids("catalog"), ["megeve", "2alpes", "alpe"]);
  assert.deepEqual(ids("summit"), ["2alpes", "alpe", "megeve"]);
  assert.deepEqual(ids("km"), ["megeve", "alpe", "2alpes"]);
  assert.deepEqual(ids("drop"), ["2alpes", "alpe", "megeve"]);
  assert.deepEqual(ids("name"), ["alpe", "2alpes", "megeve"]);
  assert.equal(ROWS[0].id, "megeve");
});
