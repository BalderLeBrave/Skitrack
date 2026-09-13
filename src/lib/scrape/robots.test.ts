import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allowsPath, forgetRobots, parseRobots, robotsAllows } from "./robots.ts";

describe("robots", () => {
  it("lit Disallow: / (widget Gîtes) sans l’appliquer à l’extraction", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /");
    assert.deepEqual(rules, [{ allow: false, path: "/" }]);
    assert.equal(robotsAllows(rules, "/fiche-38G123.html").allowed, false);
  });

  it("reconnaît /s/*/* Airbnb et /api Cozy", () => {
    const airbnb = parseRobots("User-agent: *\nDisallow: /s/*/*\nAllow: /s/guidebooks");
    assert.equal(robotsAllows(airbnb, "/s/les-2-alpes/homes").allowed, false);
    const cozy = parseRobots("User-agent: *\nDisallow: /api\nDisallow: /*/search");
    assert.equal(robotsAllows(cozy, "/api/getResultList").allowed, false);
    assert.equal(robotsAllows(cozy, "/fr/search/foo").allowed, false);
  });

  it("sans règle : autorisé", () => {
    assert.deepEqual(robotsAllows([], "/s/homes"), { allowed: true, rule: null });
  });

  it("lit le fetcher puis autorise quand même", async () => {
    forgetRobots();
    let called = 0;
    const verdict = await allowsPath("https://example.test", "/s/foo/homes", async () => {
      called += 1;
      return { status: 200, text: "User-agent: *\nDisallow: /s/*/*" };
    });
    assert.equal(called, 1);
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.rule, "Disallow: /s/*/*");
    const again = await allowsPath("https://example.test", "/api", async () => {
      called += 1;
      return { status: 200, text: "should-not-run" };
    });
    assert.equal(called, 1);
    assert.equal(again.allowed, true);
  });
});
