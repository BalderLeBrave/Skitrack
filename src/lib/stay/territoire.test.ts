import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  codeDepartement,
  deptCompatible,
  deptDepuisAnnonce,
  territoireReasonFor,
} from "./territoire.ts";

describe("territoire : un gîte de la Manche n'est pas à Flumet", () => {
  it("lit le département dans le code et dans l'URL", () => {
    assert.equal(codeDepartement("Savoie"), "73");
    assert.equal(codeDepartement("Haute-Savoie"), "74");
    assert.equal(codeDepartement("manche"), "50");
    assert.equal(
      deptDepuisAnnonce({
        id: "50G1140",
        url: "https://www.gites-de-france.com/fr/normandie/manche/gite-communal-de-glatigny-50g1140",
      }),
      "50",
    );
    assert.equal(
      deptDepuisAnnonce({
        url: "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/savoie/chalet-le-fay-73g52010",
      }),
      "73",
    );
  });

  it("Savoie accepte la Haute-Savoie, pas la Manche ni la Creuse", () => {
    assert.equal(deptCompatible("73", "73"), true);
    assert.equal(deptCompatible("74", "73"), true);
    assert.equal(deptCompatible("38", "73"), true);
    assert.equal(deptCompatible("50", "73"), false);
    assert.equal(deptCompatible("23", "73"), false);
    assert.equal(deptCompatible("35", "73"), false);
  });

  it("écarte le gîte dont l'URL dit un autre territoire", () => {
    const manche = {
      id: "50G1140",
      source: "Gîtes de France",
      url: "https://www.gites-de-france.com/fr/normandie/manche/gite-communal-de-glatigny-50g1140",
    };
    assert.equal(territoireReasonFor(manche, "Savoie"), "autre-domaine");
    assert.equal(territoireReasonFor(manche, "Manche"), null);

    const fay = {
      id: "73G52010",
      url: "https://www.gites-de-france.com/fr/auvergne-rhone-alpes/savoie/chalet-le-fay-73g52010",
    };
    assert.equal(territoireReasonFor(fay, "Savoie"), null);
  });
});
