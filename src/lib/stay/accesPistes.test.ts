import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  altitudesRemontee,
  arrondiM,
  pisteLaPlusProche,
  skisAuxPieds,
  tempsAPied,
  type TracePiste,
} from "./accesPistes.ts";

describe("altitudesRemontee", () => {
  it("le départ est la gare la plus basse, dans un sens comme dans l'autre", () => {
    assert.deepEqual(altitudesRemontee(1650, 2100), { depart: 1650, arrivee: 2100 });
    assert.deepEqual(altitudesRemontee(2100, 1650), { depart: 1650, arrivee: 2100 });
  });
  it("absentes si l'une des deux gares manque", () => {
    assert.equal(altitudesRemontee(1650, null), null);
    assert.equal(altitudesRemontee(undefined, 2100), null);
    assert.equal(altitudesRemontee(Number.NaN, 2100), null);
  });
});

describe("tempsAPied", () => {
  it("4,5 km/h, arrondi à 5 minutes", () => {
    assert.deepEqual(tempsAPied(750), { minutes: 10, moins: false });
    assert.deepEqual(tempsAPied(1500), { minutes: 20, moins: false });
    assert.deepEqual(tempsAPied(900), { minutes: 10, moins: false });
    assert.deepEqual(tempsAPied(1100), { minutes: 15, moins: false });
  });
  it("une courte distance se dit « moins de 5 min », pas 0", () => {
    assert.deepEqual(tempsAPied(120), { minutes: 5, moins: true });
    assert.deepEqual(tempsAPied(0), { minutes: 5, moins: true });
  });
  it("rien sans distance", () => {
    assert.equal(tempsAPied(null), null);
    assert.equal(tempsAPied(-3), null);
  });
});

// Deux tracés de forme simple, au format de public/pistes-traces/.
const BLEUE: TracePiste = { n: "Venosc", r: null, d: "easy", l: [[6.1200, 45.0100], [6.1220, 45.0100]] };
const ROUGE: TracePiste = { n: "Diable", r: null, d: "intermediate", l: [[6.1200, 45.0200], [6.1250, 45.0200]] };

describe("pisteLaPlusProche", () => {
  it("mesure jusqu'au tracé, pas jusqu'à son départ", () => {
    // 0,00054° de latitude au nord du milieu de la bleue : 60 m environ.
    const r = pisteLaPlusProche(45.01054, 6.121, [ROUGE, BLEUE]);
    assert.equal(r?.piste.n, "Venosc");
    assert.ok(r && Math.abs(r.m - 59.7) < 1, String(r?.m));
  });
  it("au-delà de la portée, aucune piste", () => {
    assert.equal(pisteLaPlusProche(45.1, 6.121, [ROUGE, BLEUE]), null);
  });
  it("rien sans tracé", () => {
    assert.equal(pisteLaPlusProche(45.01, 6.121, []), null);
  });
  it("un tracé d'un seul point se mesure aussi", () => {
    const r = pisteLaPlusProche(45.01, 6.12, [{ n: null, r: null, d: null, l: [[6.12, 45.01]] }]);
    assert.equal(r?.m, 0);
  });
});

describe("arrondiM", () => {
  it("au mètre sous 10 m, à la dizaine au-delà", () => {
    assert.equal(arrondiM(7.4), 7);
    assert.equal(arrondiM(59.7), 60);
    assert.equal(arrondiM(434), 430);
  });
});

describe("skisAuxPieds", () => {
  it("à 50 m ou moins, sur une position publiée", () => {
    assert.equal(skisAuxPieds(50, false), true);
    assert.equal(skisAuxPieds(12, false), true);
  });
  it("jamais au-delà de 50 m", () => {
    assert.equal(skisAuxPieds(51, false), false);
  });
  it("jamais sur une position approchée", () => {
    assert.equal(skisAuxPieds(10, true), false);
  });
  it("jamais sans mesure", () => {
    assert.equal(skisAuxPieds(null, false), false);
  });
});
