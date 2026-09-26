import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decoderCriteres, encoderCriteres, porteDesCriteres, type Criteres } from "./criteres.ts";

describe("critères dans l'adresse", () => {
  it("un critère au repos ne s'écrit pas", () => {
    assert.equal(encoderCriteres({}), "");
    assert.equal(encoderCriteres({ v: 0, km: 0, tri: "km", unite: "pct" }), "");
  });

  it("aller-retour complet", () => {
    const c: Criteres = {
      q: "chamonix",
      massif: "Alpes du Nord",
      v: 1800,
      hi: 3000,
      km: 300,
      pass: 350,
      budget: 2500,
      dom: "Paradiski",
      col: { green: 20, black: 5 },
      chips: ["glacier", "big"],
      tri: "hi",
      unite: "km",
      du: "2027-02-06",
      au: "2027-02-13",
      pers: 8,
      ch: 3,
    };
    const lu = decoderCriteres(encoderCriteres(c));
    assert.equal(lu.q, "chamonix");
    assert.equal(lu.massif, "Alpes du Nord");
    assert.equal(lu.v, 1800);
    assert.equal(lu.budget, 2500);
    assert.deepEqual(lu.col, { green: 20, black: 5 });
    assert.deepEqual(lu.chips, ["glacier", "big"]);
    assert.equal(lu.tri, "hi");
    assert.equal(lu.unite, "km");
    assert.equal(lu.du, "2027-02-06");
    assert.equal(lu.pers, 8);
    assert.equal(lu.ch, 3);
  });

  it("une valeur illisible est ignorée, jamais devinée", () => {
    const lu = decoderCriteres("?v=beaucoup&tri=nimporte&unite=x&du=hier&pers=-3&chips=inconnu");
    assert.equal(lu.v, undefined);
    assert.equal(lu.tri, undefined);
    assert.equal(lu.unite, undefined);
    assert.equal(lu.du, undefined);
    assert.equal(lu.pers, undefined);
    assert.equal(lu.chips, undefined);
  });

  it("une station inconnue du référentiel n'est pas retenue", () => {
    assert.equal(decoderCriteres("?station=zermatt").station, undefined);
    assert.equal(decoderCriteres("?station=les-2-alpes").station, "les-2-alpes");
  });

  it("un identifiant retiré se lit sous celui qu'on garde", () => {
    // « espace-aubrac » doublait Laguiole, écarté le 26 septembre 2026 : un
    // ancien favori ouvre Laguiole, pas une station fantôme.
    const lu = decoderCriteres("?station=espace-aubrac");
    assert.equal(lu.station, "laguiole");
    assert.equal(lu.q, "Laguiole");
  });

  it("le nom de la station retenue n'est pas écrit deux fois", () => {
    const qs = encoderCriteres({ station: "les-2-alpes", q: "Les 2 Alpes" });
    assert.ok(qs.includes("station=les-2-alpes"));
    assert.ok(!qs.includes("q="), qs);
    // …et il est rendu à la lecture.
    assert.equal(decoderCriteres(qs).q, "Les 2 Alpes");
  });

  it("dit si une adresse porte des critères", () => {
    assert.equal(porteDesCriteres(""), false);
    assert.equal(porteDesCriteres("?page=2"), false);
    assert.equal(porteDesCriteres("?v=1800"), true);
  });
});
