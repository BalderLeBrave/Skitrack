import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyExtracted, emptyRow, isStale, lockManual, markFailure, markStaleIfNeeded } from "./store.ts";

describe("forfait store", () => {
  it("n’écrase pas un manuel verrouillé", () => {
    const locked = lockManual(emptyRow("tignes"), { j1: 80, j6: 999 }, "2026-09-01T10:00:00.000Z");
    const { row, outcome } = applyExtracted(
      locked,
      { j1: 71, j6: 355, enf6: 284, kind: "table" },
      "https://www.tignes.net/forfaits",
      "2026-09-09T10:00:00.000Z",
    );
    assert.equal(outcome, "skipped_manual");
    assert.equal(row.j6, 999);
    assert.equal(row.status, "manuel");
    assert.equal(row.locked, true);
  });

  it("conserve l’ancien prix sur échec", () => {
    const ok = applyExtracted(
      emptyRow("tignes"),
      { j1: 71, j6: 355, enf6: null, kind: "jsonld" },
      "https://www.tignes.net/forfaits",
      "2026-09-09T08:00:00.000Z",
    ).row;
    const failed = markFailure(ok, "HTTP 503", "2026-09-09T09:00:00.000Z");
    assert.equal(failed.j6, 355);
    assert.equal(failed.status, "stale");
    assert.equal(failed.lastError, "HTTP 503");
  });

  it("marque stale après le TTL", () => {
    const row = applyExtracted(
      emptyRow("clusaz"),
      { j1: 50, j6: 250, enf6: null, kind: "pattern" },
      "https://www.laclusaz.com/forfaits",
      "2026-09-08T10:00:00.000Z",
    ).row;
    const now = Date.parse("2026-09-09T21:00:00.000Z");
    assert.equal(isStale(row, 4 * 3600_000, now), true);
    assert.equal(markStaleIfNeeded(row, 4 * 3600_000, now).status, "stale");
  });

  it("un échec isolé ne touche pas un autre slug", () => {
    const a = applyExtracted(
      emptyRow("tignes"),
      { j1: 71, j6: 355, enf6: null, kind: "jsonld" },
      "https://www.tignes.net/forfaits",
      "2026-09-09T08:00:00.000Z",
    ).row;
    const b = markFailure(emptyRow("isolé"), "timeout", "2026-09-09T08:00:00.000Z");
    assert.equal(a.j6, 355);
    assert.equal(a.status, "ok");
    assert.equal(b.status, "erreur");
    assert.equal(b.j6, null);
  });
});
