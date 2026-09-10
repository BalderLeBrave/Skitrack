import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allowsPath, parseRobots, robotsAllows } from "./robots.ts";

describe("robots", () => {
  it("n’extrait aucune règle et autorise tout", () => {
    assert.deepEqual(parseRobots("User-agent: *\nDisallow: /"), []);
    assert.deepEqual(robotsAllows([], "/s/homes"), { allowed: true, rule: null });
  });

  it("n’appelle jamais le fetcher", async () => {
    let called = 0;
    const verdict = await allowsPath("https://example.test", "/robots.txt", async () => {
      called += 1;
      return { status: 200, text: "Disallow: /" };
    });
    assert.equal(called, 0);
    assert.equal(verdict.allowed, true);
  });
});
