import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { crawlDelayMs, INTERVALLE_MS, UA_AGENT, UA_SKITRACK } from "./politesse.ts";

describe("politesse du relevé tarifaire", () => {
  it("l'identification est honnête : ni navigateur, ni système d'exploitation", () => {
    assert.ok(UA_SKITRACK.startsWith(`${UA_AGENT}/`));
    for (const mot of ["Mozilla", "Chrome", "Safari", "Windows", "AppleWebKit", "Gecko"]) {
      assert.ok(!UA_SKITRACK.includes(mot), `l'en-tête ne doit pas contenir « ${mot} »`);
    }
  });

  it("lit le Crawl-delay du groupe applicable", () => {
    const txt = ["User-agent: *", "Crawl-delay: 5", "Disallow: /prive"].join("\n");
    assert.equal(crawlDelayMs(txt), 5000);
  });

  it("préfère la valeur publiée pour notre agent", () => {
    const txt = [
      "User-agent: *",
      "Crawl-delay: 1",
      "",
      `User-agent: ${UA_AGENT}`,
      "Crawl-delay: 10",
    ].join("\n");
    assert.equal(crawlDelayMs(txt), 10_000);
  });

  it("ignore un Crawl-delay destiné à un autre robot", () => {
    const txt = ["User-agent: GoogleBot", "Crawl-delay: 30"].join("\n");
    assert.equal(crawlDelayMs(txt), null);
  });

  it("rend null quand le fichier est illisible ou muet", () => {
    assert.equal(crawlDelayMs(null), null);
    assert.equal(crawlDelayMs(""), null);
    assert.equal(crawlDelayMs("User-agent: *\nDisallow:"), null);
  });

  it("l'intervalle minimal par défaut reste au moins deux secondes", () => {
    assert.ok(INTERVALLE_MS >= 2000);
  });
});
