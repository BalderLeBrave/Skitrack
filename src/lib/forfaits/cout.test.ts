import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { coutForfaits } from "./cout.ts";

describe("coût des forfaits d'un groupe", () => {
  it("compte les enfants à leur tarif quand le domaine le publie", () => {
    // Les 3 Vallées : 359 € adulte, 287 € enfant.
    const c = coutForfaits(359, 287, 6, 2);
    assert.equal(c.total, 6 * 359 + 2 * 287);
    assert.equal(c.total, 2728);
    assert.equal(c.enfantsAuTarifAdulte, false);
    assert.equal(c.detail, "6 × 359 € adulte + 2 × 287 € enfant");
  });

  it("un groupe sans enfant coûte ce qu'il coûtait", () => {
    const c = coutForfaits(359, 287, 8, 0);
    assert.equal(c.total, 2872);
    assert.equal(c.detail, "8 × 359 € adulte");
  });

  it("sans tarif enfant relevé, les enfants sont comptés adulte — et c'est dit", () => {
    const c = coutForfaits(359, null, 6, 2);
    assert.equal(c.total, 8 * 359);
    assert.equal(c.enfantsAuTarifAdulte, true);
    assert.match(c.detail, /adulte, tarif enfant non relevé$/);
  });

  it("aucun tarif relevé : pas de total, pas de chiffre inventé", () => {
    const c = coutForfaits(null, 287, 6, 2);
    assert.equal(c.total, null);
    assert.equal(c.detail, "aucun tarif relevé");
  });

  it("un groupe tout enfant n'écrit pas « 0 × adulte »", () => {
    const c = coutForfaits(359, 287, 0, 3);
    assert.equal(c.total, 861);
    assert.equal(c.detail, "3 × 287 € enfant");
  });
});
