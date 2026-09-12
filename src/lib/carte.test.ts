import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeFilterCount,
  colorValue,
  filterMassif,
  foldName,
  formatKm,
  NO_FILTERS,
  orderStations,
  passesFilters,
  searchStations,
  stationMassifs,
  stationTags,
} from "./carte.ts";
import { STATIONS, type Station } from "./stations.ts";

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
    origin: "depot",
    inClasseur: false,
    kind: "station",
    dept: null,
    commune: null,
    status: null,
    domain: null,
    pistesKm: km,
    pistesKmScale: "fiche",
    segments: null,
    lifts: null,
    liftsScale: null,
    distToPisteKm: null,
    colorShare: null,
    colorScale: null,
    colorCounts: null,
    skiinfoPct: null,
    measuredAt: null,
    medianM: null,
    above2000Pct: null,
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

test("orderStations trie sans muter la source, non mesuré en queue", () => {
  const ids = (o: Parameters<typeof orderStations>[1]) => orderStations(ROWS, o).map((s) => s.id);
  assert.deepEqual(ids("hi"), ["2alpes", "alpe", "megeve"]);
  assert.deepEqual(ids("lo"), ["2alpes", "alpe", "megeve"]);
  assert.deepEqual(ids("km"), ["megeve", "alpe", "2alpes"]);
  assert.deepEqual(ids("n"), ["alpe", "2alpes", "megeve"]);
  // Aucune des trois n'a de remontées mesurées : l'ordre d'origine tient.
  assert.equal(ids("lifts").length, 3);
  assert.equal(ROWS[0].id, "megeve");
});

test("un seuil actif écarte la station dont le champ n’est pas mesuré", () => {
  const s = ROWS[0];
  assert.equal(s.lifts, null);
  assert.equal(passesFilters(s, NO_FILTERS, "pct"), true);
  // Seuil sur un champ non mesuré : la station sort, elle n’est pas un zéro.
  assert.equal(passesFilters(s, { ...NO_FILTERS, lifts: 5 }, "pct"), false);
  // Seuil sur un champ mesuré.
  assert.equal(passesFilters(s, { ...NO_FILTERS, hiM: 2000 }, "pct"), true);
  assert.equal(passesFilters(s, { ...NO_FILTERS, hiM: 3000 }, "pct"), false);
});

test("colorValue : trois unités, et null quand la couleur n’est pas relevée", () => {
  const vt = STATIONS.find((s) => s.id === "val-thorens")!;
  assert.ok(vt.colorShare, "Val Thorens devrait avoir une répartition");
  assert.equal(colorValue(vt, "blue", "pct"), vt.colorShare!.blue);
  assert.equal(colorValue(vt, "blue", "n"), vt.colorCounts!.blue);
  // Les km par couleur sont une part des km du domaine — approchés, notés ≈.
  assert.equal(
    colorValue(vt, "blue", "km"),
    Math.round((vt.pistesKm! * vt.colorShare!.blue) / 100),
  );
  // Une station hors classeur n’a rien de relevé : null, jamais zéro.
  const hors = STATIONS.find((s) => s.id === "le-granier-vallee-des-entremonts")!;
  for (const u of ["pct", "n", "km"] as const) assert.equal(colorValue(hors, "blue", u), null);
});

test("activeFilterCount compte chaque critère posé", () => {
  assert.equal(activeFilterCount(NO_FILTERS), 0);
  assert.equal(activeFilterCount({ ...NO_FILTERS, hiM: 3000, kind: "station" }), 2);
  assert.equal(
    activeFilterCount({ ...NO_FILTERS, colors: { green: 10, blue: 0, red: 5, black: 0 } }),
    2,
  );
});

test("stationMassifs rend les sept massifs du référentiel, triés", () => {
  assert.deepEqual(stationMassifs(STATIONS), [
    "Alpes du Nord",
    "Alpes du Sud",
    "Corse",
    "Jura",
    "Massif Central",
    "Pyrénées",
    "Vosges",
  ]);
});

test("filterMassif : null rend tout, un massif ne rend que lui", () => {
  assert.equal(filterMassif(STATIONS, null).length, STATIONS.length);
  const corse = filterMassif(STATIONS, "Corse");
  assert.ok(corse.length > 0);
  assert.ok(corse.every((s) => s.massif === "Corse"));
});

test("stationTags : type, domaine, statut, hors classeur — rien d’inventé", () => {
  const tags = (id: string) => stationTags(STATIONS.find((s) => s.id === id)!);
  assert.match(tags("val-thorens"), /Les Trois Vallées/);
  // Station du dépôt que le classeur ne décrit pas : l’absence est dite.
  assert.match(tags("le-granier-vallee-des-entremonts"), /Domaine non renseigné/);
  assert.match(tags("le-granier-vallee-des-entremonts"), /hors classeur/);
});

test("formatKm : un tiret quand le domaine ne publie pas de kilométrage", () => {
  assert.equal(formatKm(220), "220 km");
  assert.equal(formatKm(0), "—");
  assert.equal(formatKm(null), "—");
});
