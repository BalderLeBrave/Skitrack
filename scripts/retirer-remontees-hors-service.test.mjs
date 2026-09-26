/**
 * `retirer-remontees-hors-service.mjs` sur un petit jeu construit à la main,
 * copié dans un dossier temporaire : les données du dépôt ne sont jamais
 * touchées. Chaque tracé reprend un cas réel du passage du 26 septembre 2026.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "retirer-remontees-hors-service.mjs");

/** Un tracé openskidata.org : son état, et ses points [lat, lon, altitude]. */
function trace(id, name, liftType, etat, points) {
  const { status, skiAreas = [], access = null } = etat;
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: points.map(([lat, lon, alt]) => [lon, lat, alt]) },
    properties: { id, name, liftType, status, access, skiAreas, places: ["FR"] },
  };
}
const EN_SERVICE = { status: "operating" };
const PRIVE = { status: "operating", access: "private" };
const DANS = (domaine) => ({ status: "operating", skiAreas: [domaine] });
const gare = (n, k, lat, lon) => ({ n, k, lat, lon });
const MER_DE_GLACE = "801278f911681f3511200aaabd753bf91ea731b1";
const BOSSONS = "12731f2c879a42901d5dd8cb796c112f4f57180c";

const TRACES = [
  // Désaffecté, gares aux deux bouts.
  trace("vieux", "Vieux", "drag_lift", { status: "disused" }, [
    [45.0, 6.0, 1000],
    [45.002, 6.0, 1100],
  ]),
  // Désaffecté, gare au milieu du tracé seulement : « Sambuy », à La Sambuy.
  trace("milieu", "Sambuy", "chair_lift", { status: "disused" }, [
    [45.1, 6.0, 1000],
    [45.105, 6.0, 1200],
    [45.11, 6.0, 1400],
  ]),
  // Télécabine sans domaine, gardée par décision du propriétaire : la Mer de
  // Glace (le Capucin, retiré le 26 septembre 2026, ne l'est plus).
  trace(MER_DE_GLACE, "TC Mer de Glace", "gondola", EN_SERVICE, [
    [45.2, 6.0, 1050],
    [45.203, 6.0, 1230],
  ]),
  // Le même, sous un autre identifiant : le nom et le genre suffisent.
  trace("nouvel-identifiant", "TC Mer de Glace", "gondola", EN_SERVICE, [
    [45.23, 6.0, 1050],
    [45.233, 6.0, 1230],
  ]),
  // Funiculaire de ville sans domaine : Thonon.
  trace("thonon", null, "funicular", EN_SERVICE, [
    [45.25, 6.0, 380],
    [45.251, 6.0, 420],
  ]),
  // Téléphérique privé sans domaine : Bure.
  trace("bure", "Téléphérique de Bure", "cable_car", PRIVE, [
    [45.3, 6.0, 1487],
    [45.33, 6.03, 2550],
  ]),
  // Câble plat sans domaine : le téléski nautique de Chaillol, 173 m, 0 m.
  trace("chaillol", null, "drag_lift", EN_SERVICE, [
    [45.4, 6.0, 993.5],
    [45.4, 6.0022, 993.5],
  ]),
  // Plat mais court : pas un câble plat.
  trace("court", "Fil neige", "rope_tow", EN_SERVICE, [
    [45.45, 6.0, 1500],
    [45.4505, 6.0, 1501],
  ]),
  // Rattaché à un domaine, retiré par son identifiant.
  trace(BOSSONS, "Glacier des Bossons", "chair_lift", DANS("chamonix"), [
    [45.5, 6.0, 1040],
    [45.505, 6.0, 1400],
  ]),
  // Tremplin rattaché à un domaine : gardé.
  trace("tuffes", "Tremplin des Tuffes", "drag_lift", DANS("les-rousses"), [
    [45.6, 6.0, 1150],
    [45.601, 6.0, 1190],
  ]),
  // Plat, mais rattaché à un domaine : gardé.
  trace("plat-domaine", "Tapis plat", "drag_lift", DANS("val-pelens"), [
    [45.65, 6.0, 1300],
    [45.652, 6.0, 1300],
  ]),
  // Téléski de village sans domaine, en pente : gardé, « sans domaine » seul
  // n'est pas un motif.
  trace("village", "Téléski du village", "drag_lift", EN_SERVICE, [
    [45.7, 6.0, 1200],
    [45.702, 6.0, 1300],
  ]),
  // Une gare partagée : le projet part du nœud d'un télésiège en service.
  trace("tsf4", "TSF4 Torraz", "chair_lift", DANS("giettaz"), [
    [45.8, 6.0, 1200],
    [45.805, 6.0, 1500],
  ]),
  trace("tscd", "TSCD Torraz", "chair_lift", { status: "proposed", skiAreas: ["giettaz"] }, [
    [45.8, 6.0, 1200],
    [45.81, 6.0, 1700],
  ]),
  // La corde du tremplin de Ventron : 17 m de dénivelé, retirée par position.
  trace("ventron", "Teleski à cable bas Tremplin du Saut", "rope_tow", EN_SERVICE, [
    [47.936218, 6.868825, 633],
    [47.935874, 6.86799, 650],
  ]),
  // Deux appareils désaffectés partent du même nœud, comme au Col des Aravis :
  // la position est gardée sous ses deux noms.
  trace("tke1", "TKE1 Aravis", "drag_lift", { status: "disused" }, [
    [45.9, 6.0, 1480],
    [45.902, 6.0, 1560],
  ]),
  trace("teletraineau", "Télétraineau Aravis", "cable_car", { status: "disused" }, [
    [45.9, 6.0, 1480],
    [45.901, 6.001, 1530],
  ]),
  // Une télécabine neuve, pas encore rattachée à son domaine.
  trace("neuve", "Télécabine neuve", "gondola", EN_SERVICE, [
    [45.95, 6.0, 1100],
    [45.955, 6.0, 1600],
  ]),
];

