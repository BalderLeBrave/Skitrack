import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aStation } from "./v7.ts";
import { GPS_FIXES } from "./classeur.ts";
import { STATIONS } from "./stations.ts";

describe("aStation — la préposition suit l'article du nom", () => {
  it("contracte, élide, ou laisse « à » selon l'article", () => {
    assert.equal(aStation("Les 2 Alpes"), "aux 2 Alpes");
    assert.equal(aStation("Le Corbier"), "au Corbier");
    assert.equal(aStation("L'Audibergue - La Moulière"), "à l’Audibergue - La Moulière");
    assert.equal(aStation("L’Audibergue"), "à l’Audibergue");
    assert.equal(aStation("Tignes"), "à Tignes");
  });

  it("donne son article aux Alpe, que le référentiel leur refuse", () => {
    assert.equal(aStation("Alpe d'Huez"), "à l’Alpe d'Huez");
    assert.equal(aStation("Alpe du Grand Serre"), "à l’Alpe du Grand Serre");
    // « Alpes du Sud » n'est pas une station, mais la règle `alpes?` la prendrait :
    // c'est voulu, elle s'écrit pareil.
    assert.equal(aStation("Alpes d'Huez"), "à l’Alpes d'Huez");
  });

  it("rend une chaîne vide plutôt que « à » orphelin", () => {
    assert.equal(aStation(""), "");
    assert.equal(aStation(null), "");
    assert.equal(aStation(undefined), "");
    assert.equal(aStation("   "), "");
  });

  it("aucune station du référentiel ne produit « à Le », « à Les » ou « à L' »", () => {
    // Majuscule volontaire : « à l'Alpe d'Huez » est l'élision correcte, « à
    // L'Audibergue » la faute. Seule la capitale les distingue.
    const fautives = STATIONS.map((s) => aStation(s.name)).filter((p) =>
      /^à L(es? |['’])/.test(p),
    );
    assert.deepEqual(fautives, []);
  });

  it("le référentiel a bien des noms à article : la règle n'est pas décorative", () => {
    const contractes = STATIONS.map((s) => aStation(s.name)).filter((p) => !p.startsWith("à "));
    assert.ok(contractes.length > 20, `${contractes.length} noms contractés`);
  });
});

describe("positions relevées à la main", () => {
  it("les vingt-deux corrections sont posées", () => {
    assert.equal(Object.keys(GPS_FIXES).length, 22);
    for (const [id, [lat, lon]] of Object.entries(GPS_FIXES)) {
      const s = STATIONS.find((x) => x.id === id);
      assert.ok(s, `${id} absente du référentiel`);
      assert.equal(s.lat, lat, `${id} : latitude`);
      assert.equal(s.lon, lon, `${id} : longitude`);
      assert.equal(s.posRelevee, true, `${id} : position dite relevée`);
    }
  });

  it("Lanslebourg quitte le centre de sa commune", () => {
    // Le classeur la posait à 5,7 km de ses pistes : c'est la correction la
    // plus ample des vingt-deux.
    const s = STATIONS.find((x) => x.id === "lanslebourg")!;
    assert.equal(s.lat, 45.286);
    assert.equal(s.lon, 6.879);
  });

  it("une station sans relevé ni correction se dit approximative", () => {
    const sans = STATIONS.filter((s) => !s.posRelevee);
    assert.ok(sans.length > 0, "le référentiel a des positions de commune");
    for (const s of sans.slice(0, 20)) {
      assert.equal(s.pinKind, "inconnu");
      assert.ok(!(s.id in GPS_FIXES));
    }
  });
});
