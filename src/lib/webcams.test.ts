import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stationsVoisines } from "./domaineStations.ts";
import { STATIONS, stationById } from "./stations.ts";
import { CAMERAS } from "./webcams.data.ts";
import { webcamCoverage, webcamsForStation } from "./webcams.ts";

const urls = (id: string) => webcamsForStation(id).map((c) => c.url);

describe("table des webcams", () => {
  it("ne nomme que des stations du référentiel", () => {
    for (const id of Object.keys(CAMERAS)) assert.ok(stationById(id), id);
  });

  it("au moins une caméra par station, sans doublon, en https", () => {
    for (const [id, cams] of Object.entries(CAMERAS)) {
      assert.ok(cams.length >= 1, id);
      assert.equal(new Set(cams.map((c) => c.url)).size, cams.length, id);
      for (const c of cams) assert.match(c.url, /^https:\/\//, `${id} : ${c.url}`);
    }
  });

  it("des libellés lisibles : ni tiret cadratin, ni « webcam », ni capitales criées", () => {
    for (const [id, cams] of Object.entries(CAMERAS))
      for (const c of cams) {
        assert.ok(c.label.trim().length > 1, `${id} : libellé vide`);
        // Un panorama Skaping rend la liste de ses sommets en texte : elle ne
        // doit pas devenir le libellé.
        assert.ok(c.label.length <= 60, `${id} : libellé trop long, ${c.label}`);
        assert.doesNotMatch(c.label, /—|\bwebcam\b/i, `${id} : ${c.label}`);
        assert.doesNotMatch(c.label, /\p{Lu}{4,}/u, `${id} : ${c.label}`);
      }
  });
});

describe("webcams d'une station", () => {
  it("toutes les stations d'un même domaine proposent les mêmes caméras", () => {
    for (const s of STATIONS) {
      const attendu = [...urls(s.id)].sort();
      for (const v of stationsVoisines(s.id, s.domain)) {
        assert.deepEqual([...urls(v.id)].sort(), attendu, `${s.id} et ${v.id}`);
      }
    }
  });

  it("les caméras propres passent en tête, dans l'ordre de la table", () => {
    for (const [id, cams] of Object.entries(CAMERAS)) {
      const vues = webcamsForStation(id);
      const propres = vues.filter((c) => !c.duDomaine).map((c) => c.url);
      assert.deepEqual(propres, [...new Set(cams.map((c) => c.url))], id);
      assert.deepEqual(vues.slice(0, propres.length).map((c) => c.url), propres, id);
    }
  });

  it("une station sans caméra propre montre celles de son domaine, et dit où elles sont", () => {
    const sansPropre = STATIONS.filter((s) => !CAMERAS[s.id] && webcamsForStation(s.id).length > 0);
    assert.ok(sansPropre.length > 0);
    for (const s of sansPropre) {
      for (const c of webcamsForStation(s.id)) {
        assert.equal(c.duDomaine, true, `${s.id} : ${c.url}`);
        assert.ok(c.station, `${s.id} : ${c.url}`);
        assert.ok(c.label.startsWith(`${c.station}, `), `${s.id} : ${c.label}`);
      }
    }
  });

  it("aucune adresse n'apparaît deux fois sur une fiche", () => {
    for (const s of STATIONS) assert.equal(new Set(urls(s.id)).size, urls(s.id).length, s.id);
  });

  it("Val Thorens ouvre sur Cime Caron", () => {
    const cams = webcamsForStation("val-thorens");
    assert.equal(cams[0]?.label, "Cime Caron");
    assert.equal(cams[0]?.duDomaine, false);
  });

  it("une station inconnue n'a pas de caméra", () => {
    assert.deepEqual(webcamsForStation("station-qui-n-existe-pas"), []);
  });

  it("la couverture compte chaque station une fois", () => {
    const ids = STATIONS.map((s) => s.id);
    const c = webcamCoverage(ids);
    assert.equal(c.couvertes.length + c.sansCamera.length, ids.length);
    assert.ok(c.couvertes.length >= Object.keys(CAMERAS).length);
  });
});
