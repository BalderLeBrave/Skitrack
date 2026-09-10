import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { STRINGS } from "./catalog.ts";

describe("i18n", () => {
  it("chaque clé FR a un équivalent EN", () => {
    const fr = Object.keys(STRINGS.fr);
    const en = Object.keys(STRINGS.en);
    assert.deepEqual(fr.sort(), en.sort());
  });

  it("FR parle de remontées mécaniques", () => {
    assert.ok(STRINGS.fr["dist.lifts.unmeasured"].includes("remontées mécaniques"));
    assert.ok(STRINGS.fr["sheet.lift"].includes("remontées mécaniques"));
  });
});
