// La table des webcams de l'application est bien celle que le relevé versionné
// produit : ni retouchée à la main, ni en retard sur son générateur.

import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { genererTable } from "./generer.mjs";

const sansCR = (s) => s.replace(/\r\n/g, "\n");

describe("table des webcams", () => {
  it("le relevé versionné reproduit src/lib/webcams.data.ts à l'identique", () => {
    const attendu = readFileSync(new URL("../../src/lib/webcams.data.ts", import.meta.url), "utf8");
    assert.equal(sansCR(genererTable()), sansCR(attendu));
  });
});