const NATIONAL = [
  gare("Vieux", "drag_lift", 45.0, 6.0),
  gare("Vieux", "drag_lift", 45.002, 6.0),
  gare("Sambuy", "chair_lift", 45.105, 6.0),
  gare("TC Mer de Glace", "gondola", 45.2, 6.0),
  gare("TC Mer de Glace", "gondola", 45.203, 6.0),
  gare("TC Mer de Glace", "gondola", 45.23, 6.0),
  gare(null, "funicular", 45.25, 6.0),
  gare(null, "funicular", 45.251, 6.0),
  gare("Téléphérique de Bure", "cable_car", 45.3, 6.0),
  gare("Téléphérique de Bure", "cable_car", 45.33, 6.03),
  gare(null, "drag_lift", 45.4, 6.0),
  gare("Fil neige", "rope_tow", 45.45, 6.0),
  gare("Glacier des Bossons", "chair_lift", 45.5, 6.0),
  gare("Glacier des Bossons", "chair_lift", 45.505, 6.0),
  gare("Tremplin des Tuffes", "drag_lift", 45.6, 6.0),
  gare("Tapis plat", "drag_lift", 45.65, 6.0),
  gare("Téléski du village", "drag_lift", 45.7, 6.0),
  gare("TSF4 Torraz", "chair_lift", 45.8, 6.0),
  gare("TSF4 Torraz", "chair_lift", 45.805, 6.0),
  gare("TSCD Torraz", "chair_lift", 45.8, 6.0),
  gare("TSCD Torraz", "chair_lift", 45.81, 6.0),
  gare("Teleski à cable bas Tremplin du Saut", "rope_tow", 47.936218, 6.868825),
  gare("Teleski à cable bas Tremplin du Saut", "rope_tow", 47.935874, 6.86799),
  gare("TKE1 Aravis", "drag_lift", 45.9, 6.0),
  gare("Télétraineau Aravis", "cable_car", 45.9, 6.0),
  gare("Télécabine neuve", "gondola", 45.95, 6.0),
  gare("Télécabine neuve", "gondola", 45.955, 6.0),
];

/** Une piste openskidata.org : ses usages, son état, sa géométrie [lat, lon]. */
function piste(name, uses, status, type, coords) {
  const lonLat = (pts) => pts.map(([lat, lon]) => [lon, lat]);
  const coordinates = type === "Polygon" ? [lonLat(coords)] : lonLat(coords);
  return { type: "Feature", geometry: { type, coordinates }, properties: { name, uses, status } };
}
const PISTES = [
  // 200 m au nord de la gare haute du funiculaire de Thonon, 311 m de la
  // basse ; ses extrémités sont à 800 m : la distance se prend au segment.
  piste("Piste de Thonon", ["downhill"], "operating", "LineString", [
    [45.2528, 5.99],
    [45.2528, 6.01],
  ]),
  // Une surface de piste autour de la télécabine neuve : ses gares sont dedans,
  // à plus de 700 m de ses bords.
  piste("Grand domaine", ["downhill"], "operating", "Polygon", [
    [45.94, 5.99],
    [45.94, 6.01],
    [45.965, 6.01],
    [45.965, 5.99],
    [45.94, 5.99],
  ]),
  // Près de Chaillol, une piste abandonnée et une boucle nordique : rien.
  piste("Ancienne piste", ["downhill"], "abandoned", "LineString", [
    [45.4005, 5.999],
    [45.4005, 6.001],
  ]),
  piste("Boucle nordique", ["nordic"], "operating", "LineString", [
    [45.3995, 5.999],
    [45.3995, 6.001],
  ]),
  // Près de Bure, privé sans domaine : cette famille n'est pas vérifiée.
  piste("Piste de Bure", ["downhill"], "operating", "LineString", [
    [45.301, 5.999],
    [45.301, 6.001],
  ]),
];

