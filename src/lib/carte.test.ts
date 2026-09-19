import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeFilterCount,
  dansLesBornes,
  partagerParBornes,
  sansPositionLabel,
  type Bornes,
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
    country: "FR",
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
  posRelevee: true,
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

test("foldName retire accents, casse, traits d'union et apostrophes", () => {
  assert.equal(foldName("  Megève "), "megeve");
  // Apostrophe et trait d'union deviennent une espace : on tape « alpe d huez »
  // ou « alpe d'huez » droit, et on trouve la courbe ; on tape « saint martin »
  // et on trouve « Saint-Martin-de-Belleville ».
  assert.equal(foldName("ALPE D’HUEZ"), "alpe d huez");
  assert.equal(foldName("Alpe d'Huez"), foldName("Alpe d’Huez"));
  assert.equal(foldName("Saint-Martin-de-Belleville"), "saint martin de belleville");
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

test("stationTags : type, domaine, statut, hors classeur : rien d’inventé", () => {
  const tags = (id: string) => stationTags(STATIONS.find((s) => s.id === id)!);
  assert.match(tags("val-thorens"), /Les Trois Vallées/);
  // Station du dépôt que le classeur ne décrit pas : l’absence est dite.
  assert.match(tags("le-granier-vallee-des-entremonts"), /Domaine non renseigné/);
  assert.match(tags("le-granier-vallee-des-entremonts"), /hors classeur/);
});

test("formatKm : un tiret quand le domaine ne publie pas de kilométrage", () => {
  assert.equal(formatKm(220), "220 km");
  assert.equal(formatKm(0), "–");
  assert.equal(formatKm(null), "–");
});

/* ── Le cadre visible de la carte ─────────────────────────────────────────── */

const CADRE: Bornes = { sud: 45.0, ouest: 6.0, nord: 45.6, est: 6.9 };

test("le cadre garde ce qu'il montre et écarte ce qu'il ne montre pas", () => {
  // Les 2 Alpes, dans le cadre.
  assert.equal(dansLesBornes({ lat: 45.02, lon: 6.12 }, CADRE), true);
  // Marseille, loin dessous.
  assert.equal(dansLesBornes({ lat: 43.29, lon: 5.36 }, CADRE), false);
  // Sur la bordure : la bordure est dans le cadre.
  assert.equal(dansLesBornes({ lat: 45.0, lon: 6.0 }, CADRE), true);
  assert.equal(dansLesBornes({ lat: 45.6, lon: 6.9 }, CADRE), true);
  // Juste dehors.
  assert.equal(dansLesBornes({ lat: 44.999, lon: 6.5 }, CADRE), false);
  assert.equal(dansLesBornes({ lat: 45.3, lon: 6.901 }, CADRE), false);
});

test("une entrée sans coordonnées reste : elle n'a pas de cadre", () => {
  assert.equal(dansLesBornes({ lat: null, lon: null }, CADRE), true);
  assert.equal(dansLesBornes({}, CADRE), true);
  assert.equal(dansLesBornes({ lat: 45.02, lon: null }, CADRE), true);
  assert.equal(dansLesBornes({ lat: Number.NaN, lon: 6.1 }, CADRE), true);
  // Et sans cadre du tout, rien n'est écarté.
  assert.equal(dansLesBornes({ lat: 43.29, lon: 5.36 }, null), true);
});

test("le partage compte les trois situations séparément", () => {
  const rows = [
    { id: "dedans", lat: 45.02, lon: 6.12 },
    { id: "dedans2", lat: 45.5, lon: 6.7 },
    { id: "dehors", lat: 43.29, lon: 5.36 },
    { id: "sans", lat: null, lon: null },
    { id: "sans2", lat: null, lon: 6.1 },
  ];
  const out = partagerParBornes(rows, CADRE);
  assert.deepEqual(out.visibles.map((r) => r.id), ["dedans", "dedans2", "sans", "sans2"]);
  assert.deepEqual(out.horsCadre.map((r) => r.id), ["dehors"]);
  assert.deepEqual(out.sansPosition.map((r) => r.id), ["sans", "sans2"]);
  // Les sans-position sont dans « visibles » ET comptés à part : ils
  // s'affichent, et l'écran peut dire combien ils sont.
  assert.equal(out.visibles.length + out.horsCadre.length, rows.length);

  // Sans cadre, rien ne sort.
  const tout = partagerParBornes(rows, null);
  assert.equal(tout.visibles.length, rows.length);
  assert.equal(tout.horsCadre.length, 0);
  assert.equal(tout.sansPosition.length, 2);
});

test("le compte des sans-position s'écrit, ou ne s'écrit pas", () => {
  assert.equal(sansPositionLabel(0), "");
  assert.equal(sansPositionLabel(3), "3 sans localisation");
  assert.equal(sansPositionLabel(1), "1 sans localisation");
});
