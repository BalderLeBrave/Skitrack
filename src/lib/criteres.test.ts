import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decoderCriteres, encoderCriteres, porteDesCriteres, type Criteres } from "./criteres.ts";

describe("critères dans l'adresse", () => {
  it("un critère au repos ne s'écrit pas", () => {
    assert.equal(encoderCriteres({}), "");
    assert.equal(encoderCriteres({ v: null, km: null, tri: "km", unite: "pct" }), "");
    // Une fourchette sur toute l'échelle ne filtre rien, un tri dans son sens
    // de départ non plus.
    assert.equal(encoderCriteres({ v: [0, 2400], tri: "pass", sens: 1 }), "tri=pass");
  });

  it("aller-retour complet", () => {
    const c: Criteres = {
      q: "chamonix",
      massif: "Alpes du Nord",
      v: [1800, 2400],
      hi: [3000, 3500],
      km: [300, 450],
      pass: [0, 350],
      budget: [1000, 2500],
      dom: "Paradiski",
      col: { green: [20, 200], black: [0, 5] },
      chips: ["glacier", "big"],
      tri: "hi",
      sens: 1,
      unite: "km",
      du: "2027-02-06",
      au: "2027-02-13",
      pers: 8,
      ch: 3,
    };
    const lu = decoderCriteres(encoderCriteres(c));
    assert.equal(lu.q, "chamonix");
    assert.equal(lu.massif, "Alpes du Nord");
    assert.deepEqual(lu.v, [1800, 2400]);
    assert.deepEqual(lu.hi, [3000, 3500]);
    assert.deepEqual(lu.km, [300, 450]);
    assert.deepEqual(lu.pass, [0, 350]);
    assert.deepEqual(lu.budget, [1000, 2500]);
    assert.deepEqual(lu.col, { green: [20, 200], black: [0, 5] });
    assert.deepEqual(lu.chips, ["glacier", "big"]);
    assert.equal(lu.tri, "hi");
    assert.equal(lu.sens, 1);
    assert.equal(lu.unite, "km");
    assert.equal(lu.du, "2027-02-06");
    assert.equal(lu.pers, 8);
    assert.equal(lu.ch, 3);
  });

  it("une fourchette s'écrit par ses bornes, sans celle qui touche le bout de l'échelle", () => {
    const qs = encoderCriteres({ v: [1800, 2400], pass: [0, 300], km: [100, 300] });
    const p = new URLSearchParams(qs);
    assert.equal(p.get("v"), "1800-");
    assert.equal(p.get("pass"), "-300");
    assert.equal(p.get("km"), "100-300");
  });

  it("un ancien lien à seuil ouvre la même recherche", () => {
    // « au moins » pour les altitudes, les km et les couleurs, « au plus » pour
    // le forfait et le budget.
    const lu = decoderCriteres("?v=1800&km=300&pass=350&budget=2500&col=green:20");
    assert.deepEqual(lu.v, [1800, 2400]);
    assert.deepEqual(lu.km, [300, 600]);
    assert.deepEqual(lu.pass, [0, 350]);
    assert.deepEqual(lu.budget, [0, 2500]);
    assert.deepEqual(lu.col, { green: [20, 60] });
  });

  it("le sens du tri ne s'écrit que s'il n'est pas celui de départ", () => {
    assert.equal(encoderCriteres({ tri: "hi", sens: -1 }), "tri=hi");
    assert.equal(encoderCriteres({ tri: "hi", sens: 1 }), "tri=hi&sens=croissant");
    assert.equal(encoderCriteres({ tri: "n", sens: -1 }), "tri=n&sens=decroissant");
    assert.equal(decoderCriteres("?tri=n&sens=decroissant").sens, -1);
    assert.equal(decoderCriteres("?sens=nimporte").sens, undefined);
  });

  it("une valeur illisible est ignorée, jamais devinée", () => {
    const lu = decoderCriteres("?v=beaucoup&km=1-2-3&tri=nimporte&unite=x&du=hier&pers=-3&chips=inconnu");
    assert.equal(lu.v, undefined);
    assert.equal(lu.km, undefined);
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
    assert.equal(porteDesCriteres("?v=1800-"), true);
  });
});
