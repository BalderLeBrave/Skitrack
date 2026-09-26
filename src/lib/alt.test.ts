import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { altBands, altBandsDomaine, altDeltaM } from "./alt.ts";
import { domainesPays } from "./monde/monde.ts";
import { DEPOT_STATIONS, STATIONS } from "./stations.ts";
import { SKIINFO } from "./skiinfo.ts";

describe("altitudes par source", () => {
  it("chaque station du dépôt : IGN au pin, min/max = fiche Skiinfo, pas le domaine lié", () => {
    assert.equal(STATIONS.length, 315);
    assert.equal(DEPOT_STATIONS.length, 231);
    // Les 84 du classeur n’ont ni relevé IGN au pin ni fiche Skiinfo.
    assert.ok(
      STATIONS.filter((s) => s.origin === "classeur").every(
        (s) => s.demM == null && SKIINFO[s.id] == null,
      ),
    );
    for (const s of DEPOT_STATIONS) {
      assert.ok(s.demM != null && s.demM > 400 && s.demM < 4000, s.id);
      assert.equal(s.minM, SKIINFO[s.id]?.minM, s.id);
      assert.equal(s.maxM, SKIINFO[s.id]?.maxM, s.id);
      if (s.pinKind === "sommet") {
        assert.notEqual(s.villageM, s.demM, s.id);
        assert.ok(Math.abs(s.villageM - s.minM) <= 1 || s.fmVillageM != null, s.id);
      }
    }
  });

  it("Val Thorens ≠ Méribel (plus le 1110–3223 copié des 3 Vallées)", () => {
    const vt = STATIONS.find((x) => x.id === "val-thorens")!;
    const mb = STATIONS.find((x) => x.id === "meribel")!;
    assert.equal(vt.villageM, 2321);
    assert.equal(mb.villageM, 1413);
    assert.equal(vt.minM, 1825);
    assert.equal(vt.maxM, 3230);
    assert.equal(mb.minM, 1100);
    assert.equal(mb.maxM, 2952);
    assert.notEqual(vt.minM, mb.minM);
    assert.notEqual(vt.maxM, mb.maxM);
  });

  it("Tignes ≠ Val d'Isère en base", () => {
    const t = STATIONS.find((x) => x.id === "tignes")!;
    const v = STATIONS.find((x) => x.id === "val-disere")!;
    assert.equal(t.villageM, 2171);
    assert.equal(v.villageM, 1829);
    assert.equal(t.minM, 1550);
    assert.equal(v.minM, 1850);
  });

  it("Oz : pin Poutran IGN 1333 m, plus le Pic Blanc", () => {
    const s = STATIONS.find((x) => x.id === "oz-en-oisans")!;
    assert.equal(s.pinKind, "base");
    assert.equal(s.villageM, 1333);
    assert.equal(s.demM, 1333);
    assert.equal(s.maxM, 3330);
    assert.ok(Math.abs(s.lat - 45.12887) < 0.0002);
    const ign = altBands(s).find((b) => b.source === "ign")!;
    assert.equal(ign.villageM, 1333);
  });

  it("2 Alpes : village FM 1645, IGN ~1670, sommet Skiinfo 3600 ≠ FM 3511", () => {
    const s = STATIONS.find((x) => x.id === "les-2-alpes")!;
    const bands = altBands(s);
    const vil = bands.find((b) => b.source === "village")!;
    const si = bands.find((b) => b.source === "skiinfo")!;
    const fm = bands.find((b) => b.source === "fm")!;
    assert.equal(vil.villageM, 1645);
    assert.equal(si.maxM, 3600);
    assert.equal(fm.maxM, 3511);
    assert.equal(altDeltaM(si.maxM, fm.maxM), 89);
    assert.ok(Math.abs((s.demM ?? 0) - 1670) <= 5);
  });

  it("Chamonix : village 1075, sommet fiche 3275 (vallée), FM 2505 (Brévent)", () => {
    const s = STATIONS.find((x) => x.id === "chamonix")!;
    assert.equal(s.villageM, 1075);
    assert.equal(s.maxM, 3275);
    assert.equal(s.fmMaxM, 2505);
  });

  it("Valmeinier : pin IGN géocodage, distinct de Valloire", () => {
    const v = STATIONS.find((x) => x.id === "valmeinier")!;
    const w = STATIONS.find((x) => x.id === "valloire")!;
    assert.equal(v.gpsDup, false);
    assert.notEqual(v.lat, w.lat);
    assert.notEqual(v.lon, w.lon);
    assert.equal(v.demM, 1541);
    assert.equal(v.pinKind, "base");
  });
});

describe("altitudes d'un domaine du référentiel mondial", () => {
  it("un domaine n'a pas de village, et la bande ne prétend pas le contraire", async () => {
    const ch = await domainesPays("CH");
    const zermatt = ch.find((d) => d.id.startsWith("ch-zermatt-breuil-cervinia"))!;
    const bands = altBandsDomaine(zermatt);
    assert.equal(bands.length, 1);
    const osm = bands[0];
    assert.equal(osm.source, "openskimap");
    assert.equal(osm.minM, 1559);
    assert.equal(osm.maxM, 3872);
    // Le fond du sujet : aucune altitude de village n'a été mesurée, donc
    // aucune n'est affichée. `minM` est le point bas du domaine, pas un village.
    assert.equal(osm.villageM, null);
    assert.equal(osm.dropM, 2313);
    assert.ok(osm.label.includes("pas un village"));
  });

  it("le relevé du modèle de terrain est ponctuel, et n'invente ni village ni dénivelé", async () => {
    const at = await domainesPays("AT");
    const un = at[0];
    const bands = altBandsDomaine(un, 1842);
    const dem = bands.find((b) => b.source === "dem")!;
    assert.equal(dem.pointM, 1842);
    assert.equal(dem.villageM, null);
    assert.equal(dem.minM, null);
    assert.equal(dem.maxM, null);
    // Un dénivelé de zéro se lirait comme une mesure. Il n'y en a pas.
    assert.equal(dem.dropM, null);
  });

  it("sans relevé de terrain, aucune bande `dem` n'apparaît", async () => {
    const fr = await domainesPays("FR");
    const bands = altBandsDomaine(fr[0]);
    assert.equal(bands.some((b) => b.source === "dem"), false);
  });

  it("les deux familles de sources ne se croisent jamais", async () => {
    const station = STATIONS.find((x) => x.id === "les-2-alpes")!;
    const mondiales = new Set(["openskimap", "dem"]);
    assert.ok(altBands(station).every((b) => !mondiales.has(b.source)));
    const it = await domainesPays("IT");
    const domaine = it.find((d) => d.minM != null)!;
    assert.ok(altBandsDomaine(domaine, 1500).every((b) => mondiales.has(b.source)));
  });
});
