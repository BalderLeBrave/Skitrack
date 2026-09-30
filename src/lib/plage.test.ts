import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dansPlage,
  decoderPlage,
  encoderPlage,
  plageActive,
  plageCourte,
  plageDepuisSeuil,
  plageLue,
  plageTexte,
  poserBorne,
} from "./plage.ts";

const B: readonly [number, number] = [0, 2400];

describe("poser une borne", () => {
  it("au curseur, la valeur s'arrondit au pas", () => {
    assert.deepEqual(poserBorne(null, B, 100, 0, 1849), [1800, 2400]);
    assert.deepEqual(poserBorne(null, B, 100, 1, 1851), [0, 1900]);
  });

  it("tapée, elle est gardée telle quelle : c'est tout l'intérêt de la saisie", () => {
    assert.deepEqual(poserBorne(null, B, 100, 0, 1850, true), [1850, 2400]);
    assert.deepEqual(poserBorne([1850, 2400], B, 100, 1, 2075, true), [1850, 2075]);
    assert.deepEqual(poserBorne(null, [0, 600], 10, 1, 12.5, true), [0, 12.5]);
  });

  it("tapée ou non, elle reste dans l'échelle et ne croise pas l'autre", () => {
    assert.deepEqual(poserBorne([1000, 2000], B, 100, 0, 9000, true), [2000, 2000]);
    assert.deepEqual(poserBorne([1000, 2000], B, 100, 1, -50, true), [1000, 1000]);
    assert.deepEqual(poserBorne([1000, 2000], B, 100, 1, 9000, true), [1000, 2400]);
  });

  it("toute l'échelle couverte, la fourchette ne filtre plus", () => {
    assert.equal(poserBorne([1000, 2400], B, 100, 0, 0, true), null);
    assert.equal(poserBorne([0, 1000], B, 100, 1, 2400), null);
  });

  it("ce qui n'est pas un nombre ne change rien", () => {
    const pl = [1000, 2000] as const;
    assert.equal(poserBorne(pl, B, 100, 0, Number.NaN, true), pl);
  });
});

describe("filtrer", () => {
  it("les deux bornes comptent, bornes comprises", () => {
    assert.equal(dansPlage(1800, [1800, 2000], B), true);
    assert.equal(dansPlage(2000, [1800, 2000], B), true);
    assert.equal(dansPlage(1799, [1800, 2000], B), false);
    assert.equal(dansPlage(2001, [1800, 2000], B), false);
  });

  it("une borne au bout de l'échelle ne borne pas : « et plus », « jusqu'à »", () => {
    assert.equal(dansPlage(3600, [1800, 2400], B), true);
    assert.equal(dansPlage(-10, [0, 1200], B), true);
  });

  it("une fourchette active écarte l'absence ; au repos, elle garde tout", () => {
    assert.equal(dansPlage(null, [0, 1200], B), false);
    assert.equal(dansPlage(undefined, [1800, 2400], B), false);
    assert.equal(dansPlage(Number.NaN, [1800, 2400], B), false);
    assert.equal(dansPlage(null, null, B), true);
  });
});

describe("libellés", () => {
  const m = (v: number) => `${v} m`;

  it("en toutes lettres", () => {
    assert.equal(plageTexte(null, B, m), "Indifférent");
    assert.equal(plageTexte([0, 2400], B, m), "Indifférent");
    assert.equal(plageTexte([1800, 2400], B, m), "1800 m et plus");
    assert.equal(plageTexte([0, 1200], B, m), "jusqu’à 1200 m");
    assert.equal(plageTexte([1800, 2000], B, m), "1800 m à 2000 m");
    assert.equal(plageTexte([1800, 1800], B, m), "1800 m");
    assert.equal(plageTexte([2400, 2400], B, m), "2400 m et plus");
  });

  it("en abrégé", () => {
    assert.equal(plageCourte(null, B), "");
    assert.equal(plageCourte([1800, 2400], B), "≥ 1 800");
    assert.equal(plageCourte([0, 1200], B), "≤ 1 200");
    assert.equal(plageCourte([1800, 2000], B), "1 800–2 000");
  });

  it("par défaut, les milliers s'écrivent avec une espace simple", () => {
    assert.equal(plageTexte([1800, 2400], B), "1 800 et plus");
  });

  it("n'écrit ni apostrophe droite ni tiret cadratin", () => {
    for (const t of [plageTexte([0, 1200], B), plageTexte([1, 2], B)]) {
      assert.ok(!t.includes("'"), t);
      assert.ok(!t.includes("—"), t);
    }
  });
});

describe("relire une fourchette", () => {
  it("une paire de nombres, remise dans l'échelle et dans l'ordre", () => {
    assert.deepEqual(plageLue([2000, 1800], B), [1800, 2000]);
    assert.deepEqual(plageLue([-100, 9000], [0, 600]), null);
    assert.deepEqual(plageLue([100, 9000], [0, 600]), [100, 600]);
  });

  it("ce qui n'est pas une paire de nombres est oublié", () => {
    assert.equal(plageLue(1800, B), null);
    assert.equal(plageLue([1800], B), null);
    assert.equal(plageLue(["1800", 2400], B), null);
    assert.equal(plageLue([1800, Number.POSITIVE_INFINITY], B), null);
  });

  it("un ancien seuil : « au moins » jusqu'au bout, « au plus » depuis zéro", () => {
    assert.deepEqual(plageDepuisSeuil(1800, B), [1800, 2400]);
    assert.deepEqual(plageDepuisSeuil(350, [0, 400], true), [0, 350]);
    assert.equal(plageDepuisSeuil(0, B), null);
    assert.equal(plageDepuisSeuil("1800", B), null);
  });

  it("une fourchette active est plus étroite que l'échelle", () => {
    assert.equal(plageActive(null, B), false);
    assert.equal(plageActive([0, 2400], B), false);
    assert.equal(plageActive([0, 2300], B), true);
  });
});

describe("dans une adresse", () => {
  it("une borne au bout de l'échelle ne s'écrit pas", () => {
    assert.equal(encoderPlage([1800, 2400], B), "1800-");
    assert.equal(encoderPlage([0, 1200], B), "-1200");
    assert.equal(encoderPlage([1800, 2000], B), "1800-2000");
    assert.equal(encoderPlage(null, B), null);
    assert.equal(encoderPlage([0, 2400], B), null);
  });

  it("aller-retour, décimales comprises", () => {
    for (const pl of [[1800, 2400], [0, 1200], [1850, 2075], [0, 12.5]] as const) {
      assert.deepEqual(decoderPlage(encoderPlage(pl, B), B), pl);
    }
  });

  it("un nombre seul est un ancien seuil", () => {
    assert.deepEqual(decoderPlage("1800", B), [1800, 2400]);
    assert.deepEqual(decoderPlage("350", [0, 400], true), [0, 350]);
  });

  it("l'illisible est ignoré, jamais deviné", () => {
    for (const t of ["", "-", "abc", "1-2-3", "1800-x", "--100"]) {
      assert.equal(decoderPlage(t, B), null, t);
    }
    assert.equal(decoderPlage(null, B), null);
  });
});