/**
 * Un dépôt minimal : le script, les deux index, et les retirées d'un passage
 * d'avant. `pistes` : le nom du fichier des pistes à poser à côté des
 * remontées, un objet par ligne comme openskidata.org.
 */
function depot({ pistes = null } = {}) {
  const racine = mkdtempSync(join(tmpdir(), "retirer-remontees-"));
  mkdirSync(join(racine, "scripts"));
  mkdirSync(join(racine, "src", "lib"), { recursive: true });
  copyFileSync(SCRIPT, join(racine, "scripts", "retirer-remontees-hors-service.mjs"));
  const lib = (f) => join(racine, "src", "lib", f);
  writeFileSync(lib("osmLifts.json"), JSON.stringify(NATIONAL));
  writeFileSync(
    lib("osmAccess.snapshot.json"),
    JSON.stringify({
      "le-devoluy": { lifts: NATIONAL.filter((p) => /Bure|village/.test(p.n ?? "")), places: [] },
      chamonix: { lifts: NATIONAL.filter((p) => p.n === "TC Mer de Glace"), places: [] },
      ventron: { lifts: NATIONAL.filter((p) => /Tremplin du Saut/.test(p.n ?? "")), places: [] },
    }),
  );
  writeFileSync(
    lib("remonteesRetirees.json"),
    JSON.stringify([
      // Retirée à un passage d'avant, absente des données : elle reste.
      { n: "Ancienne", s: "disused", lat: 44.0, lon: 5.0 },
      // Position qu'occupe une gare gardée : elle sort de la liste.
      { n: "TSF4 Torraz", s: "disused", lat: 45.805, lon: 6.0 },
      // Un autre nom de la position du col, d'un passage d'avant : il reste.
      { n: "Ancien nom du col", s: "disused", lat: 45.9, lon: 6.0 },
    ]),
  );
  const geo = join(racine, "lifts.geojson");
  writeFileSync(geo, JSON.stringify({ type: "FeatureCollection", features: TRACES }));
  const fichierPistes = pistes && join(racine, pistes);
  if (fichierPistes) {
    const lignes = PISTES.map((f) => JSON.stringify(f)).join(",\n");
    writeFileSync(fichierPistes, `{"type":"FeatureCollection","features":[\n${lignes}\n]}\n`);
  }
  const script = join(racine, "scripts", "retirer-remontees-hors-service.mjs");
  const lancer = (...args) =>
    spawnSync(process.execPath, [script, geo, ...args], { encoding: "utf8" });
  const passer = (...args) => {
    const r = lancer(...args);
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  const lire = (f) => JSON.parse(readFileSync(lib(f), "utf8"));
  const brut = (f) => readFileSync(lib(f), "utf8");
  return { passer, lancer, lire, brut, fichierPistes };
}

test("à blanc, rien n'est écrit", () => {
  const d = depot();
  const avant = d.brut("osmLifts.json");
  const sortie = d.passer();
  assert.match(sortie, /à blanc/);
  // Sans fichier de pistes, le rapport le dit.
  assert.match(sortie, /pistes non lues/);
  assert.equal(d.brut("osmLifts.json"), avant);
});

test("cinq familles retirées, les exceptions et les cas sans preuve gardés", () => {
  const d = depot();
  d.passer("--ecrire");
  const national = d.lire("osmLifts.json");
  assert.deepEqual(
    national.map((p) => `${p.n}@${p.lat}`),
    [
      "TC Mer de Glace@45.2",
      "TC Mer de Glace@45.203",
      "TC Mer de Glace@45.23",
      "Fil neige@45.45",
      "Tremplin des Tuffes@45.6",
      "Tapis plat@45.65",
      "Téléski du village@45.7",
      "TSF4 Torraz@45.8",
      "TSF4 Torraz@45.805",
    ],
  );
  const listes = d.lire("osmAccess.snapshot.json");
  assert.deepEqual(listes["le-devoluy"].lifts.map((p) => p.n), ["Téléski du village"]);
  assert.equal(listes.chamonix.lifts.length, 3);
  assert.deepEqual(listes.ventron.lifts, []);

  const retirees = d.lire("remonteesRetirees.json");
  const motifs = Object.fromEntries(retirees.map((g) => [`${g.n}@${g.lat}`, g.s]));
  assert.deepEqual(motifs, {
    "Ancienne@44": "disused",
    "Vieux@45": "disused",
    "Vieux@45.002": "disused",
    "Sambuy@45.105": "disused",
    "null@45.25": "cabine sans domaine",
    "null@45.251": "cabine sans domaine",
    "Téléphérique de Bure@45.3": "privé sans domaine",
    "Téléphérique de Bure@45.33": "privé sans domaine",
    "null@45.4": "câble plat sans domaine",
    "Glacier des Bossons@45.5": "désigné",
    "Glacier des Bossons@45.505": "désigné",
    // Le projet du Torraz : sa gare du nœud partagé n'y est pas, celle du haut si.
    "TSCD Torraz@45.81": "proposed",
    "Teleski à cable bas Tremplin du Saut@47.935874": "désigné",
    "Teleski à cable bas Tremplin du Saut@47.936218": "désigné",
    "Ancien nom du col@45.9": "disused",
    "TKE1 Aravis@45.9": "disused",
    "Télétraineau Aravis@45.9": "disused",
    "Télécabine neuve@45.95": "cabine sans domaine",
    "Télécabine neuve@45.955": "cabine sans domaine",
  });
  // Une position, tous ses noms, rangés : celui d'avant et les deux de ce passage.
  assert.deepEqual(
    retirees.filter((g) => g.lat === 45.9).map((g) => g.n),
    ["Ancien nom du col", "TKE1 Aravis", "Télétraineau Aravis"],
  );
});

test("une gare « cabine » ou « câble plat » sans domaine près d'une piste est signalée, et retirée quand même", () => {
  const signalees = (sortie) =>
    sortie
      .split("\n")
      .filter((l) => / — \d+ m de « /.test(l))
      .map((l) => l.trim());
  const attendues = [
    "Télécabine neuve · cabine sans domaine · 45.95,6 — 0 m de « Grand domaine »",
    "Télécabine neuve · cabine sans domaine · 45.955,6 — 0 m de « Grand domaine »",
    "(sans nom) · cabine sans domaine · 45.251,6 — 200 m de « Piste de Thonon »",
    "(sans nom) · cabine sans domaine · 45.25,6 — 311 m de « Piste de Thonon »",
  ];

  // Le fichier des pistes posé à côté de celui des remontées est lu seul.
  const voisin = depot({ pistes: "runs.geojson" });
  const sortie = voisin.passer("--ecrire");
  assert.match(sortie, /à vérifier : 4 gare\(s\)/);
  assert.deepEqual(signalees(sortie), attendues);
  // Un avertissement, pas un filtre : elles partent.
  const national = voisin.lire("osmLifts.json");
  const thonon = (p) => p.n === null && p.k === "funicular";
  assert.ok(!national.some((p) => p.n === "Télécabine neuve" || thonon(p)));
  const retirees = voisin.lire("remonteesRetirees.json");
  assert.equal(retirees.filter((g) => g.n === "Télécabine neuve").length, 2);

  // Ailleurs, sous un autre nom : `--pistes`.
  const ailleurs = depot({ pistes: "pistes-europe.geojson" });
  assert.match(ailleurs.passer(), /pistes non lues/);
  assert.deepEqual(signalees(ailleurs.passer("--pistes", ailleurs.fichierPistes)), attendues);
  const absent = ailleurs.lancer("--pistes", `${ailleurs.fichierPistes}.absent`);
  assert.equal(absent.status, 1);
  assert.match(absent.stderr, /Pistes introuvables/);
});

test("un second passage ne change rien", () => {
  const d = depot();
  d.passer("--ecrire");
  const fichiers = ["osmLifts.json", "osmAccess.snapshot.json", "remonteesRetirees.json"];
  const avant = fichiers.map(d.brut);
  assert.match(d.passer("--ecrire"), /retirés : 0/);
  assert.deepEqual(fichiers.map(d.brut), avant);
});
