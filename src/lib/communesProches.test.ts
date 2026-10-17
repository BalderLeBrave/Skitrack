import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { foldName } from "./carte.ts";
import { communesPour, stationIdDeLaCommune } from "./communesProches.ts";

describe("une commune propose son domaine, sinon la station la plus proche", () => {
  it("Lamoura est le domaine des Rousses, pas Monts Jura dont le pin est plus près", () => {
    assert.equal(stationIdDeLaCommune("Lamoura"), "les-rousses");
    assert.equal(stationIdDeLaCommune("lamoura"), "les-rousses");
    const [c] = communesPour(foldName("Lamoura"));
    assert.equal(c?.nom, "Lamoura");
    assert.equal(c?.stationId, "les-rousses");
  });

  it("Prémanon et Bois-d'Amont skient aussi aux Rousses", () => {
    assert.equal(stationIdDeLaCommune("Prémanon"), "les-rousses");
    assert.equal(stationIdDeLaCommune("Bois-d'Amont"), "les-rousses");
  });

  it("Lélex n'a pas d'autre domaine : Monts Jura, la plus proche", () => {
    assert.equal(stationIdDeLaCommune("Lélex"), "monts-jura");
  });

  it("une saisie trop courte ne choisit rien", () => {
    assert.equal(stationIdDeLaCommune("la"), null);
    assert.deepEqual(communesPour("la"), []);
  });
});
