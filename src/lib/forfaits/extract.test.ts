import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractForfaits } from "./extract.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(dir, "fixtures/tignes.html"), "utf8");

describe("extractForfaits", () => {
  it("lit j1 et j6 sur la fixture Tignes, sans inventer l’enfant", () => {
    const found = extractForfaits(html);
    assert.ok(found);
    assert.equal(found.j6, 355);
    assert.equal(found.j1, 71);
    assert.equal(found.enf6, null);
  });

  it("rend null sans montant", () => {
    assert.equal(extractForfaits(""), null);
    assert.equal(extractForfaits("<html><body>Bonjour</body></html>"), null);
  });
});
