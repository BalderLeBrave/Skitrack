import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { skyKindOf, skyLabelOf } from "./forecast.server.ts";

describe("skyKindOf — quatre familles, celles que la fiche sait dessiner", () => {
  it("le verglas et l'orage ne sont pas des journées couvertes", () => {
    // Bruine verglaçante, pluie verglaçante, orage : la maquette les range en
    // « pluie » (App.dc.html:812), le code les laissait tomber sur « nuage ».
    for (const code of [56, 57, 66, 67, 95, 96, 99]) {
      assert.equal(skyKindOf(code), "rain", `code ${code}`);
    }
  });

  it("garde les familles déjà justes", () => {
    for (const code of [0, 1]) assert.equal(skyKindOf(code), "sun", `code ${code}`);
    for (const code of [71, 73, 75, 77, 85, 86]) assert.equal(skyKindOf(code), "snow", `code ${code}`);
    for (const code of [51, 53, 55, 61, 63, 65, 80, 81, 82]) {
      assert.equal(skyKindOf(code), "rain", `code ${code}`);
    }
    for (const code of [2, 3, 45, 48]) assert.equal(skyKindOf(code), "cloud", `code ${code}`);
  });

  it("un code absent se dessine en nuage, faute de mieux", () => {
    assert.equal(skyKindOf(null), "cloud");
    assert.equal(skyKindOf(undefined), "cloud");
  });

  it("le dessin et le nom disent la même chose de l'orage", () => {
    for (const code of [95, 96, 99]) {
      assert.equal(skyLabelOf(code), "storm", `code ${code}`);
      assert.notEqual(skyKindOf(code), "cloud", `code ${code}`);
    }
  });
});
