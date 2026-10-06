import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { forfaitsAjoutables, parPersonne, totalSejour } from "./totalSejour.ts";

const LOGEMENT = { total: 4016, currency: "EUR", title: "Grand appt 3 chambres", skiPassIncluded: null };
const FORFAITS = { total: 590, devise: "EUR" };

describe("totalSejour", () => {
  it("le logement seul, ou avec les forfaits du groupe", () => {
    assert.deepEqual(totalSejour(LOGEMENT, FORFAITS, false), { total: 4016, forfaitsAjoutes: false });
    assert.deepEqual(totalSejour(LOGEMENT, FORFAITS, true), { total: 4606, forfaitsAjoutes: true });
  });
  it("un séjour vendu forfaits compris ne les compte pas deux fois", () => {
    assert.deepEqual(totalSejour({ ...LOGEMENT, skiPassIncluded: true }, FORFAITS, true), { total: 4016, forfaitsAjoutes: false });
    assert.deepEqual(
      totalSejour({ ...LOGEMENT, title: "Belambra Clubs Arc 2000 - Ski Pass Included" }, FORFAITS, true),
      { total: 4016, forfaitsAjoutes: false },
    );
  });
  it("un prix non publié ne se complète pas", () => {
    assert.deepEqual(totalSejour({ ...LOGEMENT, total: 0 }, FORFAITS, true), { total: null, forfaitsAjoutes: false });
  });
  it("des forfaits sans prix, ou dans une autre devise, ne s'ajoutent pas", () => {
    assert.deepEqual(totalSejour(LOGEMENT, { total: null, devise: "EUR" }, true), { total: 4016, forfaitsAjoutes: false });
    assert.deepEqual(totalSejour(LOGEMENT, { total: 590, devise: "CHF" }, true), { total: 4016, forfaitsAjoutes: false });
    assert.deepEqual(totalSejour(LOGEMENT, null, true), { total: 4016, forfaitsAjoutes: false });
  });
});

describe("forfaitsAjoutables", () => {
  it("dans la même devise, hors forfaits compris, avec un prix", () => {
    assert.equal(forfaitsAjoutables(LOGEMENT, FORFAITS), true);
    assert.equal(forfaitsAjoutables(LOGEMENT, undefined), false);
  });
});

describe("parPersonne", () => {
  it("au centime", () => {
    assert.equal(parPersonne(4606, 3), 1535.33);
    assert.equal(parPersonne(4016, 2), 2008);
  });
  it("rien sans total ni voyageur", () => {
    assert.equal(parPersonne(null, 2), null);
    assert.equal(parPersonne(4016, 0), null);
  });
});
