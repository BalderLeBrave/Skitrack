import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickRoundRobin } from "./autoSync.ts";
import { FORFAIT_CATALOG } from "./forfaits/catalog.ts";
import { SKIINFO } from "./skiinfo.ts";

describe("sync automatique", () => {
  it("prend les périmés en rond, sans doublon dans un tour", () => {
    const ids = ["a", "b", "c", "d"];
    const stale = new Set(["b", "d"]);
    const first = pickRoundRobin(ids, 0, 2, (id) => stale.has(id));
    assert.deepEqual(first.picked, ["b", "d"]);
    const second = pickRoundRobin(ids, first.next, 2, (id) => stale.has(id));
    assert.deepEqual(second.picked, ["b", "d"]);
    const none = pickRoundRobin(ids, 0, 3, () => false);
    assert.deepEqual(none.picked, []);
    assert.equal(none.scanned, 4);
  });

  it("files FR only : forfaits catalogue + 231 Skiinfo", () => {
    const passes = FORFAIT_CATALOG.filter((d) => d.country === "FR");
    assert.ok(passes.length >= 100);
    assert.ok(passes.every((d) => d.country === "FR"));
    assert.equal(Object.keys(SKIINFO).length, 231);
  });
});
